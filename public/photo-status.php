<?php
require_once __DIR__ . '/../lib/auth.php';
header('Content-Type: application/json');

require_auth();

$photoId = (int)($_GET['id'] ?? 0);
if (!$photoId) {
    json_error(400, 'id erforderlich');
}

$exists = db()->prepare('SELECT id FROM photos WHERE id = ?');
$exists->execute([$photoId]);
if (!$exists->fetch()) {
    json_error(404, 'Foto nicht gefunden');
}

$commentStmt = db()->prepare("
    SELECT c.text, c.created_at, u.id AS user_id, u.username
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.photo_id = ?
    ORDER BY c.created_at DESC
");
$commentStmt->execute([$photoId]);
$comments = $commentStmt->fetchAll();
foreach ($comments as &$c) {
    $c['username'] = $c['username'] ?: 'Gast';
    $c['avatar_url'] = build_avatar_url((int)$c['user_id']);
    unset($c['user_id']);
}
unset($c);

$emojiKeys = [
    "\u{2764}\u{FE0F}" => 'heart',
    "\u{1F602}"        => 'laugh',
    "\u{1F44D}"        => 'thumb',
    "\u{2B50}"         => 'star',
];
$counts = ['heart' => 0, 'laugh' => 0, 'thumb' => 0, 'star' => 0];
$reactionStmt = db()->prepare("SELECT emoji, COUNT(*) AS c FROM reactions WHERE photo_id = ? GROUP BY emoji");
$reactionStmt->execute([$photoId]);
foreach ($reactionStmt->fetchAll() as $r) {
    if (isset($emojiKeys[$r['emoji']])) {
        $counts[$emojiKeys[$r['emoji']]] = (int)$r['c'];
    }
}

echo json_encode([
    'id' => $photoId,
    'comment_count' => count($comments),
    'reaction_counts' => $counts,
    'comments' => $comments,
]);
