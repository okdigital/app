<?php
require_once __DIR__ . '/../lib/auth.php';
header('Content-Type: application/json');

$userId = require_auth();

// ?mine=1 -> nur eigene Beiträge (auch ausgeblendete), für "Meine Nachrichten"
// ohne Parameter -> öffentliches Schwarzes Brett, nur sichtbare Beiträge
$mine = !empty($_GET['mine']);

if ($mine) {
    $sql = "
        SELECT bp.id, bp.text, bp.created_at, bp.comments_enabled, bp.hidden, bp.user_id, u.username
        FROM board_posts bp
        JOIN users u ON u.id = bp.user_id
        WHERE bp.user_id = ?
        ORDER BY bp.created_at DESC
        LIMIT 200
    ";
    $params = [$userId];
} else {
    $sql = "
        SELECT bp.id, bp.text, bp.created_at, bp.comments_enabled, bp.hidden, bp.user_id, u.username
        FROM board_posts bp
        JOIN users u ON u.id = bp.user_id
        WHERE bp.hidden = 0
        ORDER BY bp.created_at DESC
        LIMIT 100
    ";
    $params = [];
}

$stmt = db()->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll();

$commentStmt = db()->prepare("
    SELECT bc.text, bc.created_at, u.username, u.id AS user_id
    FROM board_comments bc
    JOIN users u ON u.id = bc.user_id
    WHERE bc.post_id = ?
    ORDER BY bc.created_at ASC
");

foreach ($rows as &$row) {
    $row['id'] = (int)$row['id'];
    $row['username'] = $row['username'] ?: 'Gast';
    $row['comments_enabled'] = (bool)$row['comments_enabled'];
    $row['hidden'] = (bool)$row['hidden'];
    $row['is_owner'] = ((int)$row['user_id'] === $userId);
    unset($row['user_id']);

    $commentStmt->execute([$row['id']]);
    $comments = $commentStmt->fetchAll();
    foreach ($comments as &$c) {
        $c['username'] = $c['username'] ?: 'Gast';
        $c['avatar_url'] = build_avatar_url((int)$c['user_id']);
        unset($c['user_id']);
    }
    unset($c);
    $row['comments'] = $comments;
}

echo json_encode(['posts' => $rows]);
