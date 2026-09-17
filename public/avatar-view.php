<?php
require_once __DIR__ . '/../lib/auth.php';

// Kein require_auth() mehr — ein normales <img src="..."> kann keinen
// Authorization-Header mitschicken, das ließ jeden Avatar bisher als
// kaputtes Bild-Icon enden. Stattdessen wie bei den Fotos eine signierte
// URL prüfen (nur mit sehr viel längerer Gültigkeit, siehe AVATAR_URL_TTL).
$userId = (int)($_GET['user_id'] ?? 0);
$exp = (int)($_GET['exp'] ?? 0);
$sig = $_GET['sig'] ?? '';

if (!verify_avatar_signed_url($userId, $exp, $sig)) {
    json_error(403, 'Link abgelaufen oder ungültig — neu über den Feed anfragen');
}

$stmt = db()->prepare('SELECT avatar_filename FROM users WHERE id = ?');
$stmt->execute([$userId]);
$user = $stmt->fetch();

if (!$user || !$user['avatar_filename']) {
    json_error(404, 'Kein Avatar vorhanden');
}

header('Content-Type: image/jpeg');
header('Cache-Control: private, max-age=3600');
readfile(AVATAR_STORAGE_DIR . '/' . $user['avatar_filename']);
