#!/bin/bash
# Demo-Skript: zeigt den kompletten Ablauf, während der Server in einem
# anderen Terminal-Fenster läuft (siehe README: "cd public && php -S 127.0.0.1:8000")

BASE="http://127.0.0.1:8000"

echo "== 1) Registrierung =="
REG=$(curl -s $BASE/register.php -X POST -H "Content-Type: application/json" \
  -d '{"email":"test@beispiel.de","password":"testpasswort123"}')
echo "$REG"
SECRET=$(echo "$REG" | php -r 'echo json_decode(file_get_contents("php://stdin"),true)["totp_secret"] ?? "";')

if [ -z "$SECRET" ]; then
  echo ""
  echo "Kein Secret erhalten — läuft der Server? (php -S 127.0.0.1:8000 im public/-Ordner starten)"
  echo "Oder: E-Mail schon registriert -> data/app.sqlite löschen und nochmal versuchen."
  exit 1
fi

echo ""
echo "== 2) 2FA-Code wird lokal erzeugt (das würde sonst deine Authenticator-App tun) =="
CODE=$(php -r "require '../lib/totp.php'; echo totp_code_at('$SECRET', floor(time()/30));" 2>/dev/null || \
       php -r "require 'lib/totp.php'; echo totp_code_at('$SECRET', floor(time()/30));")
echo "Code: $CODE"

echo ""
echo "== 3) 2FA verifizieren -> Session-Token =="
VERIFY=$(curl -s $BASE/verify-2fa.php -X POST -H "Content-Type: application/json" \
  -d "{\"email\":\"test@beispiel.de\",\"code\":\"$CODE\"}")
echo "$VERIFY"
TOKEN=$(echo "$VERIFY" | php -r 'echo json_decode(file_get_contents("php://stdin"),true)["token"] ?? "";')

echo ""
echo "== 4) Foto hochladen =="
UPLOAD=$(curl -s $BASE/upload-photo.php -X POST \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"filename":"weihnachtsbaum.jpg","content_base64":"'$(echo -n "test-bild-inhalt" | base64)'"}')
echo "$UPLOAD"
PHOTO_ID=$(echo "$UPLOAD" | php -r 'echo json_decode(file_get_contents("php://stdin"),true)["photo_id"] ?? "";')
VIEW_URL=$(echo "$UPLOAD" | php -r 'echo json_decode(file_get_contents("php://stdin"),true)["view_url"] ?? "";')

echo ""
echo "== 5) Kommentar schreiben =="
curl -s $BASE/comment.php -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"photo_id\":$PHOTO_ID,\"text\":\"Sieht toll aus!\"}"

echo ""
echo ""
echo "== 6) Herz-Reaktion setzen =="
curl -s $BASE/react.php -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"photo_id\":$PHOTO_ID,\"emoji\":\"❤️\"}"

echo ""
echo ""
echo "== 7) Feed abrufen (zeigt Foto + Kommentar-/Reaktionszahlen) =="
curl -s $BASE/feed.php -H "Authorization: Bearer $TOKEN"

echo ""
echo ""
echo "== 8) Foto über die signierte URL ansehen (im Browser öffnen geht auch) =="
echo "$BASE$VIEW_URL"
curl -s "$BASE$VIEW_URL"
echo ""
echo ""
echo "Fertig. Öffne die Adresse aus Schritt 8 in deinem Browser, um das (Platzhalter-)Bild direkt zu sehen."
