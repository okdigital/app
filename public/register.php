<?php
require_once __DIR__ . '/../lib/auth.php';
require_once __DIR__ . '/../lib/totp.php';
header('Content-Type: application/json');

$input = json_input();
$email = trim($input['email'] ?? '');
$password = $input['password'] ?? '';

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 8) {
    json_error(400, 'Ungültige E-Mail oder Passwort zu kurz (min. 8 Zeichen)');
}

$secret = totp_generate_secret();

try {
    $stmt = db()->prepare('INSERT INTO users (email, password_hash, totp_secret) VALUES (?, ?, ?)');
    $stmt->execute([$email, password_hash($password, PASSWORD_DEFAULT), $secret]);
} catch (PDOException $e) {
    json_error(409, 'E-Mail bereits registriert');
}

echo json_encode([
    'status' => 'registered_pending_2fa',
    'totp_secret' => $secret, // in der App: als QR-Code aus provisioning_uri anzeigen
    'provisioning_uri' => totp_provisioning_uri($secret, $email),
]);
