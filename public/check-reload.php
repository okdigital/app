<?php
require_once __DIR__ . '/../lib/config.php';
header('Content-Type: application/json');

// Bewusst OHNE require_auth(): Der globale Reload muss auch bei abgelaufener
// Sitzung greifen, sonst würden genau die Geräte, die eh schon ausgeloggt
// sind, nie mitbekommen, dass sie sich neu laden sollen. Der Zeitstempel
// selbst ist keine sensible Information.
$triggerPath = BASE_DIR . '/data/reload-trigger.txt';
$trigger = file_exists($triggerPath) ? (int)file_get_contents($triggerPath) : 0;

echo json_encode(['trigger' => $trigger]);
