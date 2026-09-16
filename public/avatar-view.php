<?php
require_once __DIR__ . '/../lib/auth.php';

require_auth(); // nur eingeloggte Nutzer sehen Avatare, aber jeder darf jeden sehen

$userId = (int)($_GET['user_id'] ?? 0);
$stmt = db()->prepare('SELECT avatar_filename FROM users WHERE id = ?');
$stmt->execute([$userId]);
$user = $stmt->fetch();

if (!$user || !$user['avatar_filename']) {
    json_error(404, 'Kein Avatar vorhanden');
}

header('Content-Type: image/jpeg');
header('Cache-Control: private, max-age=3600');
readfile(AVATAR_STORAGE_DIR . '/' . $user['avatar_filename']);
