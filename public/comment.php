<?php
require_once __DIR__ . '/../lib/auth.php';
header('Content-Type: application/json');

$userId = require_auth();
$input = json_input();
$photoId = (int)($input['photo_id'] ?? 0);
$text = trim($input['text'] ?? '');

if (!$photoId || $text === '') {
    json_error(400, 'photo_id und text erforderlich');
}

$stmt = db()->prepare('INSERT INTO comments (photo_id, user_id, text) VALUES (?, ?, ?)');
$stmt->execute([$photoId, $userId, $text]);

echo json_encode(['status' => 'ok', 'comment_id' => (int)db()->lastInsertId()]);
