const BASE = window.location.origin;
let token = localStorage.getItem('wa_token') || null;

// Bei jedem nennenswerten Deploy von Hand hochzählen — einziger Zweck: damit
// man auf einen Blick sieht, ob das eigene Handy noch eine alte Version zeigt.
const APP_VERSION = '1.3.2';
document.getElementById('appVersion').textContent = APP_VERSION;

document.getElementById('checkUpdateBtn').onclick = () => {
  // Cache-Buster in der URL erzwingt einen frischen Abruf von index.html,
  // statt sich auf eine evtl. gecachte Kopie zu verlassen
  window.location.href = window.location.pathname + '?v=' + Date.now();
};

// -- Offline-Warteschlange (IndexedDB) --------------------------------
// Falls der Upload am Veranstaltungsabend mal nicht durchgeht (WLAN
// überlastet, kurzer Aussetzer o.ä.), landet das Foto hier statt verloren
// zu gehen, und wird automatisch gesendet, sobald es wieder klappt.
const QUEUE_DB_NAME = 'weihnachtsapp_offline';
const QUEUE_STORE = 'pending_uploads';

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueAdd(entry) {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).add(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function queueGetAll() {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const req = tx.objectStore(QUEUE_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueDelete(id) {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function updateQueueBanner() {
  const pending = await queueGetAll().catch(() => []);
  const banner = document.getElementById('queueBanner');
  if (pending.length > 0 && token) {
    document.getElementById('queueBannerText').textContent =
      pending.length === 1
        ? '1 Foto wartet auf Verbindung, um gesendet zu werden.'
        : `${pending.length} Fotos warten auf Verbindung, um gesendet zu werden.`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

async function flushQueue() {
  if (!token) return;
  const pending = await queueGetAll().catch(() => []);
  if (!pending.length) return;
  let sentAny = false;
  for (const item of pending) {
    try {
      const upload = await api('/upload-photo.php', { filename: item.filename, content_base64: item.base64 }, true);
      if (item.caption) {
        await api('/comment.php', { photo_id: upload.photo_id, text: item.caption }, true);
      }
      await queueDelete(item.id);
      sentAny = true;
    } catch (e) {
      // Netzwerk vermutlich immer noch nicht da — Rest der Warteschlange
      // für den nächsten Versuch stehen lassen, nicht weiter probieren
      break;
    }
  }
  await updateQueueBanner();
  if (sentAny) { showMsg('Wartende Fotos wurden gesendet.', 'ok'); loadFeed(); }
}

document.getElementById('queueRetryBtn').onclick = flushQueue;
window.addEventListener('online', flushQueue);
setInterval(flushQueue, 20000); // alle 20 Sekunden automatisch nachschauen
// ----------------------------------------------------------------------

let msgTimeout = null;

function showMsg(text, type = 'ok') {
  document.getElementById('msgBox').innerHTML = `<div class="msg ${type}">${text}</div>`;
  clearTimeout(msgTimeout);
  msgTimeout = setTimeout(clearMsg, 4000);
}

function clearMsg() {
  document.getElementById('msgBox').innerHTML = '';
}

async function updateView() {
  if (!token) {
    setView('auth');
    return;
  }
  try {
    const profile = await api('/profile.php', null, true, 'GET');
    if (!profile.username) {
      setView('profile');
    } else {
      window.myUsername = profile.username;
      isAdmin = !!profile.is_admin;
      document.getElementById('adminMaskEditorLink').classList.toggle('hidden', !isAdmin);
      const displayName = profile.username || 'Lieblingsmensch';
      document.getElementById('infoGreeting').textContent = `Hallo, ${displayName}!`;
      setView('info');
    }
  } catch (e) {
    // Token ungültig — api() hat bereits ausgeloggt und erneut updateView() aufgerufen
  }
}

function setView(view) {
  clearMsg();
  document.getElementById('authView').classList.toggle('hidden', view !== 'auth');
  document.getElementById('profileView').classList.toggle('hidden', view !== 'profile');
  document.getElementById('infoView').classList.toggle('hidden', view !== 'info');
  document.getElementById('mainView').classList.toggle('hidden', view !== 'feed');
  document.getElementById('boardView').classList.toggle('hidden', view !== 'board');
  document.getElementById('myMessagesView').classList.toggle('hidden', view !== 'myMessages');

  document.getElementById('logoutBtn').classList.toggle('hidden', view === 'auth');
  document.getElementById('homeBtn').classList.toggle('hidden', view === 'auth' || view === 'profile' || view === 'info');
  document.getElementById('shutterBtn').classList.toggle('hidden', view !== 'feed');

  if (view !== 'feed') {
    stopAutoAdvance();
    stopCommentPolling();
  }
  if (view === 'feed') {
    loadFeed();
    updateQueueBanner();
    flushQueue();
    resetAutoAdvance();
    startCommentPolling();
  }
  if (view === 'board') { loadBoard(); refreshLandingBadges(); }
  if (view === 'myMessages') loadMyMessages();
  if (view === 'info') {
    loadInfoPreferences();
    refreshLandingBadges();
  }
}

document.getElementById('homeBtn').onclick = () => setView('info');

async function api(path, body, needsAuth = false, method = 'POST') {
  const headers = { 'Content-Type': 'application/json' };
  if (needsAuth) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  });
  const data = await res.json();
  if (res.status === 401 && needsAuth) {
    token = null;
    localStorage.removeItem('wa_token');
    updateView();
    showMsg('Sitzung abgelaufen, bitte erneut anmelden.', 'error');
    throw new Error('Sitzung abgelaufen');
  }
  if (!res.ok) throw new Error(data.error || 'Unbekannter Fehler');
  return data;
}

function showAuthTab(tab) {
  document.getElementById('loginPanel').classList.toggle('hidden', tab !== 'login');
  document.getElementById('registerPanel').classList.toggle('hidden', tab !== 'register');
  document.getElementById('tabLoginBtn').classList.toggle('active', tab === 'login');
  document.getElementById('tabRegisterBtn').classList.toggle('active', tab === 'register');
}
document.getElementById('tabLoginBtn').onclick = () => showAuthTab('login');
document.getElementById('tabRegisterBtn').onclick = () => showAuthTab('register');

let pendingRegisterEmail = null;

document.getElementById('registerBtn').onclick = async () => {
  const email = document.getElementById('regEmail').value;
  const password = document.getElementById('regPassword').value;
  try {
    const data = await api('/register.php', { email, password });
    pendingRegisterEmail = email;
    document.getElementById('totpArea').classList.remove('hidden');
    document.getElementById('totpSecret').textContent = data.totp_secret;
    document.getElementById('totpQr').innerHTML = '';
    new QRCode(document.getElementById('totpQr'), {
      text: data.provisioning_uri, width: 200, height: 200,
      colorDark: '#14151a', colorLight: '#fffdf8',
    });
    showMsg('Konto angelegt. QR-Code scannen oder Schlüssel eintragen, dann Code eingeben.', 'ok');
  } catch (e) { showMsg(e.message, 'error'); }
};

document.getElementById('verifyBtn').onclick = async () => {
  const code = document.getElementById('regConfirmCode').value;
  try {
    const data = await api('/verify-2fa.php', { email: pendingRegisterEmail, code });
    token = data.token;
    localStorage.setItem('wa_token', token);
    showMsg('Code bestätigt. Du bist angemeldet.', 'ok');
    updateView();
  } catch (e) { showMsg(e.message, 'error'); }
};

document.getElementById('loginBtn').onclick = async () => {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const code = document.getElementById('loginCode').value;
  try {
    const data = await api('/login.php', { email, password, code });
    token = data.token;
    localStorage.setItem('wa_token', token);
    showMsg('Angemeldet.', 'ok');
    updateView();
  } catch (e) { showMsg(e.message, 'error'); }
};

document.getElementById('logoutBtn').onclick = () => {
  token = null;
  localStorage.removeItem('wa_token');
  updateView();
};

let profileAvatarBase64 = null;

document.getElementById('profileTakeSelfieBtn').onclick = () => {
  document.getElementById('profileAvatarInput').value = '';
  document.getElementById('profileAvatarInput').click();
};

document.getElementById('profileAvatarInput').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    profileAvatarBase64 = reader.result.split(',')[1];
    document.getElementById('profileAvatarPreview').src = reader.result;
    document.getElementById('profileAvatarPreviewWrap').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
};

document.getElementById('profileSaveBtn').onclick = async () => {
  const username = document.getElementById('profileUsername').value.trim();
  if (!username) { showMsg('Bitte einen Namen eingeben.', 'error'); return; }
  if (!profileAvatarBase64) { showMsg('Bitte zuerst ein Selfie aufnehmen.', 'error'); return; }
  try {
    await api('/complete-profile.php', { username, avatar_base64: profileAvatarBase64 }, true);
    showMsg('Profil gespeichert.', 'ok');
    updateView();
  } catch (e) { showMsg(e.message, 'error'); }
};

document.getElementById('shutterBtn').onclick = () => {
  document.getElementById('cameraInput').value = '';
  document.getElementById('cameraInput').click();
};

let pendingPhotoFile = null;
let pendingPhotoBase64 = null;

document.getElementById('cameraInput').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  pendingPhotoFile = file;
  const reader = new FileReader();
  reader.onload = () => {
    pendingPhotoBase64 = reader.result.split(',')[1];
    document.getElementById('capturePreview').src = reader.result;
    document.getElementById('captureCaption').value = '';
    document.getElementById('captureOverlay').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
};

document.getElementById('captureCancelBtn').onclick = () => {
  pendingPhotoFile = null;
  pendingPhotoBase64 = null;
  document.getElementById('captureOverlay').classList.add('hidden');
  resetAutoAdvance();
};

document.getElementById('captureSendBtn').onclick = async () => {
  if (!pendingPhotoBase64) return;
  const caption = document.getElementById('captureCaption').value.trim();
  const filename = pendingPhotoFile.name;
  const base64 = pendingPhotoBase64;

  document.getElementById('captureOverlay').classList.add('hidden');
  pendingPhotoFile = null;
  pendingPhotoBase64 = null;

  try {
    const upload = await api('/upload-photo.php', { filename, content_base64: base64 }, true);
    if (caption) {
      await api('/comment.php', { photo_id: upload.photo_id, text: caption }, true);
    }
    showMsg('Foto gesendet.', 'ok');
    loadFeed();
    resetAutoAdvance();
  } catch (e) {
    const offline = !navigator.onLine || /Failed to fetch|NetworkError|Load failed/i.test(e.message);
    if (offline) {
      await queueAdd({ filename, base64, caption, createdAt: Date.now() });
      await updateQueueBanner();
      showMsg('Kein Netz gerade — Foto ist lokal gespeichert und wird automatisch gesendet, sobald wieder Verbindung besteht.', 'error');
    } else {
      showMsg(e.message, 'error');
    }
    resetAutoAdvance();
  }
};

// -- Automatisches Weiterschalten alle 5 Sekunden, endlos --------------
// Pausiert, solange der Nutzer tippt oder gerade selbst interagiert hat.
// Eigene Scroll-Animation statt native "smooth" — die ist nicht in der
// Geschwindigkeit einstellbar. 900ms mit sanftem Ausklingen wirkt ruhiger.
function smoothScrollTo(el, targetTop, duration = 900) {
  const startTop = el.scrollTop;
  const distance = targetTop - startTop;
  if (distance === 0) return;
  const startTime = performance.now();
  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out
    el.scrollTop = startTop + distance * eased;
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

let autoAdvanceTimer = null;

function resetAutoAdvance() {
  clearTimeout(autoAdvanceTimer);
  autoAdvanceTimer = setTimeout(advanceSlide, 12000);
}

function stopAutoAdvance() {
  clearTimeout(autoAdvanceTimer);
  autoAdvanceTimer = null;
}

async function advanceSlide() {
  const feedEl = document.getElementById('feed');
  const screens = feedEl.querySelectorAll('.photo-screen');
  if (!screens.length) { resetAutoAdvance(); return; }

  const perScreen = feedEl.clientHeight;
  const currentIndex = Math.round(feedEl.scrollTop / perScreen);
  let nextIndex = currentIndex + 1;

  if (nextIndex >= screens.length) {
    if (feedHasMore) {
      await loadMoreFeed();
      const newScreens = feedEl.querySelectorAll('.photo-screen');
      nextIndex = newScreens.length > screens.length ? screens.length : 0;
    } else {
      nextIndex = 0; // endlos: zurück zum ersten Foto
    }
  }

  smoothScrollTo(feedEl, nextIndex * perScreen);
  resetAutoAdvance();
}

// Jede eigene Interaktion setzt den 5-Sekunden-Countdown zurück
document.getElementById('feed').addEventListener('scroll', resetAutoAdvance);
document.getElementById('feed').addEventListener('click', resetAutoAdvance);
document.getElementById('feed').addEventListener('focusin', (e) => {
  if (e.target.tagName === 'INPUT') stopAutoAdvance(); // beim Tippen ganz pausieren
});
document.getElementById('feed').addEventListener('focusout', (e) => {
  if (e.target.tagName === 'INPUT') resetAutoAdvance();
});
document.getElementById('shutterBtn').addEventListener('click', stopAutoAdvance);

// -- Live-Updates für Kommentare/Reaktionen -----------------------------
// Fragt alle 6 Sekunden nur das aktuell sichtbare Foto ab und aktualisiert
// es an Ort und Stelle, ohne den Feed neu zu rendern oder den Scroll zu stören.
let commentPollTimer = null;

function startCommentPolling() {
  stopCommentPolling();
  commentPollTimer = setInterval(pollVisiblePhoto, 6000);
}

function stopCommentPolling() {
  if (commentPollTimer) clearInterval(commentPollTimer);
  commentPollTimer = null;
}

async function pollVisiblePhoto() {
  const feedEl = document.getElementById('feed');
  const screens = feedEl.querySelectorAll('.photo-screen');
  if (!screens.length) return;
  const perScreen = feedEl.clientHeight;
  const index = Math.min(Math.round(feedEl.scrollTop / perScreen), screens.length - 1);
  const screen = screens[index];
  if (!screen) return;
  const photoId = screen.dataset.photoId;
  try {
    const data = await api(`/photo-status.php?id=${photoId}`, null, true, 'GET');
    updatePhotoCardLive(screen, data);
  } catch (e) {
    // Hintergrund-Update, still fehlschlagen statt Toast zu zeigen
  }
}

function updatePhotoCardLive(screen, data) {
  const order = ['heart', 'laugh', 'thumb', 'star'];
  screen.querySelectorAll('.action-btn').forEach((btn, i) => {
    const key = order[i];
    const countEl = btn.querySelector('.action-count');
    if (countEl) countEl.textContent = data.reaction_counts[key];
    if (key === 'heart') {
      const emojiEl = btn.querySelector('.action-emoji');
      if (emojiEl) emojiEl.style.fontSize = (26 + Math.min(data.reaction_counts.heart * 3, 20)) + 'px';
    }
  });

  const input = screen.querySelector('.inline-comment-form input');
  if (document.activeElement === input) return; // nicht mitten im Tippen stören

  const existingList = screen.querySelector('.comment-list-inline, .comment-empty-inline');
  const html = data.comments.length
    ? '<div class="comment-list-inline">' + data.comments.map(c =>
        `<div class="comment-item-inline"><img class="cmt-avatar" src="${BASE}${c.avatar_url}" alt=""><span><span class="who">${escapeHtml(c.username)}</span>${escapeHtml(c.text)}</span></div>`
      ).join('') + '</div>'
    : '<p class="comment-empty-inline">Noch kein Kommentar — schreib den ersten.</p>';
  if (existingList) existingList.outerHTML = html;
}

document.getElementById('refreshBtn').onclick = loadFeed;

// -- Infos zum Abend: Essens-/Getränkewunsch --------------------------------
async function loadInfoPreferences() {
  try {
    const profile = await api('/profile.php', null, true, 'GET');
    if (profile.food_preference) {
      document.getElementById('foodPreference').value = profile.food_preference;
    }
    if (profile.drink_wish) {
      document.getElementById('drinkWish').value = profile.drink_wish;
    }
  } catch (e) { /* still fehlschlagen, Formular bleibt auf Standardwerten */ }

  try {
    const overview = await api('/food-overview.php', null, true, 'GET');
    renderFoodOverview(overview);
  } catch (e) { /* Übersicht bleibt leer, kein Toast für Nebensache */ }
}

function renderFoodOverview(data) {
  const el = document.getElementById('foodOverview');
  const c = data.counts;
  let html = `
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
      <span class="reaction" style="background:var(--chip, var(--snow)); border-radius:16px; padding:5px 12px; font-size:13px;">🥦 Vegetarisch: ${c.vegetarisch}</span>
      <span style="background:var(--snow); border-radius:16px; padding:5px 12px; font-size:13px;">🍗 Flexitarisch: ${c.flexitarisch}</span>
      <span style="background:var(--snow); border-radius:16px; padding:5px 12px; font-size:13px;">🍽️ Alles: ${c.alles}</span>
      <span style="background:var(--snow); border-radius:16px; padding:5px 12px; font-size:13px; color:var(--muted);">Keine Angabe: ${c.keine_angabe}</span>
    </div>
  `;
  if (data.people.length) {
    html += data.people.map(p => `
      <div style="font-size:13px; padding:6px 0; border-top:1px solid var(--line);">
        <strong>${escapeHtml(p.username)}</strong> — ${escapeHtml(p.food_preference)}
        ${p.drink_wish ? ' · 🥤 ' + escapeHtml(p.drink_wish) : ''}
      </div>
    `).join('');
  } else {
    html += '<p class="panel-note">Noch niemand hat eine Angabe gemacht.</p>';
  }
  el.innerHTML = html;
}

document.getElementById('savePreferencesBtn').onclick = async () => {
  const food_preference = document.getElementById('foodPreference').value;
  const drink_wish = document.getElementById('drinkWish').value.trim();
  try {
    await api('/save-preferences.php', { food_preference, drink_wish }, true);
    showMsg('Danke, ist notiert!', 'ok');
    const overview = await api('/food-overview.php', null, true, 'GET');
    renderFoodOverview(overview);
  } catch (e) { showMsg(e.message, 'error'); }
};

// -- Schwarzes Brett -----------------------------------------------------
function setBadge(id, count) {
  const el = document.getElementById(id);
  if (count > 0) {
    el.textContent = count > 99 ? '99+' : count;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

async function fetchBoardData(mine) {
  return api('/board-list.php' + (mine ? '?mine=1' : ''), null, true, 'GET');
}

// Auf der Landingpage zeigen: wie viel Neues wartet, und ob "Meine
// Nachrichten" überhaupt auftauchen soll (nur wenn aktive eigene Beiträge da
// sind, oder wenn per Link erzwungen).
async function refreshLandingBadges() {
  try {
    const data = await fetchBoardData(false);
    const seen = localStorage.getItem('wa_board_seen_at') || '';
    setBadge('boardBadge', data.posts.filter(p => p.created_at > seen).length);
  } catch (e) { /* still fehlschlagen, Badge bleibt wie es war */ }

  try {
    const mineData = await fetchBoardData(true);
    const activeMine = mineData.posts.filter(p => !p.hidden);
    const forceShow = localStorage.getItem('wa_force_show_my_messages') === '1';
    const show = activeMine.length > 0 || forceShow;
    document.getElementById('myMessagesNavCard').classList.toggle('hidden', !show);
    document.getElementById('showMyMessagesLink').classList.toggle('hidden', show);

    const seenMine = localStorage.getItem('wa_my_messages_seen_at') || '';
    let newCount = 0;
    mineData.posts.forEach(p => p.comments.forEach(c => { if (c.created_at > seenMine) newCount++; }));
    setBadge('myMessagesBadge', newCount);
  } catch (e) { /* leise fehlschlagen */ }
}

function forceShowMyMessages() {
  localStorage.setItem('wa_force_show_my_messages', '1');
  refreshLandingBadges();
}

async function loadBoard() {
  try {
    const data = await fetchBoardData(false);
    renderBoard(data.posts);
    if (data.posts.length) {
      localStorage.setItem('wa_board_seen_at', data.posts[0].created_at); // erstes = neuestes
    }
    setBadge('boardBadge', 0);
  } catch (e) { showMsg(e.message, 'error'); }
}

async function loadMyMessages() {
  try {
    const data = await fetchBoardData(true);
    renderMyMessages(data.posts);
    let latestComment = '';
    data.posts.forEach(p => p.comments.forEach(c => { if (c.created_at > latestComment) latestComment = c.created_at; }));
    if (latestComment) localStorage.setItem('wa_my_messages_seen_at', latestComment);
    setBadge('myMessagesBadge', 0);
  } catch (e) { showMsg(e.message, 'error'); }
}

function renderMyMessages(posts) {
  const el = document.getElementById('myMessagesList');
  if (!posts.length) {
    el.innerHTML = '<p class="panel-note">Du hast noch keinen Beitrag geschrieben.</p>';
    return;
  }
  el.innerHTML = posts.map(p => {
    const commentsHtml = p.comments.length
      ? p.comments.map(c => `
          <div class="comment-item-inline" style="color:var(--ink); text-shadow:none;">
            <img class="cmt-avatar" src="${BASE}${c.avatar_url}" alt="">
            <span><span class="who" style="color:var(--pink-deep);">${escapeHtml(c.username)}</span>${escapeHtml(c.text)}</span>
          </div>`).join('')
      : '<p class="panel-note" style="margin:0;">Noch keine Antworten.</p>';
    return `
      <div class="panel" style="${p.hidden ? 'opacity:0.55;' : ''}">
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">
          ${escapeHtml(p.created_at)}${p.hidden ? ' · <em>ausgeblendet</em>' : ''}
        </div>
        <div style="font-size:14px; white-space:pre-wrap; margin-bottom:10px;">${escapeHtml(p.text)}</div>
        <div style="border-top:1px solid var(--line); padding-top:8px;">${commentsHtml}</div>
      </div>
    `;
  }).join('');
}

function renderBoard(posts) {
  const el = document.getElementById('boardList');
  if (!posts.length) {
    el.innerHTML = '<p class="panel-note">Noch nichts gepostet — sei die erste Person.</p>';
    return;
  }
  el.innerHTML = posts.map(p => {
    const commentsHtml = p.comments.length
      ? p.comments.map(c =>
          `<div class="comment-item-inline" style="color:var(--ink); text-shadow:none;">
             <img class="cmt-avatar" src="${BASE}${c.avatar_url}" alt="">
             <span><span class="who" style="color:var(--pink-deep);">${escapeHtml(c.username)}</span>${escapeHtml(c.text)}</span>
           </div>`
        ).join('')
      : '<p class="panel-note" style="margin:0 0 8px;">Noch kein Kommentar.</p>';

    const ownerControls = p.is_owner ? `
      <div style="display:flex; gap:8px; margin-top:8px;">
        <button class="btn btn-quiet" style="font-size:12px; padding:6px 10px;" onclick="toggleBoardComments(${p.id}, ${p.comments_enabled})">
          ${p.comments_enabled ? 'Kommentare deaktivieren' : 'Kommentare aktivieren'}
        </button>
        <button class="btn btn-quiet" style="font-size:12px; padding:6px 10px;" onclick="hideBoardPost(${p.id})">Beitrag ausblenden</button>
      </div>` : '';

    const commentForm = p.comments_enabled ? `
      <div class="inline-comment-form" style="margin-top:8px;">
        <input type="text" placeholder="Antworten..." id="board-cmt-${p.id}">
        <button class="btn-send" style="background:var(--pink);" onclick="addBoardComment(${p.id})">➤</button>
      </div>` : '<p class="panel-note" style="margin:8px 0 0;">Kommentare sind für diesen Beitrag deaktiviert.</p>';

    return `
      <div class="panel" id="board-post-${p.id}">
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">
          <strong style="color:var(--pink-deep);">${escapeHtml(p.username)}</strong> · ${escapeHtml(p.created_at)}
        </div>
        <div style="font-size:14px; white-space:pre-wrap; margin-bottom:10px;">${escapeHtml(p.text)}</div>
        <div style="border-top:1px solid var(--line); padding-top:8px;">${commentsHtml}</div>
        ${commentForm}
        ${ownerControls}
      </div>
    `;
  }).join('');
}

async function addBoardComment(postId) {
  const input = document.getElementById('board-cmt-' + postId);
  const text = input.value.trim();
  if (!text) return;
  try {
    await api('/board-comment.php', { post_id: postId, text }, true);
    input.value = '';
    loadBoard();
  } catch (e) { showMsg(e.message, 'error'); }
}

async function toggleBoardComments(postId, currentlyEnabled) {
  try {
    await api('/board-toggle-comments.php', { post_id: postId, enabled: !currentlyEnabled }, true);
    loadBoard();
  } catch (e) { showMsg(e.message, 'error'); }
}

async function hideBoardPost(postId) {
  if (!confirm('Beitrag wirklich ausblenden? Das kann nicht rückgängig gemacht werden.')) return;
  try {
    await api('/board-hide.php', { post_id: postId }, true);
    loadBoard();
  } catch (e) { showMsg(e.message, 'error'); }
}

document.getElementById('boardPostBtn').onclick = async () => {
  const textEl = document.getElementById('boardText');
  const text = textEl.value.trim();
  if (!text) return;
  try {
    await api('/board-post.php', { text }, true);
    textEl.value = '';
    loadBoard();
  } catch (e) { showMsg(e.message, 'error'); }
};

// -- Fokus-Modus: Foto antippen blendet alles andere aus -----------------
function toggleFocusMode(forceState) {
  const active = forceState !== undefined ? forceState : !document.body.classList.contains('focus-mode');
  document.body.classList.toggle('focus-mode', active);
  document.getElementById('focusCloseBtn').classList.toggle('hidden', !active);
}

document.getElementById('feed').addEventListener('click', (e) => {
  if (e.target.classList.contains('photo-full')) toggleFocusMode();
});
document.getElementById('focusCloseBtn').onclick = () => toggleFocusMode(false);

// -- Horizontale Wischgeste: zusätzlich zu hoch/runter auch links/rechts --
// navigiert durch dieselbe Foto-Reihenfolge, nicht durch eine zweite Ebene.
let touchStartX = 0, touchStartY = 0, touchStartTarget = null;

document.getElementById('feed').addEventListener('touchstart', (e) => {
  touchStartTarget = e.target;
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });

document.getElementById('feed').addEventListener('touchend', (e) => {
  if (touchStartTarget && touchStartTarget.closest('input, button, .inline-comment-form')) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    navigateFeed(dx < 0 ? 1 : -1);
  }
}, { passive: true });

function navigateFeed(direction) {
  const feedEl = document.getElementById('feed');
  const screens = feedEl.querySelectorAll('.photo-screen');
  if (!screens.length) return;
  const perScreen = feedEl.clientHeight;
  const currentIndex = Math.round(feedEl.scrollTop / perScreen);
  const nextIndex = Math.max(0, Math.min(currentIndex + direction, screens.length - 1));
  smoothScrollTo(feedEl, nextIndex * perScreen);
  resetAutoAdvance();
  if (direction > 0 && nextIndex === screens.length - 1 && feedHasMore) loadMoreFeed();
}

let feedNextBefore = null;
let feedHasMore = false;
let feedLoading = false;
let isAdmin = false;

async function loadFeed() {
  feedNextBefore = null;
  feedHasMore = false;
  try {
    const data = await api('/feed.php?limit=10', null, true, 'GET');
    isAdmin = !!data.is_admin;
    renderFeed(data.photos);
    feedHasMore = data.has_more;
    feedNextBefore = data.next_before;
  } catch (e) { showMsg(e.message, 'error'); }
}

async function loadMoreFeed() {
  if (!feedHasMore || feedLoading || !token) return;
  feedLoading = true;
  const feedEl = document.getElementById('feed');
  feedEl.insertAdjacentHTML('beforeend', '<p class="feed-loading" id="feedLoadingIndicator">Lädt weitere Fotos …</p>');
  try {
    const data = await api(`/feed.php?limit=10&before=${feedNextBefore}`, null, true, 'GET');
    document.getElementById('feedLoadingIndicator')?.remove();
    appendFeed(data.photos);
    feedHasMore = data.has_more;
    feedNextBefore = data.next_before;
  } catch (e) {
    document.getElementById('feedLoadingIndicator')?.remove();
    showMsg(e.message, 'error');
  } finally {
    feedLoading = false;
  }
}

// Nachladen, sobald man sich dem Ende des bisher geladenen Feeds nähert —
// wichtig am Abend der VA, wenn ~100 Leute gleichzeitig Fotos hochladen und
// der Feed schnell lang wird: nie alles auf einmal laden.
document.getElementById('feed').addEventListener('scroll', (e) => {
  const el = e.target;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - el.clientHeight * 1.2) {
    loadMoreFeed();
  }
});

const EMOJI = {
  heart: String.fromCodePoint(0x2764, 0xFE0F),
  laugh: String.fromCodePoint(0x1F602),
  thumb: String.fromCodePoint(0x1F44D),
  star:  String.fromCodePoint(0x2B50),
};

async function deletePhoto(photoId) {
  if (!confirm('Dieses Foto wirklich endgültig löschen? Das kann nicht rückgängig gemacht werden.')) return;
  try {
    await api('/delete-photo.php', { photo_id: photoId }, true);
    showMsg('Foto gelöscht.', 'ok');
    loadFeed();
  } catch (e) { showMsg(e.message, 'error'); }
}

function buildPhotoCard(p) {
  const r = p.reaction_counts || { heart: p.heart_count || 0, laugh: 0, thumb: 0, star: 0 };
  const heartSize = 26 + Math.min(r.heart * 3, 20);
  const commentsHtml = p.comments.length
    ? '<div class="comment-list-inline">' + p.comments.map(c =>
        `<div class="comment-item-inline"><img class="cmt-avatar" src="${BASE}${c.avatar_url}" alt=""><span><span class="who">${escapeHtml(c.username)}</span>${escapeHtml(c.text)}</span></div>`
      ).join('') + '</div>'
    : '<p class="comment-empty-inline">Noch kein Kommentar — schreib den ersten.</p>';
  const deleteBtn = isAdmin
    ? `<button class="admin-delete-btn" onclick="deletePhoto(${p.id})" title="Foto löschen (Admin)">🗑️</button>`
    : '';
  return `
    <section class="photo-screen" data-photo-id="${p.id}">
      <img class="photo-full" src="${BASE}${p.view_url}" alt="${p.filename}" loading="lazy">
      ${deleteBtn}

      <div class="action-bar">
        <button class="action-btn" onclick="react(${p.id}, 'heart')">
          <span class="action-emoji" style="font-size:${heartSize}px;">❤️</span>
          <span class="action-count">${r.heart}</span>
        </button>
        <button class="action-btn" onclick="react(${p.id}, 'laugh')">
          <span class="action-emoji">😂</span>
          <span class="action-count">${r.laugh}</span>
        </button>
        <button class="action-btn" onclick="react(${p.id}, 'thumb')">
          <span class="action-emoji">👍</span>
          <span class="action-count">${r.thumb}</span>
        </button>
        <button class="action-btn" onclick="react(${p.id}, 'star')">
          <span class="action-emoji">⭐</span>
          <span class="action-count">${r.star}</span>
        </button>
      </div>

      <div class="bottom-panel">
        ${commentsHtml}
        <div class="inline-comment-form">
          <input type="text" placeholder="Kommentar schreiben..." id="cmt-${p.id}">
          <button class="btn-send" onclick="addComment(${p.id})">➤</button>
        </div>
      </div>
    </section>
  `;
}

function renderFeed(photos) {
  const feedEl = document.getElementById('feed');
  if (!photos.length) {
    feedEl.innerHTML = '<p class="feed-empty">Noch kein Foto da. Lade oben eins hoch, um loszulegen.</p>';
    return;
  }
  feedEl.innerHTML = photos.map(buildPhotoCard).join('');
}

function appendFeed(photos) {
  if (!photos.length) return;
  document.getElementById('feed').insertAdjacentHTML('beforeend', photos.map(buildPhotoCard).join(''));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function react(photoId, key) {
  try {
    await api('/react.php', { photo_id: photoId, emoji: EMOJI[key] }, true);
    loadFeed();
  } catch (e) { showMsg(e.message, 'error'); }
}

async function addComment(photoId) {
  const input = document.getElementById('cmt-' + photoId);
  const text = input.value.trim();
  if (!text) return;
  try {
    await api('/comment.php', { photo_id: photoId, text }, true);
    input.value = '';
    loadFeed();
  } catch (e) { showMsg(e.message, 'error'); }
}

updateView();
