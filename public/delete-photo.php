<?php
require_once __DIR__ . '/../lib/auth.php';
header('Content-Type: application/json');

$userId = require_auth();
$input = json_input();
$photoId = (int)($input['photo_id'] ?? 0);

if (!$photoId) {
    json_error(400, 'photo_id erforderlich');
}

$adminStmt = db()->prepare('SELECT is_admin FROM users WHERE id = ?');
$adminStmt->execute([$userId]);
if (!$adminStmt->fetchColumn()) {
    json_error(403, 'Nur Admins dürfen Fotos löschen');
}

$stmt = db()->prepare('SELECT storage_path FROM photos WHERE id = ?');
$stmt->execute([$photoId]);
$photo = $stmt->fetch();

if (!$photo) {
    json_error(404, 'Foto nicht gefunden');
}

db()->prepare('DELETE FROM comments WHERE photo_id = ?')->execute([$photoId]);
db()->prepare('DELETE FROM reactions WHERE photo_id = ?')->execute([$photoId]);
db()->prepare('DELETE FROM photos WHERE id = ?')->execute([$photoId]);

$filePath = PHOTO_STORAGE_DIR . '/' . $photo['storage_path'];
if (is_file($filePath)) {
    unlink($filePath);
}

echo json_encode(['status' => 'ok']);
