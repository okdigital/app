# WeihnachtsApp — Backend-Prototyp

Lokal lauffähige Nachbildung der geplanten Hetzner-Struktur, mit SQLite statt
MySQL (kein Server-Setup nötig). Alle Kernfunktionen sind implementiert und
gegeneinander getestet: Registrierung, 2FA (TOTP, kompatibel mit Google/
Microsoft Authenticator), signierte kurzlebige Foto-URLs, Kommentare,
Emoji-Reaktionen.

## Lokal starten

```
cd public
php -S 127.0.0.1:8000
```

Die SQLite-Datenbank wird beim ersten Request automatisch unter
`data/app.sqlite` angelegt.

## Ablauf sehen — zwei Wege

**A) Im Browser klicken (empfohlen für den schnellen Überblick):**
Sobald der Server läuft, einfach `http://127.0.0.1:8000/` im Browser öffnen —
dort liegt ein kleiner Test-Client (`public/index.html`), mit dem du dich
durch Registrierung, 2FA, Foto-Upload, Kommentare und Emoji-Reaktionen
klicken kannst, ganz ohne Terminal-Befehle.

**B) Als Skript durchlaufen lassen (für automatisierte Checks):**

Terminal offen lassen (Server läuft dort), zweites Fenster öffnen:

**Mac/Linux:**
```
cd weihnachtsapp-backend
bash test-flow.sh
```

**Windows (PowerShell — nicht über bash/Git Bash/WSL starten, sonst kennt die
Shell den PHP-Pfad nicht):**
```
cd weihnachtsapp-backend
powershell -ExecutionPolicy Bypass -File .\test-flow.ps1
```

Beide Varianten machen dasselbe: Testnutzer registrieren, 2FA verifizieren,
Foto hochladen, Kommentar schreiben, Herz-Reaktion setzen, Feed abrufen —
jeder Schritt mit seiner JSON-Antwort. Am Ende gibt es eine Adresse, die du
in den Browser kopieren kannst, um das (Platzhalter-)Bild direkt zu sehen.

## Endpunkte

| Endpunkt              | Methode | Zweck                                  |
|------------------------|---------|-----------------------------------------|
| `/register.php`        | POST    | Nutzer anlegen, TOTP-Secret erzeugen    |
| `/verify-2fa.php`      | POST    | 2FA-Code bestätigen, Session-Token holen|
| `/login.php`           | POST    | Login mit Passwort + 2FA-Code           |
| `/upload-photo.php`    | POST    | Foto-Metadaten + Datei ablegen (Auth)   |
| `/feed.php`            | GET     | Fotos mit Kommentar-/Reaktionszahlen    |
| `/comment.php`         | POST    | Kommentar zu einem Foto (Auth)          |
| `/react.php`           | POST    | Emoji-Reaktion setzen (Auth)            |
| `/photo-view.php`      | GET     | Foto nur über signierte, kurzlebige URL |

Geschützte Endpunkte erwarten `Authorization: Bearer <token>`.

## Umzug auf Hetzner

1. `lib/db.php`: `new PDO('sqlite:...)` durch
   `new PDO('mysql:host=...;dbname=...', $user, $pass)` ersetzen, Schema
   entsprechend nach MySQL-Syntax anpassen (AUTOINCREMENT → AUTO_INCREMENT).
2. `SIGNING_SECRET` und DB-Zugangsdaten aus Umgebungsvariablen laden, nicht
   hart codieren.
3. `data/photos/` außerhalb des Web-Roots legen bzw. per `.htaccess`/Nginx-
   Konfig sperren, damit Dateien wirklich nur über `photo-view.php` erreichbar
   sind.
4. Die echte Bildübertragung beim Upload sollte über `multipart/form-data`
   laufen statt Base64 im JSON-Body (aktuell nur als Test-Vereinfachung so).

## Bekannte Auslassungen (bewusst für den Prototyp)

- Kein Rate-Limiting auf Login/2FA-Versuche
- Kein Passwort-Reset-Flow
- `content_base64` im Upload ist ein Platzhalter für echten Datei-Upload
- Kein HTTPS (lokal irrelevant, auf Hetzner zwingend über Let's Encrypt/eure
  bestehende TLS-Konfiguration)
