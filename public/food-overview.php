<?php
require_once __DIR__ . '/../lib/auth.php';
header('Content-Type: application/json');

require_auth();

$counts = ['vegetarisch' => 0, 'flexitarisch' => 0, 'alles' => 0, 'keine_angabe' => 0];
$rows = db()->query("SELECT username, food_preference, drink_wish FROM users ORDER BY username")->fetchAll();

$list = [];
foreach ($rows as $row) {
    $pref = $row['food_preference'];
    if (!$pref || !isset($counts[$pref])) {
        $counts['keine_angabe']++;
        continue;
    }
    $counts[$pref]++;
    $list[] = [
        'username' => $row['username'] ?: 'Gast',
        'food_preference' => $pref,
        'drink_wish' => $row['drink_wish'] ?: null,
    ];
}

echo json_encode(['counts' => $counts, 'people' => $list]);
