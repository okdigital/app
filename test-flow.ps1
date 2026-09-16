# Demo-Skript für Windows PowerShell
# Im selben PowerShell-Fenster ausführen, in dem "php -v" funktioniert
# (NICHT über bash/Git Bash/WSL starten — das hat ein eigenes PATH ohne PHP)
#
# Aufruf:
#   cd weihnachtsapp-backend
#   powershell -ExecutionPolicy Bypass -File .\test-flow.ps1
# (Falls "Skriptausführung deaktiviert"-Fehler kommt, obiger Aufruf mit
#  -ExecutionPolicy Bypass umgeht das, ohne etwas dauerhaft umzustellen.)

$base = "http://127.0.0.1:8000"

function Post-Json($url, $bodyObj, $token = $null) {
    $json = $bodyObj | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $headers = @{}
    if ($token) { $headers["Authorization"] = "Bearer $token" }
    try {
        return Invoke-RestMethod -Uri $url -Method Post -Body $bytes `
            -ContentType "application/json; charset=utf-8" -Headers $headers
    } catch {
        Write-Host "Fehler bei $url : $($_.Exception.Message)" -ForegroundColor Red
        if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message -ForegroundColor Red }
        exit 1
    }
}

function Get-Json($url, $token) {
    return Invoke-RestMethod -Uri $url -Headers @{Authorization = "Bearer $token"}
}

Write-Host "== 1) Registrierung ==" -ForegroundColor Cyan
$reg = Post-Json "$base/register.php" @{ email = "test@beispiel.de"; password = "testpasswort123" }
$reg | ConvertTo-Json
$secret = $reg.totp_secret

Write-Host "`n== 2) 2FA-Code lokal erzeugen (das wuerde sonst deine Authenticator-App tun) ==" -ForegroundColor Cyan
$code = php -r "require 'lib/totp.php'; echo totp_code_at('$secret', floor(time()/30));"
Write-Host "Code: $code"

Write-Host "`n== 3) 2FA verifizieren -> Session-Token ==" -ForegroundColor Cyan
$verify = Post-Json "$base/verify-2fa.php" @{ email = "test@beispiel.de"; code = $code }
$verify | ConvertTo-Json
$token = $verify.token

Write-Host "`n== 4) Foto hochladen ==" -ForegroundColor Cyan
$photoBytes = [System.Text.Encoding]::UTF8.GetBytes("test-bild-inhalt")
$photoB64 = [Convert]::ToBase64String($photoBytes)
$upload = Post-Json "$base/upload-photo.php" @{ filename = "weihnachtsbaum.jpg"; content_base64 = $photoB64 } $token
$upload | ConvertTo-Json
$photoId = $upload.photo_id
$viewUrl = $upload.view_url

Write-Host "`n== 5) Kommentar schreiben ==" -ForegroundColor Cyan
(Post-Json "$base/comment.php" @{ photo_id = $photoId; text = "Sieht toll aus!" } $token) | ConvertTo-Json

Write-Host "`n== 6) Herz-Reaktion setzen ==" -ForegroundColor Cyan
$heart = [string]([char]0x2764) + [string]([char]0xFE0F)
(Post-Json "$base/react.php" @{ photo_id = $photoId; emoji = $heart } $token) | ConvertTo-Json

Write-Host "`n== 7) Feed abrufen (zeigt Foto + Kommentar-/Reaktionszahlen) ==" -ForegroundColor Cyan
(Get-Json "$base/feed.php" $token) | ConvertTo-Json -Depth 5

Write-Host "`n== 8) Foto ansehen ==" -ForegroundColor Cyan
$fullUrl = "$base$viewUrl"
Write-Host "Adresse (im Browser oeffnen): $fullUrl"

Write-Host "`nFertig." -ForegroundColor Green
