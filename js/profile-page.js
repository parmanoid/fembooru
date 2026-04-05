// ── Profile Page ──
let profileUid       = null;
let profileData      = null;
let activeTab        = 'posts';

document.addEventListener('DOMContentLoaded', async () => {
  const params   = new URLSearchParams(location.search);
  const uidParam = params.get('uid');
  const nameParam= params.get('username');

  if (nameParam) {
    const user = await getUserByUsername(nameParam);
    if (!user) { showError('Пользователь не найден'); return; }
    profileUid  = user.uid;
    profileData = user;
  } else if (uidParam) {
    profileUid = uidParam;
    profileData = await getUserData(uidParam);
  } else {
    // Own profile
    onAuthChange(user => {
      if (!user) { location.href = 'login.html'; return; }
      profileUid  = user.uid;
      profileData = getCurrentUserData();
      renderProfile();
      loadTab('posts');
    });
    return;
  }

  renderProfile();
  loadTab('posts');

  onAuthChange(() => {
    // Refresh edit button visibility
    const editBtn = document.getElementById('edit-profile-btn');
    const curr = getCurrentUser();
    if (editBtn) editBtn.style.display = curr && curr.uid === profileUid ? '' : 'none';
  });
});

function renderProfile() {
  if (!profileData) return;

  document.title = '@' + profileData.username + ' — Booru';

  const avatar = profileData.avatar || DEFAULT_AVATAR;
  document.getElementById('profile-avatar').src = avatar;
  document.getElementById('profile-avatar').onerror = function() { this.src = DEFAULT_AVATAR; };
  document.getElementById('profile-username').textContent = '@' + profileData.username;

  const statusEl = document.getElementById('profile-status');
  if (profileData.status) {
    statusEl.innerHTML = `💭 ${escHtml(profileData.status)}`;
    statusEl.style.display = 'inline-flex';
  } else {
    statusEl.style.display = 'none';
  }

  const aboutEl = document.getElementById('profile-about');
  aboutEl.innerHTML = profileData.about ? renderTextWithMarkup(profileData.about) : '';
  aboutEl.style.display = profileData.about ? 'block' : 'none';
}

async function loadTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.profile-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });

  const content = document.getElementById('profile-content');
  content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  if (tab === 'posts') {
    await loadUserPosts(content);
  } else {
    await loadUserReposts(content);
  }
}

async function loadUserPosts(container) {
  const snap = await db.ref('posts')
    .orderByChild('uid')
    .equalTo(profileUid)
    .once('value');

  const posts = [];
  snap.forEach(c => posts.unshift({ id: c.key, ...c.val() }));

  if (!posts.length) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">📭</div>
      <div class="empty-state-text">Нет постов</div></div>`;
    return;
  }

  // Update post count
  const countEl = document.getElementById('posts-count');
  if (countEl) countEl.textContent = posts.length;

  renderPostGrid(container, posts);
}

async function loadUserReposts(container) {
  const snap = await db.ref('reposts/' + profileUid)
    .orderByChild('createdAt')
    .once('value');

  const reposts = [];
  snap.forEach(c => reposts.unshift(c.val()));

  if (!reposts.length) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">🔁</div>
      <div class="empty-state-text">Нет репостов</div></div>`;
    return;
  }

  const posts = [];
  for (const r of reposts) {
    const pSnap = await db.ref('posts/' + r.postId).once('value');
    if (pSnap.exists()) posts.push({ id: r.postId, ...pSnap.val() });
  }

  renderPostGrid(container, posts);
}

function renderPostGrid(container, posts) {
  const grid = document.createElement('div');
  grid.className = 'posts-grid';

  posts.forEach(post => {
    const thumb = post.thumb || post.mediaUrl || '';
    const isVideo = post.mediaType === 'video';
    const card = document.createElement('div');
    card.className = 'post-card';
    card.innerHTML = `
      <div class="post-card-media" onclick="location.href='post.html?id=${post.id}'">
        ${isVideo
          ? `<video src="${thumb}" muted preload="none"></video>
             <span class="media-type-badge">▶ Видео</span>`
          : `<img src="${thumb}" alt="" loading="lazy">`}
      </div>
      <div class="post-card-body">
        <div class="post-card-title" onclick="location.href='post.html?id=${post.id}'">${escHtml(post.title) || '(без названия)'}</div>
        <div class="post-card-stats">
          <span class="post-stat">♡ ${post.likeCount||0}</span>
          <span class="post-stat">💬 ${post.commentCount||0}</span>
        </div>
      </div>`;
    grid.appendChild(card);
  });

  container.innerHTML = '';
  container.appendChild(grid);
}

// ── Edit Profile ──
window.openEditProfile = function() {
  const user = getCurrentUser();
  if (!user || user.uid !== profileUid) return;

  const modal = document.getElementById('edit-modal');
  modal.querySelector('#edit-status').value = profileData.status || '';
  modal.querySelector('#edit-about').value  = profileData.about  || '';
  modal.style.display = 'flex';
};

window.closeEditProfile = function() {
  document.getElementById('edit-modal').style.display = 'none';
};

window.saveProfile = async function() {
  const user = getCurrentUser();
  if (!user) return;

  const status = document.getElementById('edit-status').value.trim();
  const about  = document.getElementById('edit-about').value.trim();

  const updates = { status, about };

  // Avatar upload
  const avatarFile = document.getElementById('edit-avatar-input').files[0];
  if (avatarFile) {
    try {
      toast('Загрузка аватара…');
      const result = await uploadImageFile(avatarFile);
      updates.avatar = result.primary;
    } catch(e) {
      toast('Ошибка загрузки аватара: ' + e.message, 'error');
      return;
    }
  }

  await db.ref('users/' + user.uid).update(updates);
  profileData = { ...profileData, ...updates };
  
  // Update posts with new avatar
  if (updates.avatar) {
    const postsSnap = await db.ref('posts').orderByChild('uid').equalTo(user.uid).once('value');
    const postUpdates = {};
    postsSnap.forEach(c => { postUpdates['posts/' + c.key + '/authorAvatar'] = updates.avatar; });
    if (Object.keys(postUpdates).length) await db.ref().update(postUpdates);
  }

  closeEditProfile();
  renderProfile();
  toast('Профиль обновлён!', 'success');
};

window.switchTab = function(tab) { loadTab(tab); };

function showError(msg) {
  document.getElementById('profile-container').innerHTML = `
    <div class="empty-state"><div class="empty-state-icon">😕</div>
    <div>${escHtml(msg)}</div></div>`;
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
