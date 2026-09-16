<?php
require_once __DIR__ . '/../lib/auth.php';
header('Content-Type: application/json');

$userId = require_auth();

$adminStmt = db()->prepare('SELECT is_admin FROM users WHERE id = ?');
$adminStmt->execute([$userId]);
if (!$adminStmt->fetchColumn()) {
    json_error(403, 'Nur Admins dürfen Masken-Positionen speichern');
}

$input = json_input();
$name = preg_replace('/[^a-z0-9_-]/i', '', $input['name'] ?? '');
$anchorX = (float)($input['anchorX'] ?? 0.5);
$anchorY = (float)($input['anchorY'] ?? 0.5);
$offsetX = (float)($input['offsetX'] ?? 0);
$offsetY = (float)($input['offsetY'] ?? 0);
$width   = (float)($input['width'] ?? 1);

if ($name === '') {
    json_error(400, 'Gültiger Masken-Name erforderlich');
}

$configPath = __DIR__ . '/masks/config.json';
$config = file_exists($configPath) ? json_decode(file_get_contents($configPath), true) : [];
if (!is_array($config)) {
    $config = [];
}

$config[$name] = [
    'anchorX' => $anchorX,
    'anchorY' => $anchorY,
    'offsetX' => $offsetX,
    'offsetY' => $offsetY,
    'width'   => $width,
];

file_put_contents($configPath, json_encode($config, JSON_PRETTY_PRINT));

echo json_encode(['status' => 'ok', 'config' => $config[$name]]);
