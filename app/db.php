<?php
// db.php — підключення до бази даних та спільні допоміжні функції
// ─────────────────────────────────────────────
// відредагуйте ці чотири параметри перед розгортанням:
define('DB_HOST',    'localhost');
define('DB_NAME',    'noteflow');
define('DB_USER',    'your_db_user');
define('DB_PASS',    'your_db_password');
define('DB_CHARSET', 'utf8mb4');

// ── CORS заголовки (відправляються при кожному запиті) ─────────────────────
// У розгортанні для публічного доступу змініть ALLOWED_ORIGIN на ваш домен, наприклад: 'https://example.com'
define('ALLOWED_ORIGIN', '*');

function sendCorsHeaders(): void {
    header('Access-Control-Allow-Origin: '    . ALLOWED_ORIGIN);
    header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
    header('Access-Control-Max-Age: 86400');
}

// обробляємо pre-flight запит одразу, до виконання будь-якої іншої логіки
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    sendCorsHeaders();
    http_response_code(204);
    exit;
}

sendCorsHeaders();

// ── PDO ──────────────────────────────────────────────────────────
function getDB(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = sprintf(
            'mysql:host=%s;dbname=%s;charset=%s',
            DB_HOST, DB_NAME, DB_CHARSET
        );
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }
    return $pdo;
}

// ── допоміжна функція для JSON-відповіді ───────────────────────────────────────────────────
function jsonResponse(array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    // вимикаємо буферизацію виводу, щоб відповідь повністю відправилась перед завершенням виконання
    if (ob_get_level()) ob_end_clean();
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// ── видалення прострочених нотаток ───────────────────────────
function cleanupExpiredNotes(): void {
    try {
        getDB()->exec(
            "DELETE FROM notes WHERE expire_at IS NOT NULL AND expire_at < NOW()"
        );
    } catch (Throwable) {
        // не критично — ігноруємо помилки під час очищення
    }
}

function rateLimit($key, $limit = 60, $window = 60) {
    $file = sys_get_temp_dir() . '/ratelimit_' . md5($key);
    $now = time();

    $data = ['count' => 0, 'time' => $now];

    if (file_exists($file)) {
        $data = json_decode(file_get_contents($file), true);
        if (!is_array($data)) {
            $data = ['count' => 0, 'time' => $now];
        }
    }

    if ($now - $data['time'] > $window) {
        $data = ['count' => 0, 'time' => $now];
    }

    $data['count']++;

    if ($data['count'] > $limit) {
        jsonResponse(['error' => 'Too many requests'], 429);
    }

    file_put_contents($file, json_encode($data), LOCK_EX);
}