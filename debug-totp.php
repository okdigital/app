<?php
// Diagnose-Skript: zeigt das gespeicherte Secret, den aktuell korrekten Code
// und die Serverzeit für eine bestimmte E-Mail-Adresse.
require 'lib/db.php';
require 'lib/totp.php';

$email = $argv[1] ?? null;
if (!$email) {
    echo "Aufruf: php debug-totp.php deine@email.de\n";
    exit(1);
}

$stmt = db()->prepare('SELECT totp_secret FROM users WHERE email = ?');
$stmt->execute([$email]);
$row = $stmt->fetch();

if (!$row) {
    echo "Kein Nutzer mit dieser E-Mail in der Datenbank gefunden.\n";
    exit(1);
}

echo "Gespeichertes Secret:     " . $row['totp_secret'] . "\n";
echo "Aktuell gueltiger Code:   " . totp_code_at($row['totp_secret'], floor(time() / 30)) . "\n";
echo "Serverzeit (dieser PC):   " . date('Y-m-d H:i:s') . "\n";
