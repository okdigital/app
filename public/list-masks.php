<?php
// Listet alle vorhandenen Masken-PNGs auf, damit der Masken-Editor sein
// Dropdown nicht mehr hart codiert, sondern immer den echten Ordnerinhalt
// zeigt (inkl. manuell hochgeladener neuer Masken).
header('Content-Type: application/json');

$files = glob(__DIR__ . '/masks/*.png') ?: [];
$names = array_map(fn($f) => basename($f, '.png'), $files);
sort($names);

echo json_encode($names);
