<?php
require_once __DIR__ . '/../lib/auth.php';
header('Content-Type: application/json');

$userId = require_auth();
$input = json_input();
$postId = (int)($input['post_id'] ?? 0);

$stmt = db()->prepare('SELECT user_id FROM board_posts WHERE id = ?');
$stmt->execute([$postId]);
$post = $stmt->fetch();

if (!$post) {
    json_error(404, 'Beitrag nicht gefunden');
}
if ((int)$post['user_id'] !== $userId) {
    json_error(403, 'Nur der Ersteller darf das ändern');
}

db()->prepare('UPDATE board_posts SET hidden = 1 WHERE id = ?')->execute([$postId]);

echo json_encode(['status' => 'ok']);
