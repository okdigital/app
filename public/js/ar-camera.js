import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

// -- AR-Masken-Kamera ------------------------------------------------------
// Läuft komplett im Browser über MediaPipe Face Landmarker, kein natives
// ARKit/ARCore nötig. Fällt auf den klassischen Datei-Auswähler zurück,
// falls Kamera-Zugriff oder Modell-Laden fehlschlägt (z.B. älteres Gerät,
// Desktop ohne Kamera, verweigerte Berechtigung).

let faceLandmarker = null;
let cameraStream = null;
let facingMode = 'user';
let currentMask = 'none';
let rafId = null;
let lastVideoTime = -1;
let modelLoadFailed = false;

const video = document.getElementById('cameraVideo');
const canvas = document.getElementById('cameraCanvas');
const ctx = canvas.getContext('2d');

// Echte Grafiken statt handgezeichneter Formen — liegen unter public/masks/
const maskImages = {};
['santa', 'antlers', 'glasses', 'halo'].forEach(name => {
  const img = new Image();
  img.src = '/masks/' + name + '.png';
  maskImages[name] = img;
});

// Position/Größe pro Maske kommt aus einer Konfigurationsdatei statt fest
// im Code — so kann der Masken-Editor Änderungen direkt speichern, ohne
// dass ein neuer Deploy nötig ist. Frisch laden bei jedem Kamera-Start,
// falls zwischenzeitlich über den Editor was geändert wurde.
let maskConfig = {};
async function loadMaskConfig() {
  try {
    const res = await fetch('/masks/config.json?t=' + Date.now());
    maskConfig = await res.json();
  } catch (e) {
    maskConfig = {}; // Masken erscheinen dann einfach nicht, bricht nichts ab
  }
}

async function ensureModelLoaded() {
  if (faceLandmarker || modelLoadFailed) return;
  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numFaces: 1,
    });
  } catch (e) {
    console.error('Face Landmarker konnte nicht geladen werden:', e);
    modelLoadFailed = true;
  }
}

async function openCameraView() {
  document.getElementById('cameraView').classList.remove('hidden');
  document.getElementById('cameraLoading').classList.remove('hidden');
  document.getElementById('cameraLoading').textContent = 'Kamera wird vorbereitet …';

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode }, audio: false,
    });
  } catch (e) {
    closeCameraView();
    // Kein Kamera-Zugriff -> alter, zuverlässiger Weg über den Datei-Dialog
    document.getElementById('cameraInput').value = '';
    document.getElementById('cameraInput').click();
    return;
  }

  video.srcObject = cameraStream;
  await video.play();
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  await Promise.all([ensureModelLoaded(), loadMaskConfig()]);
  document.getElementById('cameraLoading').classList.add('hidden');

  if (!faceLandmarker) {
    // Modell nicht verfügbar -> Kamera trotzdem nutzbar, nur ohne Masken
    document.querySelectorAll('.mask-btn').forEach(b => b.disabled = true);
  }

  lastVideoTime = -1;
  renderLoop();
}

function closeCameraView() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  document.getElementById('cameraView').classList.add('hidden');
}

function renderLoop() {
  if (!cameraStream) return;
  let landmarks = null;

  if (faceLandmarker && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    try {
      const result = faceLandmarker.detectForVideo(video, performance.now());
      if (result.faceLandmarks && result.faceLandmarks.length) {
        landmarks = result.faceLandmarks[0];
      }
    } catch (e) { /* einzelnen Frame überspringen, nicht die ganze Kamera abbrechen */ }
  }

  try {
    drawFrame(landmarks);
  } catch (e) { /* Frame überspringen, Schleife läuft weiter */ }
  // Läuft immer weiter, auch wenn beim Zeichnen oben etwas schiefging —
  // ein kaputtes Masken-Bild darf nie die ganze Kamera einfrieren.
  rafId = requestAnimationFrame(renderLoop);
}

function drawFrame(landmarks) {
  ctx.save();
  try {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Spiegelung für den natürlichen Selfie-Blick bei Frontkamera
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (landmarks && currentMask !== 'none') {
      try {
        const box = faceBoundingBox(landmarks);
        drawMask(currentMask, box);
      } catch (e) { /* Maske überspringen, Kamerabild bleibt erhalten */ }
    }
  } finally {
    // Unbedingt immer ausführen — sonst bleibt eine verschobene/gespiegelte
    // Zeichenfläche für alle folgenden Frames "hängen", falls oben was schiefgeht.
    ctx.restore();
  }
}

function faceBoundingBox(landmarks) {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    x: minX * canvas.width,
    y: minY * canvas.height,
    w: (maxX - minX) * canvas.width,
    h: (maxY - minY) * canvas.height,
  };
}

function drawImageAnchored(img, anchorXFrac, anchorYFrac, targetX, targetY, targetWidth) {
  if (!img || !img.complete || !img.naturalWidth) return;
  const scale = targetWidth / img.naturalWidth;
  const targetHeight = img.naturalHeight * scale;
  const drawX = targetX - anchorXFrac * targetWidth;
  const drawY = targetY - anchorYFrac * targetHeight;
  ctx.drawImage(img, drawX, drawY, targetWidth, targetHeight);
}

function drawMask(type, box) {
  const cfg = maskConfig[type];
  const img = maskImages[type];
  if (!cfg || !img) return; // Maske ohne Eintrag in config.json -> einfach nichts zeichnen
  const cx = box.x + box.w / 2 + cfg.offsetX * box.w;
  const targetY = box.y + cfg.offsetY * box.h;
  const targetWidth = box.w * cfg.width;
  drawImageAnchored(img, cfg.anchorX, cfg.anchorY, cx, targetY, targetWidth);
}

document.querySelectorAll('.mask-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.mask-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMask = btn.dataset.mask;
  };
});

document.getElementById('cameraSwitchBtn').onclick = async () => {
  const newFacingMode = facingMode === 'user' ? 'environment' : 'user';

  let newStream;
  try {
    newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: newFacingMode }, audio: false });
  } catch (e) {
    showMsg('Kamera konnte nicht gewechselt werden.', 'error');
    return; // alte Kamera bleibt unangetastet, nichts kaputt gemacht
  }

  if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
  cameraStream = newStream;
  facingMode = newFacingMode;

  video.srcObject = cameraStream;
  await video.play();
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  lastVideoTime = -1;

  // Das Erkennungsmodell verträgt offenbar keine neue Kamera-Quelle auf
  // demselben laufenden Modell — sauber schließen und neu aufbauen, statt
  // stillschweigend kaputtzugehen und danach dauerhaft keine Gesichter
  // mehr zu erkennen (auch nicht nach dem Zurückwechseln).
  if (faceLandmarker) {
    try { faceLandmarker.close(); } catch (e) { /* ignorieren, wird eh ersetzt */ }
    faceLandmarker = null;
  }
  modelLoadFailed = false;
  await ensureModelLoaded();
};

document.getElementById('cameraCloseBtn').onclick = closeCameraView;

document.getElementById('cameraCaptureBtn').onclick = () => {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  closeCameraView();

  pendingPhotoFile = { name: 'foto_' + Date.now() + '.jpg' };
  pendingPhotoBase64 = dataUrl.split(',')[1];
  document.getElementById('capturePreview').src = dataUrl;
  document.getElementById('captureCaption').value = '';
  document.getElementById('captureOverlay').classList.remove('hidden');
};

// Übernimmt den Kamera-Button vom klassischen Skript (das ihn zuerst auf
// den Datei-Dialog gelegt hat) — läuft als Modul-Skript nach dem Parsen,
// überschreibt die Zuweisung also zuverlässig.
document.getElementById('shutterBtn').onclick = () => {
  ensureModelLoaded(); // schon mal im Hintergrund starten, spart Wartezeit
  openCameraView();
};
