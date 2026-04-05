// ── Firebase Config ──
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAu8tzzrqKizHt2_0_-6r6DJU02szqtgEA",
  authDomain: "fir-3fa84.firebaseapp.com",
  databaseURL: "https://fir-3fa84-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "fir-3fa84",
  storageBucket: "fir-3fa84.firebasestorage.app",
  messagingSenderId: "725404219596",
  appId: "1:725404219596:web:34ab5087aeed5b9bb1aa69",
  measurementId: "G-X25715CQHB"
};

if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);

const auth = firebase.auth();
const db   = firebase.database();

// ── Constants ──
const IMGBB_KEY   = '120a27bcbb28d3ffd9f03bc4b32bb54f';
const EMAIL_DOMAIN = 'anon.ru';
const DEFAULT_AVATAR = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="%231e1e30"/><circle cx="20" cy="15" r="8" fill="%237c4dff"/><ellipse cx="20" cy="36" rx="14" ry="10" fill="%237c4dff"/></svg>';

const CORS_PROXIES = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.org/?'
];

// ── Auth helpers ──
const usernameToEmail = u => `${u.toLowerCase()}@${EMAIL_DOMAIN}`;
const emailToUsername = e => e.replace(`@${EMAIL_DOMAIN}`, '');

let _currentUser = null;
let _currentUserData = null;
const _authListeners = [];

auth.onAuthStateChanged(async user => {
  _currentUser = user;
  if (user) {
    const snap = await db.ref('users/' + user.uid).once('value');
    _currentUserData = snap.val() || {};
  } else {
    _currentUserData = null;
  }
  _authListeners.forEach(fn => fn(user, _currentUserData));
  _updateNavbar();
});

function onAuthChange(fn) { _authListeners.push(fn); }
function getCurrentUser()     { return _currentUser; }
function getCurrentUserData() { return _currentUserData; }

async function registerUser(username, password) {
  const email = usernameToEmail(username);
  // Check if username is taken
  const snap = await db.ref('usernames/' + username.toLowerCase()).once('value');
  if (snap.exists()) throw new Error('Имя пользователя уже занято');
  
  const cred = await auth.createUserWithEmailAndPassword(email, password);
  const uid  = cred.user.uid;

  const userData = {
    username: username.toLowerCase(),
    email,
    avatar: '',
    status: '',
    about: '',
    createdAt: Date.now()
  };
  await db.ref('users/' + uid).set(userData);
  await db.ref('usernames/' + username.toLowerCase()).set(uid);
  return cred.user;
}

async function loginUser(username, password) {
  const email = usernameToEmail(username);
  return auth.signInWithEmailAndPassword(email, password);
}

function logoutUser() { return auth.signOut(); }

// ── Navbar update ──
function _updateNavbar() {
  const navActions = document.getElementById('nav-actions');
  if (!navActions) return;

  if (_currentUser && _currentUserData) {
    const avatar = _currentUserData.avatar || DEFAULT_AVATAR;
    navActions.innerHTML = `
      <a href="upload.html" class="btn btn-primary" style="font-size:13px">
        ＋ Загрузить
      </a>
      <a href="profile.html?uid=${_currentUser.uid}" class="nav-user">
        <img src="${avatar}" class="nav-avatar" alt="avatar" onerror="this.src='${DEFAULT_AVATAR}'">
        <span class="nav-username">@${_currentUserData.username}</span>
      </a>
    `;
  } else {
    navActions.innerHTML = `
      <a href="login.html" class="btn btn-ghost">Войти</a>
      <a href="login.html?tab=register" class="btn btn-primary">Регистрация</a>
    `;
  }
}

// ── Toast ──
function toast(msg, type = '') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── Upload: Image via imgbb + mirrors ──
async function uploadImageFile(file) {
  // Primary: imgbb
  try {
    const base64 = await _toBase64(file);
    const fd = new FormData();
    fd.append('key', IMGBB_KEY);
    fd.append('image', base64.split(',')[1]);
    const r = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: fd });
    const d = await r.json();
    if (d.success) {
      return { primary: d.data.url, display: d.data.display_url, thumb: d.data.thumb?.url || d.data.url, source: 'imgbb' };
    }
  } catch(e) { console.warn('imgbb failed:', e); }

  // Fallback: telegra.ph
  try {
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('https://telegra.ph/upload', { method: 'POST', body: fd });
    const d = await r.json();
    if (Array.isArray(d) && d[0]?.src) {
      const url = 'https://telegra.ph' + d[0].src;
      return { primary: url, display: url, thumb: url, source: 'telegra.ph' };
    }
  } catch(e) { console.warn('telegra.ph failed:', e); }

  throw new Error('Не удалось загрузить изображение. Попробуйте снова.');
}

// ── Upload: Video via catbox + mirrors ──
async function uploadVideoFile(file) {
  const fd = new FormData();
  fd.append('reqtype', 'fileupload');
  fd.append('fileToUpload', file);

  // Try catbox via proxies
  for (const proxy of CORS_PROXIES) {
    try {
      const r = await fetch(proxy + encodeURIComponent('https://catbox.moe/user/api.php'), {
        method: 'POST',
        body: fd
      });
      const text = await r.text();
      if (text.startsWith('https://')) {
        return { primary: text.trim(), display: text.trim(), thumb: '', source: 'catbox' };
      }
    } catch(e) { console.warn('catbox via ' + proxy + ' failed:', e); }
  }

  // Fallback: litterbox (temporary 72h)
  try {
    const fd2 = new FormData();
    fd2.append('reqtype', 'fileupload');
    fd2.append('time', '72h');
    fd2.append('fileToUpload', file);
    for (const proxy of CORS_PROXIES) {
      try {
        const r = await fetch(proxy + encodeURIComponent('https://litterbox.catbox.moe/resources/internals/api.php'), {
          method: 'POST', body: fd2
        });
        const text = await r.text();
        if (text.startsWith('https://')) {
          return { primary: text.trim(), display: text.trim(), thumb: '', source: 'litterbox' };
        }
      } catch(e) { continue; }
    }
  } catch(e) { console.warn('litterbox failed:', e); }

  throw new Error('Не удалось загрузить видео. Проверьте интернет-соединение.');
}

function _toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

// ── Tag helpers ──
function parseTags(str) {
  return str.trim().split(/[\s,]+/).map(t => t.toLowerCase().replace(/[^a-zа-яё0-9_\-]/gi, '')).filter(Boolean);
}

function parseHashTags(text) {
  const matches = text.match(/#([a-zа-яё0-9_\-]+)/gi) || [];
  return matches.map(m => m.slice(1).toLowerCase());
}

function renderTextWithMarkup(text) {
  if (!text) return '';
  // Escape HTML
  let safe = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // #tags
  safe = safe.replace(/#([a-zа-яё0-9_\-]+)/gi,
    (_, t) => `<a class="inline-tag" href="index.html?tag=${encodeURIComponent(t)}">#${t}</a>`);
  // @mentions
  safe = safe.replace(/@([a-z0-9_\-]+)/gi,
    (_, u) => `<a class="mention" href="profile.html?username=${encodeURIComponent(u)}">@${u}</a>`);
  // newlines
  safe = safe.replace(/\n/g, '<br>');
  return safe;
}

// ── Tag index updates ──
async function updateTagCounts(tags, delta) {
  const updates = {};
  for (const tag of tags) {
    if (!tag) continue;
    const snap = await db.ref('tags/' + tag).once('value');
    const current = snap.val()?.count || 0;
    updates['tags/' + tag + '/count'] = Math.max(0, current + delta);
  }
  if (Object.keys(updates).length) await db.ref().update(updates);
}

// ── Format date ──
function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60000)   return 'только что';
  if (diff < 3600000) return Math.floor(diff/60000) + ' мин назад';
  if (diff < 86400000)return Math.floor(diff/3600000) + ' ч назад';
  if (diff < 604800000)return Math.floor(diff/86400000) + ' д назад';
  return d.toLocaleDateString('ru-RU');
}

// ── Get user data by uid ──
const _userCache = {};
async function getUserData(uid) {
  if (_userCache[uid]) return _userCache[uid];
  const snap = await db.ref('users/' + uid).once('value');
  _userCache[uid] = snap.val() || { username: 'unknown', avatar: '' };
  return _userCache[uid];
}

async function getUserByUsername(username) {
  const snap = await db.ref('usernames/' + username.toLowerCase()).once('value');
  if (!snap.exists()) return null;
  const uid = snap.val();
  return { uid, ...(await getUserData(uid)) };
}

// ── All users for @ mention ──
async function getAllUsers() {
  const snap = await db.ref('users').once('value');
  const all = [];
  snap.forEach(c => all.push({ uid: c.key, ...c.val() }));
  return all;
}

// ── Search bar tag autocomplete setup ──
function setupSearchBar(inputEl, onSearch) {
  const dropdown = document.createElement('div');
  dropdown.className = 'search-dropdown autocomplete-dropdown';
  inputEl.parentElement.style.position = 'relative';
  inputEl.parentElement.appendChild(dropdown);

  let activeTags = [];

  inputEl.addEventListener('input', async () => {
    const q = inputEl.value.trim().toLowerCase();
    if (!q) { dropdown.classList.remove('open'); return; }
    const snap = await db.ref('tags').orderByChild('count').limitToLast(20).once('value');
    const matches = [];
    snap.forEach(c => {
      if (c.key.includes(q) && !activeTags.includes(c.key))
        matches.push({ name: c.key, count: c.val().count || 0 });
    });
    matches.sort((a, b) => b.count - a.count);
    if (!matches.length) { dropdown.classList.remove('open'); return; }
    dropdown.innerHTML = matches.slice(0, 8).map(m =>
      `<div class="autocomplete-item" data-tag="${m.name}">
        <span class="ac-tag">${m.name}</span>
        <span class="ac-count">${m.count} постов</span>
      </div>`
    ).join('');
    dropdown.classList.add('open');
  });

  dropdown.addEventListener('click', e => {
    const item = e.target.closest('.autocomplete-item');
    if (!item) return;
    const tag = item.dataset.tag;
    activeTags.push(tag);
    inputEl.value = '';
    dropdown.classList.remove('open');
    onSearch(activeTags);
    renderActiveTags();
  });

  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = inputEl.value.trim().toLowerCase();
      if (q && !activeTags.includes(q)) {
        activeTags.push(q);
        inputEl.value = '';
        dropdown.classList.remove('open');
        onSearch(activeTags);
        renderActiveTags();
      }
    }
    if (e.key === 'Escape') dropdown.classList.remove('open');
  });

  document.addEventListener('click', e => {
    if (!inputEl.parentElement.contains(e.target)) dropdown.classList.remove('open');
  });

  function renderActiveTags() {
    let bar = document.getElementById('active-tags-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'active-tags-bar';
      bar.className = 'active-search-tags';
      document.querySelector('.main-content')?.prepend(bar);
    }
    if (!activeTags.length) { bar.remove(); return; }
    bar.innerHTML = activeTags.map(t =>
      `<span class="search-tag-active">${t} <button data-tag="${t}">×</button></span>`
    ).join('');
    bar.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        activeTags = activeTags.filter(t => t !== btn.dataset.tag);
        renderActiveTags();
        onSearch(activeTags);
      };
    });
  }

  return {
    getActiveTags: () => activeTags,
    clearTags: () => { activeTags = []; renderActiveTags(); }
  };
}
