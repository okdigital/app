<?php
require_once __DIR__ . '/../lib/auth.php';
header('Content-Type: application/json');

$userId = require_auth();

$stmt = db()->prepare('SELECT username, avatar_filename, food_preference, drink_wish, is_admin FROM users WHERE id = ?');
$stmt->execute([$userId]);
$user = $stmt->fetch();

echo json_encode([
    'username' => $user['username'],
    'avatar_url' => $user['avatar_filename'] ? build_avatar_url($userId) : null,
    'food_preference' => $user['food_preference'],
    'drink_wish' => $user['drink_wish'],
    'is_admin' => (bool)$user['is_admin'],
]);
