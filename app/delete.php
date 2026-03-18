<?php
// delete.php — видалення нотатки за ID
// ──────────────────────────────────────────────────────────────────────────
// DELETE /delete.php?id=<noteId>
// POST   /delete.php  тіло: {"id":"<noteId>"}
// GET    /delete.php?id=<noteId>
require __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';

    if (stripos($contentType, 'application/json') === false) {
        jsonResponse(['error' => 'Invalid Content-Type'], 415);
    }
}

rateLimit($_SERVER['REMOTE_ADDR']);

// ── визначення ID ─────────────────────────────────────────────────────────────
$id = $_GET['id'] ?? null;

if (in_array($_SERVER['REQUEST_METHOD'], ['POST', 'DELETE'], true)) {
    $raw   = file_get_contents('php://input');
    $input = is_string($raw) ? json_decode($raw, true) : null;
    if (is_array($input) && isset($input['id'])) {
        $id = (string)$input['id'];
    }
}

if (!$id || $id === '') {
    jsonResponse(['error' => 'Missing note ID'], 400);
}

// ── видалення ─────────────────────────────────────────────────────────────────
$token = $input['edit_token'] ?? '';

$stmt = getDB()->prepare("SELECT edit_token FROM notes WHERE id = ?");
$stmt->execute([$id]);
$row = $stmt->fetch();

if (!$row) {
    jsonResponse(['error' => 'Note not found'], 404);
}

if ($row['edit_token'] !== $token) {
    jsonResponse(['error' => 'Unauthorized'], 403);
}

$stmt = getDB()->prepare("DELETE FROM notes WHERE id = ?");
$stmt->execute([(string)$id]);

if ($stmt->rowCount() > 0) {
    jsonResponse(['ok' => true, 'deleted' => $id]);
} else {
    jsonResponse(['error' => 'Note not found'], 404);
}
