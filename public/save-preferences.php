<?php
require_once __DIR__ . '/../lib/auth.php';
header('Content-Type: application/json');

$userId = require_auth();
$input = json_input();
$food = $input['food_preference'] ?? '';
$drink = trim($input['drink_wish'] ?? '');

$allowedFood = ['vegetarisch', 'flexitarisch', 'alles'];
if (!in_array($food, $allowedFood, true)) {
    json_error(400, 'Bitte eine gültige Essens-Option wählen');
}
if (strlen($drink) > 200) {
    json_error(400, 'Getränkewunsch zu lang (max. 200 Zeichen)');
}

$stmt = db()->prepare('UPDATE users SET food_preference = ?, drink_wish = ? WHERE id = ?');
$stmt->execute([$food, $drink, $userId]);

echo json_encode(['status' => 'ok']);
