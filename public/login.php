<?php
require_once __DIR__ . '/../lib/auth.php';
require_once __DIR__ . '/../lib/totp.php';
header('Content-Type: application/json');

$input = json_input();
$email = trim($input['email'] ?? '');
$password = $input['password'] ?? '';
$code = $input['code'] ?? '';

$stmt = db()->prepare('SELECT * FROM users WHERE email = ?');
$stmt->execute([$email]);
$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
    json_error(401, 'E-Mail oder Passwort falsch');
}
if (!$user['totp_verified'] || !totp_verify($user['totp_secret'], $code)) {
    json_error(401, '2FA-Code ungültig');
}

$token = issue_session((int)$user['id']);
echo json_encode(['status' => 'ok', 'token' => $token]);
