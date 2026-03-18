<?php
// create.php — створення нової нотатки або оновлення існуючої
// ─────────────────────────────────────────────────────────
// POST  /create.php          → створення (повертає новий ID)
// POST  /create.php  {id}    → оновлення існуючої нотатки
//
// Тіло запиту (JSON):
//   id          string|null   не вказувати для створення; передати для оновлення
//   title       string
//   content     string
//   read_once   bool          видалити після першого перегляду
//   expire_in   int|null      час до завершення (в секундах, null = без обмеження)
//   password    string        відкритий текст; буде захешований (bcrypt) на сервері
//                             не передавати або "" — залишити як є / прибрати пароль
require __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';

    if (stripos($contentType, 'application/json') === false) {
        jsonResponse(['error' => 'Invalid Content-Type'], 415);
    }
}

rateLimit($_SERVER['REMOTE_ADDR']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

// ── розбір JSON запиту ────────────────────────────────────────────────────────
$raw = file_get_contents('php://input');
if ($raw === false || $raw === '') {
    jsonResponse(['error' => 'Empty request body'], 400);
}
$input = json_decode($raw, true);
if (!is_array($input)) {
    jsonResponse(['error' => 'Invalid request'], 400);
}

// ── валідація полів ──────────────────────────────────────────────
$id       = isset($input['id']) && $input['id'] !== '' ? (string)$input['id'] : null;
$title    = isset($input['title'])   ? mb_substr(trim((string)$input['title']), 0, 500) : '';
$content  = isset($input['content']) ? (string)$input['content'] : '';

if (strlen($content) > 100000) { // ~100KB
    jsonResponse(['error' => 'Content too large'], 413);
}

$readOnce = !empty($input['read_once']);
$expireIn = isset($input['expire_in']) && $input['expire_in'] !== null
            ? (int)$input['expire_in'] : null;
$password = isset($input['password']) ? (string)$input['password'] : '';

// ── хешування пароля ───────────────────────────────────────────────────────
$passwordHash = '';
if ($password !== '') {
    $passwordHash = password_hash($password, PASSWORD_BCRYPT);
}

// ── Час завершення (expiry timestamp) ───────────────────────────────────────────────────────
$expireAt = null;
if ($expireIn !== null && $expireIn > 0) {
    $expireAt = date('Y-m-d H:i:s', time() + $expireIn);
}

$db = getDB();

// ── оновлення існуючої нотатки ───────────────────────────────────────────────────
if ($id !== null) {

    $token = $input['edit_token'] ?? '';
	
	if (!$token) {
        jsonResponse(['error' => 'Missing edit_token'], 400);
    }

    $existing = $db->prepare("SELECT edit_token FROM notes WHERE id = ?");
    $existing->execute([$id]);
    $row = $existing->fetch();

    if (!$row) {
        jsonResponse(['error' => 'Note not found'], 404);
    }

    if ($row['edit_token'] !== $token) {
        jsonResponse(['error' => 'Unauthorized'], 403);
    }

    // формуємо динамічний UPDATE, щоб не перезаписати password_hash порожнім значенням, якщо новий пароль не був переданий
    $setClauses = [
        'title     = ?',
        'content   = ?',
        'read_once = ?',
        'expire_at = ?',
        'updated_at = NOW()',
    ];
    $params = [$title, $content, $readOnce ? 1 : 0, $expireAt];

    if ($passwordHash !== '') {
        $setClauses[] = 'password_hash = ?';
        $params[]     = $passwordHash;
    }

    $params[] = $id;   // для WHERE
    $sql = 'UPDATE notes SET ' . implode(', ', $setClauses) . ' WHERE id = ?';
    $db->prepare($sql)->execute($params);

    jsonResponse(['ok' => true, 'id' => $id]);
}

// ── СТВОРЕННЯ нової нотатки ────────────────────────────────────────────────
// генерує випадковий унікальний ID (16 hex-символів = 64-біт)
$newId = null;
$editToken = bin2hex(random_bytes(16));
$attempts = 0;
do {
    if ($attempts++ > 10) {
        jsonResponse(['error' => 'Could not generate unique ID'], 500);
    }
    $candidate = bin2hex(random_bytes(8)); // 16-char hex string
    $check = $db->prepare("SELECT id FROM notes WHERE id = ?");
    $check->execute([$candidate]);
} while ($check->fetch());
$newId = $candidate;

$stmt = $db->prepare(
    "INSERT INTO notes
       (id, title, content, read_once, expire_at, password_hash, edit_token, created_at, updated_at)
     VALUES
       (?,  ?,     ?,       ?,         ?,         ?,             ?,          NOW(),      NOW())"
);
$stmt->execute([
    $newId,
    $title,
    $content,
    $readOnce ? 1 : 0,
    $expireAt,
    $passwordHash,
    $editToken
]);

if ($stmt->rowCount() !== 1) {
    jsonResponse(['error' => 'Insert failed'], 500);
}

jsonResponse([
    'ok' => true,
    'id' => $newId,
    'edit_token' => $editToken
], 201);
