<?php
require_once __DIR__ . '/../lib/auth.php';
header('Content-Type: application/json');

$userId = require_auth();

$adminStmt = db()->prepare('SELECT is_admin FROM users WHERE id = ?');
$adminStmt->execute([$userId]);
if (!$adminStmt->fetchColumn()) {
    json_error(403, 'Nur Admins dürfen Masken löschen');
}

$input = json_input();
$name = preg_replace('/[^a-z0-9_-]/i', '', $input['name'] ?? '');
if ($name === '') {
    json_error(400, 'Gültiger Masken-Name erforderlich');
}

$pngPath = __DIR__ . '/masks/' . $name . '.png';
if (!file_exists($pngPath)) {
    json_error(404, 'Maske nicht gefunden');
}

if (!@unlink($pngPath)) {
    json_error(500, 'Konnte Datei nicht löschen — vermutlich fehlende Schreibrechte für www-data auf dem Server');
}

// Zugehörigen Eintrag in config.json ebenfalls entfernen, falls vorhanden.
// Absichtlich kein harter Fehler, wenn das schreiben hier scheitert - die
// Bilddatei ist ja schon weg, ein verwaister Config-Eintrag stört nicht
// (drawMask() prüft ohnehin, ob die Bilddatei noch existiert).
$configPath = __DIR__ . '/masks/config.json';
if (file_exists($configPath)) {
    $config = json_decode(file_get_contents($configPath), true);
    if (is_array($config) && isset($config[$name])) {
        unset($config[$name]);
        @file_put_contents($configPath, json_encode($config, JSON_PRETTY_PRINT));
    }
}

echo json_encode(['status' => 'ok']);
