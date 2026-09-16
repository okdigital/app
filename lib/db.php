<?php
require_once __DIR__ . '/config.php';

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $isNew = !file_exists(DB_PATH);
        $pdo = new PDO('sqlite:' . DB_PATH);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        if ($isNew) {
            init_schema($pdo);
        }
        migrate_schema($pdo); // bestehende lokale Datenbanken sanft nachziehen
    }
    return $pdo;
}

function init_schema(PDO $pdo): void {
    $pdo->exec("
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            totp_secret TEXT NOT NULL,
            totp_verified INTEGER NOT NULL DEFAULT 0,
            username TEXT,
            avatar_filename TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            storage_path TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            photo_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            text TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (photo_id) REFERENCES photos(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            photo_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            emoji TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(photo_id, user_id, emoji),
            FOREIGN KEY (photo_id) REFERENCES photos(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE board_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            text TEXT NOT NULL,
            comments_enabled INTEGER NOT NULL DEFAULT 1,
            hidden INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE board_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            text TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (post_id) REFERENCES board_posts(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    ");
}

function migrate_schema(PDO $pdo): void {
    $cols = array_column($pdo->query("PRAGMA table_info(users)")->fetchAll(), 'name');
    if (!in_array('username', $cols, true)) {
        $pdo->exec("ALTER TABLE users ADD COLUMN username TEXT");
    }
    if (!in_array('avatar_filename', $cols, true)) {
        $pdo->exec("ALTER TABLE users ADD COLUMN avatar_filename TEXT");
    }

    $tables = $pdo->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array('board_posts', $tables, true)) {
        $pdo->exec("
            CREATE TABLE board_posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                text TEXT NOT NULL,
                comments_enabled INTEGER NOT NULL DEFAULT 1,
                hidden INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        ");
    } else {
        $boardCols = array_column($pdo->query("PRAGMA table_info(board_posts)")->fetchAll(), 'name');
        if (!in_array('comments_enabled', $boardCols, true)) {
            $pdo->exec("ALTER TABLE board_posts ADD COLUMN comments_enabled INTEGER NOT NULL DEFAULT 1");
        }
        if (!in_array('hidden', $boardCols, true)) {
            $pdo->exec("ALTER TABLE board_posts ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0");
        }
    }
    if (!in_array('board_comments', $tables, true)) {
        $pdo->exec("
            CREATE TABLE board_comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                text TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (post_id) REFERENCES board_posts(id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        ");
    }
}
