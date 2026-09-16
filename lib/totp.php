<?php
/**
 * Minimale TOTP-Implementierung (RFC 6238), kompatibel mit Google/Microsoft
 * Authenticator & Co. Keine externe Library nötig — bewusst so gehalten,
 * damit es 1:1 auf dem Hetzner-Server läuft wie hier lokal.
 */

function totp_generate_secret(int $length = 20): string {
    return base32_encode(random_bytes($length));
}

function totp_provisioning_uri(string $secret, string $email, string $issuer = 'WeihnachtsApp'): string {
    return sprintf(
        'otpauth://totp/%s:%s?secret=%s&issuer=%s',
        rawurlencode($issuer), rawurlencode($email), $secret, rawurlencode($issuer)
    );
}

function totp_verify(string $secret, string $code, int $window = 1): bool {
    $timeSlice = floor(time() / 30);
    for ($i = -$window; $i <= $window; $i++) {
        if (totp_code_at($secret, $timeSlice + $i) === $code) {
            return true;
        }
    }
    return false;
}

function totp_code_at(string $secret, int $timeSlice): string {
    $key = base32_decode($secret);
    $time = pack('N*', 0) . pack('N*', $timeSlice);
    $hash = hash_hmac('sha1', $time, $key, true);
    $offset = ord($hash[19]) & 0xf;
    $truncated = (
        ((ord($hash[$offset]) & 0x7f) << 24) |
        ((ord($hash[$offset + 1]) & 0xff) << 16) |
        ((ord($hash[$offset + 2]) & 0xff) << 8) |
        (ord($hash[$offset + 3]) & 0xff)
    );
    return str_pad((string)($truncated % 1000000), 6, '0', STR_PAD_LEFT);
}

function base32_encode(string $data): string {
    $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $bits = '';
    foreach (str_split($data) as $char) {
        $bits .= str_pad(decbin(ord($char)), 8, '0', STR_PAD_LEFT);
    }
    $output = '';
    foreach (str_split($bits, 5) as $chunk) {
        $chunk = str_pad($chunk, 5, '0');
        $output .= $alphabet[bindec($chunk)];
    }
    return $output;
}

function base32_decode(string $b32): string {
    $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $bits = '';
    foreach (str_split(strtoupper($b32)) as $char) {
        $pos = strpos($alphabet, $char);
        if ($pos === false) continue;
        $bits .= str_pad(decbin($pos), 5, '0', STR_PAD_LEFT);
    }
    $bytes = '';
    foreach (str_split($bits, 8) as $chunk) {
        if (strlen($chunk) < 8) continue;
        $bytes .= chr(bindec($chunk));
    }
    return $bytes;
}
