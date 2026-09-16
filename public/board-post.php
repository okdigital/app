<?php
require_once __DIR__ . '/../lib/auth.php';
header('Content-Type: application/json');

$userId = require_auth();
$input = json_input();
$text = trim($input['text'] ?? '');

if ($text === '' || strlen($text) > 500) {
    json_error(400, 'Text darf nicht leer sein (max. 500 Zeichen)');
}

$stmt = db()->prepare('INSERT INTO board_posts (user_id, text) VALUES (?, ?)');
$stmt->execute([$userId, $text]);

echo json_encode(['status' => 'ok', 'id' => (int)db()->lastInsertId()]);
