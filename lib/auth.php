<?php
require_once __DIR__ . '/db.php';

function issue_session(int $userId): string {
    $token = bin2hex(random_bytes(24));
    $expires = date('Y-m-d H:i:s', time() + SESSION_TTL);
    $stmt = db()->prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)');
    $stmt->execute([$token, $userId, $expires]);
    return $token;
}

function require_auth(): int {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/Bearer\s+(\S+)/', $header, $m)) {
        json_error(401, 'Kein gültiges Token');
    }
    $stmt = db()->prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?');
    $stmt->execute([$m[1]]);
    $row = $stmt->fetch();
    if (!$row || strtotime($row['expires_at']) < time()) {
        json_error(401, 'Token abgelaufen oder ungültig');
    }
    return (int)$row['user_id'];
}

function json_error(int $code, string $message): void {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode(['error' => $message]);
    exit;
}

function json_input(): array {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

/** Kurzlebige signierte URL — das Prinzip aus dem Datenfluss-Diagramm */
function build_signed_url(int $photoId): string {
    $expires = time() + SIGNED_URL_TTL;
    $sig = hash_hmac('sha256', $photoId . ':' . $expires, SIGNING_SECRET);
    return "/photo-view.php?id={$photoId}&exp={$expires}&sig={$sig}";
}

function verify_signed_url(int $photoId, int $expires, string $sig): bool {
    if (time() > $expires) return false;
    $expected = hash_hmac('sha256', $photoId . ':' . $expires, SIGNING_SECRET);
    return hash_equals($expected, $sig);
}

/** Avatare sind unkritisch (kein Party-Foto) — einfacher Link reicht, kein Ablauf nötig */
function build_avatar_url(int $userId): string {
    return "/avatar-view.php?user_id={$userId}";
}
