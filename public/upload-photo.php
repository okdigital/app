<?php
require_once __DIR__ . '/../lib/auth.php';
header('Content-Type: application/json');

$userId = require_auth();
$input = json_input();
$filename = basename($input['filename'] ?? 'foto.jpg');
// In echt: rohe Bilddaten aus dem Body/Multipart lesen. Für den Test genügt Platzhalter-Inhalt.
$content = $input['content_base64'] ?? base64_encode('platzhalter-bilddaten');

if (!is_dir(PHOTO_STORAGE_DIR)) {
    mkdir(PHOTO_STORAGE_DIR, 0777, true);
}

$storedName = uniqid('photo_', true) . '_' . $filename;
$storagePath = PHOTO_STORAGE_DIR . '/' . $storedName;
file_put_contents($storagePath, base64_decode($content));

$stmt = db()->prepare('INSERT INTO photos (user_id, filename, storage_path) VALUES (?, ?, ?)');
$stmt->execute([$userId, $filename, $storedName]);
$photoId = (int)db()->lastInsertId();

echo json_encode([
    'status' => 'uploaded',
    'photo_id' => $photoId,
    'view_url' => build_signed_url($photoId), // kurzlebig, kein dauerhafter Download-Link
]);
