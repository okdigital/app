<?php
require_once __DIR__ . '/../lib/auth.php';

$id = (int)($_GET['id'] ?? 0);
$exp = (int)($_GET['exp'] ?? 0);
$sig = $_GET['sig'] ?? '';

if (!verify_signed_url($id, $exp, $sig)) {
    json_error(403, 'Link abgelaufen oder ungültig — neu über den Feed anfragen');
}

$stmt = db()->prepare('SELECT storage_path FROM photos WHERE id = ?');
$stmt->execute([$id]);
$photo = $stmt->fetch();
if (!$photo) {
    json_error(404, 'Foto nicht gefunden');
}

// Content-Disposition bewusst NICHT auf "attachment" — die App zeigt es in
// einer Custom-View an, ein Browser würde es sonst als Datei anbieten
header('Content-Type: image/jpeg');
header('Cache-Control: no-store');
readfile(PHOTO_STORAGE_DIR . '/' . $photo['storage_path']);
