<?php
require_once __DIR__ . '/../lib/auth.php';
header('Content-Type: application/json');

$userId = require_auth();
$input = json_input();
$photoId = (int)($input['photo_id'] ?? 0);
$emoji = $input['emoji'] ?? '';

if (!$photoId || !in_array($emoji, ['❤️', '😂', '👍', '⭐'], true)) {
    json_error(400, 'photo_id und gültiges emoji erforderlich');
}

// INSERT OR IGNORE dank UNIQUE(photo_id, user_id, emoji) — ein Nutzer kann
// pro Emoji nur einmal reagieren, doppelte Klicks erhöhen den Zähler nicht künstlich
$stmt = db()->prepare('INSERT OR IGNORE INTO reactions (photo_id, user_id, emoji) VALUES (?, ?, ?)');
$stmt->execute([$photoId, $userId, $emoji]);

$count = db()->prepare('SELECT COUNT(*) FROM reactions WHERE photo_id = ? AND emoji = ?');
$count->execute([$photoId, $emoji]);

echo json_encode(['status' => 'ok', 'emoji' => $emoji, 'count' => (int)$count->fetchColumn()]);
