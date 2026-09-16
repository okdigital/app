<?php
require_once __DIR__ . '/../lib/auth.php';
header('Content-Type: application/json');

require_auth(); // nur eingeloggte Nutzer sehen den Feed

// Seitenweises Laden: "before" ist die kleinste bisher gesehene Foto-ID,
// die App fragt beim Nachladen nach "alles, was älter ist als das".
// Wichtig bei ~100 gleichzeitigen Nutzern am Abend der VA: nie den
// kompletten Bestand auf einmal laden.
$limit = min((int)($_GET['limit'] ?? 10), 30);
if ($limit < 1) $limit = 10;
$beforeId = isset($_GET['before']) ? (int)$_GET['before'] : null;

$sql = "
    SELECT p.id, p.filename, p.created_at,
           (SELECT COUNT(*) FROM comments c WHERE c.photo_id = p.id) AS comment_count,
           (SELECT COUNT(*) FROM reactions r WHERE r.photo_id = p.id AND r.emoji = '❤️') AS heart_count
    FROM photos p
";
$params = [];
if ($beforeId) {
    $sql .= " WHERE p.id < ?";
    $params[] = $beforeId;
}
// +1 laden, um zu erkennen, ob danach noch mehr kommt, ohne einen
// zweiten COUNT-Query zu brauchen
$sql .= " ORDER BY p.id DESC LIMIT " . ($limit + 1);

$stmt = db()->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll();

$hasMore = count($rows) > $limit;
if ($hasMore) {
    array_pop($rows); // das "eine zu viel" wieder abschneiden
}

$commentStmt = db()->prepare("
    SELECT c.text, c.created_at, u.id AS user_id, u.username
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.photo_id = ?
    ORDER BY c.created_at DESC
");

$reactionStmt = db()->prepare("
    SELECT emoji, COUNT(*) AS c FROM reactions WHERE photo_id = ? GROUP BY emoji
");

// Emoji-Zeichen auf feste Schlüssel abbilden, damit das Frontend nicht mit
// Unicode-Vergleichen jonglieren muss
$emojiKeys = [
    "\u{2764}\u{FE0F}" => 'heart',
    "\u{1F602}"        => 'laugh',
    "\u{1F44D}"        => 'thumb',
    "\u{2B50}"         => 'star',
];

foreach ($rows as &$row) {
    $row['id'] = (int)$row['id'];
    $row['comment_count'] = (int)$row['comment_count'];
    $row['heart_count'] = (int)$row['heart_count'];
    $row['view_url'] = build_signed_url($row['id']);

    $commentStmt->execute([$row['id']]);
    $comments = $commentStmt->fetchAll();
    foreach ($comments as &$c) {
        $c['username'] = $c['username'] ?: 'Gast';
        $c['avatar_url'] = build_avatar_url((int)$c['user_id']);
        unset($c['user_id']);
    }
    unset($c);
    $row['comments'] = $comments;

    $counts = ['heart' => 0, 'laugh' => 0, 'thumb' => 0, 'star' => 0];
    $reactionStmt->execute([$row['id']]);
    foreach ($reactionStmt->fetchAll() as $r) {
        if (isset($emojiKeys[$r['emoji']])) {
            $counts[$emojiKeys[$r['emoji']]] = (int)$r['c'];
        }
    }
    $row['reaction_counts'] = $counts;
}

echo json_encode([
    'photos' => $rows,
    'has_more' => $hasMore,
    'next_before' => $hasMore ? end($rows)['id'] : null,
]);
