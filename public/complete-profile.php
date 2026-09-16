<?php
require_once __DIR__ . '/../lib/auth.php';
header('Content-Type: application/json');

$userId = require_auth();
$input = json_input();
$username = trim($input['username'] ?? '');
$avatarB64 = $input['avatar_base64'] ?? '';

if ($username === '' || strlen($username) > 24) {
    json_error(400, 'Bitte einen Namen zwischen 1 und 24 Zeichen angeben');
}
if ($avatarB64 === '') {
    json_error(400, 'Bitte ein Selfie aufnehmen');
}

// Name muss eindeutig sein — er ersetzt die E-Mail als öffentlich sichtbare Identität
$check = db()->prepare('SELECT id FROM users WHERE username = ? AND id != ?');
$check->execute([$username, $userId]);
if ($check->fetch()) {
    json_error(409, 'Dieser Name ist schon vergeben, bitte einen anderen wählen');
}

if (!is_dir(AVATAR_STORAGE_DIR)) {
    mkdir(AVATAR_STORAGE_DIR, 0777, true);
}
$avatarFile = 'avatar_' . $userId . '_' . bin2hex(random_bytes(4)) . '.jpg';
file_put_contents(AVATAR_STORAGE_DIR . '/' . $avatarFile, base64_decode($avatarB64));

$stmt = db()->prepare('UPDATE users SET username = ?, avatar_filename = ? WHERE id = ?');
$stmt->execute([$username, $avatarFile, $userId]);

echo json_encode([
    'status' => 'ok',
    'username' => $username,
    'avatar_url' => build_avatar_url($userId),
]);
