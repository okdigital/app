<?php
require_once __DIR__ . '/../lib/auth.php';
header('Content-Type: application/json');

$userId = require_auth();
$input = json_input();
$postId = (int)($input['post_id'] ?? 0);
$text = trim($input['text'] ?? '');

if (!$postId || $text === '' || strlen($text) > 500) {
    json_error(400, 'post_id und Text (max. 500 Zeichen) erforderlich');
}

$stmt = db()->prepare('SELECT comments_enabled, hidden FROM board_posts WHERE id = ?');
$stmt->execute([$postId]);
$post = $stmt->fetch();

if (!$post || $post['hidden']) {
    json_error(404, 'Beitrag nicht gefunden');
}
if (!$post['comments_enabled']) {
    json_error(403, 'Der Ersteller hat Kommentare für diesen Beitrag deaktiviert');
}

$insert = db()->prepare('INSERT INTO board_comments (post_id, user_id, text) VALUES (?, ?, ?)');
$insert->execute([$postId, $userId, $text]);

echo json_encode(['status' => 'ok']);
