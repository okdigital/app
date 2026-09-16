import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

// -- AR-Masken-Kamera ------------------------------------------------------
// Läuft komplett im Browser über MediaPipe Face Landmarker, kein natives
// ARKit/ARCore nötig. Fällt auf den klassischen Datei-Auswähler zurück,
// falls Kamera-Zugriff oder Modell-Laden fehlschlägt (z.B. älteres Gerät,
// Desktop ohne Kamera, verweigerte Berechtigung).

let faceLandmarker = null;
let cameraStream = null;
let facingMode = 'user';
// Mehrere Effekte koennen gleichzeitig aktiv sein (statt nur einer Maske) -
// je nach erkanntem Gesicht wird jeder aktive Effekt unabhaengig positioniert.
const activeMasks = new Set();
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
      numFaces: 8, // Gruppenfotos: mehrere Gesichter gleichzeitig tracken
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
  let allLandmarks = [];

  if (faceLandmarker && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    try {
      const result = faceLandmarker.detectForVideo(video, performance.now());
      if (result.faceLandmarks && result.faceLandmarks.length) {
        allLandmarks = result.faceLandmarks; // ein Eintrag pro erkanntem Gesicht
      }
    } catch (e) { /* einzelnen Frame überspringen, nicht die ganze Kamera abbrechen */ }
  }

  try {
    drawFrame(allLandmarks);
  } catch (e) { /* Frame überspringen, Schleife läuft weiter */ }
  // Läuft immer weiter, auch wenn beim Zeichnen oben etwas schiefging —
  // ein kaputtes Masken-Bild darf nie die ganze Kamera einfrieren.
  rafId = requestAnimationFrame(renderLoop);
}

function drawFrame(allLandmarks) {
  ctx.save();
  try {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Spiegelung für den natürlichen Selfie-Blick bei Frontkamera
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (activeMasks.size && allLandmarks.length) {
      for (const landmarks of allLandmarks) {
        try {
          drawEffectsForFace(landmarks);
        } catch (e) { /* dieses Gesicht überspringen, die anderen bleiben erhalten */ }
      }
    }
  } finally {
    // Unbedingt immer ausführen — sonst bleibt eine verschobene/gespiegelte
    // Zeichenfläche für alle folgenden Frames "hängen", falls oben was schiefgeht.
    ctx.restore();
  }
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// Alle aktuell aktiven Effekte fuer ein einzelnes erkanntes Gesicht zeichnen.
// Bild-Masken (santa/antlers/glasses/halo) nutzen weiterhin die Bounding-Box +
// config.json; die neuen Effekte werden direkt aus den Landmark-Punkten
// berechnet, damit sie ohne zusätzliche Grafikdateien auskommen.
function drawEffectsForFace(landmarks) {
  const box = faceBoundingBox(landmarks);

  ['santa', 'antlers', 'glasses', 'halo'].forEach(name => {
    if (activeMasks.has(name)) {
      try { drawMask(name, box); } catch (e) { /* einzelne Bild-Maske überspringen */ }
    }
  });

  const hasDrawnEffect = ['frame', 'nose', 'earrings', 'beard', 'question', 'exclaim']
    .some(name => activeMasks.has(name));
  if (!hasDrawnEffect) return;

  const P = (i) => ({ x: landmarks[i].x * canvas.width, y: landmarks[i].y * canvas.height });
  const forehead = P(10);
  const chin = P(152);
  const leftTemple = P(127);
  const rightTemple = P(356);
  const leftEyeOuter = P(33);
  const rightEyeOuter = P(263);
  const noseTip = P(1);
  const mouthL = P(61);
  const mouthR = P(291);
  const leftJaw = P(172);
  const rightJaw = P(397);
  const leftEar = P(234);
  const rightEar = P(454);

  const faceWidth = dist(leftTemple, rightTemple);
  const faceHeight = dist(forehead, chin);
  const angle = Math.atan2(rightEyeOuter.y - leftEyeOuter.y, rightEyeOuter.x - leftEyeOuter.x);
  const faceCenter = mid(forehead, chin);

  if (activeMasks.has('frame')) {
    drawGoldenFrame(faceWidth, faceHeight, angle, faceCenter.x, faceCenter.y);
  }
  if (activeMasks.has('beard')) {
    drawBeard(leftJaw, rightJaw, chin, mouthL, mouthR);
  }
  if (activeMasks.has('earrings')) {
    drawEarrings(faceWidth, angle, leftEar.x, leftEar.y, rightEar.x, rightEar.y);
  }
  if (activeMasks.has('nose')) {
    drawRedNose(faceWidth, angle, noseTip.x, noseTip.y);
  }
  if (activeMasks.has('question')) {
    const topX = forehead.x - Math.sin(angle) * faceHeight * 0.62;
    const topY = forehead.y - Math.cos(angle) * faceHeight * 0.62;
    drawFloatingSymbol('?', faceWidth, topX, topY, performance.now());
  }
  if (activeMasks.has('exclaim')) {
    const offset = activeMasks.has('question') ? 0.85 : 0.62;
    const topX = forehead.x - Math.sin(angle) * faceHeight * offset;
    const topY = forehead.y - Math.cos(angle) * faceHeight * offset;
    drawFloatingSymbol('!', faceWidth, topX, topY, performance.now() + 500);
  }
}

// ---- Neue, direkt gezeichnete Effekte (kein PNG-Asset nötig) ----

function drawGoldenFrame(faceWidth, faceHeight, angle, cx, cy) {
  const w = faceWidth * 1.55;
  const h = faceHeight * 1.85;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  const grad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  grad.addColorStop(0, '#F9E28A');
  grad.addColorStop(0.5, '#C9930C');
  grad.addColorStop(1, '#F9E28A');
  ctx.strokeStyle = grad;
  ctx.lineWidth = Math.max(6, w * 0.05);
  ctx.beginPath();
  ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = Math.max(2, w * 0.015);
  ctx.strokeStyle = '#7A5A0B';
  ctx.beginPath();
  ctx.ellipse(0, 0, w / 2 * 1.08, h / 2 * 1.08, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#F9E28A';
  [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach(a => {
    ctx.beginPath();
    ctx.arc(Math.cos(a) * w / 2, Math.sin(a) * h / 2, w * 0.028, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawRedNose(faceWidth, angle, noseX, noseY) {
  const s = faceWidth / 160;
  ctx.save();
  ctx.translate(noseX, noseY);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.arc(0, 0, 16 * s, 0, Math.PI * 2);
  ctx.fillStyle = '#E8392E';
  ctx.shadowColor = 'rgba(232,57,46,0.7)';
  ctx.shadowBlur = 10 * s;
  ctx.fill();
  ctx.restore();
}

function drawEarrings(faceWidth, angle, leftEarX, leftEarY, rightEarX, rightEarY) {
  const r = faceWidth * 0.045;
  [[leftEarX, leftEarY], [rightEarX, rightEarY]].forEach(([ex, ey]) => {
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.arc(0, r * 1.4, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#F4B942';
    ctx.lineWidth = r * 0.32;
    ctx.stroke();
    ctx.restore();
  });
}

function drawBeard(leftJaw, rightJaw, chin, mouthL, mouthR) {
  ctx.save();
  ctx.fillStyle = '#3E2A1E';
  ctx.beginPath();
  ctx.moveTo(mouthL.x, mouthL.y);
  ctx.quadraticCurveTo(leftJaw.x, leftJaw.y, chin.x + (leftJaw.x - chin.x) * 0.15, chin.y + dist(chin, mouthL) * 0.35);
  ctx.quadraticCurveTo(chin.x, chin.y + dist(chin, mouthL) * 0.55, chin.x + (rightJaw.x - chin.x) * 0.15, chin.y + dist(chin, mouthR) * 0.35);
  ctx.quadraticCurveTo(rightJaw.x, rightJaw.y, mouthR.x, mouthR.y);
  ctx.quadraticCurveTo(chin.x, chin.y - dist(chin, mouthL) * 0.05, mouthL.x, mouthL.y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawFloatingSymbol(symbol, faceWidth, x, y, t) {
  const bob = Math.sin(t / 260 + x * 0.01) * faceWidth * 0.03;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.font = `900 ${faceWidth * 0.55}px "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = faceWidth * 0.06;
  ctx.strokeStyle = '#7A5A0B';
  ctx.strokeText(symbol, 0, 0);
  ctx.fillStyle = '#F4B942';
  ctx.fillText(symbol, 0, 0);
  ctx.restore();
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
    const mask = btn.dataset.mask;

    if (mask === 'none') {
      // "Keine Maske" schaltet alle Effekte auf einmal aus.
      activeMasks.clear();
      document.querySelectorAll('.mask-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      return;
    }

    document.querySelector('.mask-btn[data-mask="none"]').classList.remove('active');
    if (activeMasks.has(mask)) {
      activeMasks.delete(mask);
      btn.classList.remove('active');
    } else {
      activeMasks.add(mask);
      btn.classList.add('active');
    }
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
