<?php
require_once __DIR__ . '/../lib/auth.php';
header('Content-Type: application/json');

$userId = require_auth();

$adminStmt = db()->prepare('SELECT is_admin FROM users WHERE id = ?');
$adminStmt->execute([$userId]);
if (!$adminStmt->fetchColumn()) {
    json_error(403, 'Nur Admins dürfen einen globalen Reload auslösen');
}

// Ganz bewusst nur eine einfache Textdatei statt einer DB-Tabelle — das hier
// ist reiner, kurzlebiger Laufzeit-Zustand ("wann zuletzt ausgelöst"), kein
// dauerhaft wichtiger Nutzdaten-Datensatz. Liegt in data/, ist also vom
// Deploy und von Git komplett unberührt.
$triggerPath = BASE_DIR . '/data/reload-trigger.txt';
$now = time();

if (@file_put_contents($triggerPath, (string)$now) === false) {
    json_error(500, 'Konnte Reload nicht auslösen — Schreibrechte für data/ prüfen');
}

echo json_encode(['status' => 'ok', 'trigger' => $now]);
