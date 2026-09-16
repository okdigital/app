<?php
require_once __DIR__ . '/../lib/auth.php';
require_once __DIR__ . '/../lib/totp.php';
header('Content-Type: application/json');

$input = json_input();
$email = trim($input['email'] ?? '');
$code = $input['code'] ?? '';

$stmt = db()->prepare('SELECT id, totp_secret FROM users WHERE email = ?');
$stmt->execute([$email]);
$user = $stmt->fetch();

if (!$user || !totp_verify($user['totp_secret'], $code)) {
    json_error(401, 'Code ungültig oder abgelaufen');
}

db()->prepare('UPDATE users SET totp_verified = 1 WHERE id = ?')->execute([$user['id']]);
$token = issue_session((int)$user['id']);

echo json_encode(['status' => 'verified', 'token' => $token]);
