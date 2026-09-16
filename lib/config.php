<?php
/**
 * config.php — zentrale Konfiguration
 * Für den lokalen Test: SQLite. Auf Hetzner später einfach die db()-Funktion
 * in db.php auf PDO MySQL umstellen, der Rest bleibt unverändert.
 */

define('BASE_DIR', dirname(__DIR__));
define('DB_PATH', BASE_DIR . '/data/app.sqlite');
define('PHOTO_STORAGE_DIR', BASE_DIR . '/data/photos');
define('AVATAR_STORAGE_DIR', BASE_DIR . '/data/avatars');

// Signaturschlüssel für kurzlebige Foto-URLs — in Produktion aus ENV laden,
// niemals hart codiert im Repo
define('SIGNING_SECRET', getenv('SIGNING_SECRET') ?: 'lokaler-test-schluessel-nicht-fuer-produktion');

// Gültigkeitsdauer signierter Foto-URLs in Sekunden
define('SIGNED_URL_TTL', 60);

// Gültigkeitsdauer eines Login-Tokens in Sekunden (hier kurz für den Test)
define('SESSION_TTL', 3600);
