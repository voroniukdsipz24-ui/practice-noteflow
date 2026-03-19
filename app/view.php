<?php
// view.php — отримання нотатки за її ID
// ──────────────────────────────────────────────────────────────────────────
// GET   /view.php?id=<noteId>
//       → повертає JSON нотатки або {"error":"password_required"} (401)
//
// POST  /view.php
//       тіло: {"id":"<noteId>","password":"<plain-text>"}
//       → відкриває нотатки з паролем; формат відповіді той самий
//
// При успіху відповідь містить:
//   id, title, content, read_once (bool), expire_at (ISO рядок|null),
//   created_at, updated_at, has_password (bool),
//   destroyed (bool, присутній лише якщо read_once = true)
//
// Важливо: для read_once нотаток запис видаляється ПІСЛЯ відправки JSON-відповіді.
require __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';

    if (stripos($contentType, 'application/json') === false) {
        jsonResponse(['error' => 'Invalid Content-Type'], 415);
    }
}

rateLimit($_SERVER['REMOTE_ADDR']);

// очищення прострочених нотаток при кожному запиті на перегляд (DELETE)
cleanupExpiredNotes();

if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'POST'], true)) {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

// ── визначення ID та (за потреби) пароля ──────────────────────────────────────
$id              = $_GET['id'] ?? null;
$passwordAttempt = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw   = file_get_contents('php://input');
    $input = is_string($raw) ? json_decode($raw, true) : null;
    if (is_array($input)) {
        if (isset($input['id']))       $id              = (string)$input['id'];
        if (isset($input['password'])) $passwordAttempt = (string)$input['password'];
    }
}

if (!$id || $id === '') {
    jsonResponse(['error' => 'Missing note ID'], 400);
}
$id = (string)$id;

// ── отримання нотатки ─────────────────────────────────────────────────────────
$db   = getDB();
$stmt = $db->prepare("SELECT * FROM notes WHERE id = ?");
$stmt->execute([$id]);
$note = $stmt->fetch();

if (!$note) {
    jsonResponse(['error' => 'Note not found or has been deleted'], 404);
}

rateLimit($_SERVER['REMOTE_ADDR'] . '_note_' . $id, 5, 60);

// ── перевірка терміну дії (додатковий захист поверх cleanupExpiredNotes) ───────
if ($note['expire_at'] !== null && strtotime($note['expire_at']) < time()) {
    $db->prepare("DELETE FROM notes WHERE id = ?")->execute([$id]);
    jsonResponse(['error' => 'Note has expired'], 410);
}

// ── Перевірка пароля ──────────────────────────────────────────────────────────
if ($note['password_hash'] !== '') {
    if ($passwordAttempt === null) {
        // повідомляємо, що потрібен пароль
        jsonResponse([
            'error'   => 'password_required',
            'message' => 'This note is password-protected.',
        ], 401);
    }
    if (!password_verify($passwordAttempt, $note['password_hash'])) {
        jsonResponse([
            'error'   => 'wrong_password',
            'message' => 'Incorrect password.',
        ], 403);
    }
}

// ── формуємо безпечну відповідь (не повертаємо password_hash!) ──────────────────────
$response = [
    'id'           => $note['id'],
    'title'        => $note['title'],
    'content'      => $note['content'],
    'read_once'    => (bool)(int)$note['read_once'],
    'expire_at'    => $note['expire_at'],      // рядок DATETIME MySQL або null
    'created_at'   => $note['created_at'],
    'updated_at'   => $note['updated_at'],
    'has_password' => $note['password_hash'] !== '',
];

// ── Read-once: спочатку повністю відправляємо відповідь клієнту, ПОТІМ видаляємо запис ──
// Потрібно гарантувати, що клієнт отримає вміст до видалення рядка.
// Стратегія:
//   1. Сформувати JSON-відповідь
//   2. Встановити Content-Length, щоб клієнт знав точний розмір відповіді
//   3. Очистити всі буфери виводу та завершити HTTP-відповідь
//   4. Лише після цього виконати DELETE
if ((bool)(int)$note['read_once']) {
    $response['destroyed'] = true;

    $json = json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    // очищаємо будь-який буферизований вивід
    while (ob_get_level() > 0) {
        ob_end_clean();
    }

    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
	header('X-Content-Type-Options: nosniff');
	header('X-Frame-Options: DENY');
	header("Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none';");
    header('Content-Length: ' . strlen($json));
    // забороняємо кешування цієї одноразової відповіді проксі або CDN
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('Pragma: no-cache');

    echo $json;

    // відправляємо відповідь клієнту
    if (function_exists('fastcgi_finish_request')) {
        // PHP-FPM: завершуємо HTTP-відповідь без зупинки виконання PHP
        fastcgi_finish_request();
    } else {
        // резервний варіант для Apache mod_php
        if (function_exists('apache_response_headers')) {
            ob_start();
        }
        flush();
    }

    // клієнт отримав відповідь — тепер безпечно видаляти
    $db->prepare("DELETE FROM notes WHERE id = ?")->execute([$id]);
    exit;
}

jsonResponse($response);
