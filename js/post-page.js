// ── Post Page ──
let currentPostId = null;
let currentPost   = null;
let commentsOff   = null;

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  currentPostId = params.get('id');
  if (!currentPostId) { location.href = 'index.html'; return; }

  await loadPost();
  subscribeComments();

  onAuthChange((user) => {
    updateActionButtons();
    toggleCommentForm(!!user);
  });
});

async function loadPost() {
  const snap = await db.ref('posts/' + currentPostId).once('value');
  if (!snap.exists()) {
    document.getElementById('post-container').innerHTML = `
      <div class="empty-state"><div class="empty-state-icon">😕</div>
      <div>Пост не найден</div></div>`;
    return;
  }
  currentPost = { id: currentPostId, ...snap.val() };
  renderPost(currentPost);
  renderTagsSidebar(currentPost);
  updateActionButtons();
}

function renderPost(post) {
  document.title = (post.title || 'Пост') + ' — Booru';

  // Author info
  document.getElementById('post-author-link').href = 'profile.html?uid=' + post.uid;
  document.getElementById('post-author-link').textContent = '@' + (post.authorUsername || 'unknown');
  document.getElementById('post-author-avatar').src = post.authorAvatar || DEFAULT_AVATAR;
  document.getElementById('post-author-avatar').onerror = function() { this.src = DEFAULT_AVATAR; };
  document.getElementById('post-time').textContent = fmtDate(post.createdAt);

  // Title
  document.getElementById('post-title').textContent = post.title || '';

  // Description with markup
  const descEl = document.getElementById('post-description');
  if (post.description) {
    descEl.innerHTML = renderTextWithMarkup(post.description);
    descEl.style.display = 'block';
  } else {
    descEl.style.display = 'none';
  }

  // Media
  const mediaWrap = document.getElementById('post-media');
  if (post.mediaType === 'video') {
    mediaWrap.innerHTML = `<video src="${post.mediaUrl}" controls playsinline style="width:100%;max-height:70vh;object-fit:contain"></video>`;
  } else {
    mediaWrap.innerHTML = `<img src="${post.mediaUrl}" alt="${escHtml(post.title)}" style="width:100%;max-height:70vh;object-fit:contain">`;
  }

  // Counters
  updateCounters(post);
}

function renderTagsSidebar(post) {
  const allTags = [...new Set([...(post.tags || []), ...(post.inlineTags || [])])];
  const container = document.getElementById('post-tags-list');
  if (!container) return;

  if (!allTags.length) {
    container.innerHTML = '<div style="color:var(--text3);font-size:12px">Нет тегов</div>';
    return;
  }

  container.innerHTML = allTags.map(t =>
    `<a class="sidebar-tag" href="index.html?tag=${encodeURIComponent(t)}">
      <span>${escHtml(t)}</span>
    </a>`
  ).join('');
}

function updateCounters(post) {
  document.getElementById('like-count').textContent  = post.likeCount  || 0;
  document.getElementById('repost-count').textContent= post.repostCount|| 0;
  document.getElementById('comment-count').textContent= post.commentCount||0;
}

async function updateActionButtons() {
  const user = getCurrentUser();
  if (!user || !currentPostId) return;

  // Check like
  const likeSnap = await db.ref('likes/' + currentPostId + '/' + user.uid).once('value');
  const likeBtn = document.getElementById('like-btn');
  if (likeBtn) {
    likeBtn.classList.toggle('active', likeSnap.exists());
    likeBtn.querySelector('.action-icon').textContent = likeSnap.exists() ? '♥' : '♡';
  }

  // Check repost
  const rpSnap = await db.ref('reposts/' + user.uid + '/' + currentPostId).once('value');
  const rpBtn = document.getElementById('repost-btn');
  if (rpBtn) rpBtn.classList.toggle('active', rpSnap.exists());
}

function toggleCommentForm(show) {
  const form = document.getElementById('comment-form');
  const hint = document.getElementById('comment-login-hint');
  if (form) form.style.display = show ? 'flex' : 'none';
  if (hint) hint.style.display = show ? 'none' : 'block';
}

// ── Comments ──
function subscribeComments() {
  const list = document.getElementById('comment-list');
  if (!list) return;

  if (commentsOff) commentsOff();
  commentsOff = db.ref('comments/' + currentPostId)
    .orderByChild('createdAt')
    .on('value', snap => {
      list.innerHTML = '';
      let count = 0;
      snap.forEach(c => {
        count++;
        list.appendChild(buildComment(c.key, c.val()));
      });
      document.getElementById('comment-count').textContent = count;
    });
}

function buildComment(id, c) {
  const div = document.createElement('div');
  div.className = 'comment-item';
  div.id = 'comment-' + id;
  const avatar = c.authorAvatar || DEFAULT_AVATAR;
  div.innerHTML = `
    <img class="comment-avatar" src="${avatar}" alt="" onerror="this.src='${DEFAULT_AVATAR}'">
    <div class="comment-body">
      <div class="comment-author">
        <a href="profile.html?uid=${c.uid}">@${escHtml(c.authorUsername)}</a>
      </div>
      <div class="comment-text">${renderTextWithMarkup(c.text)}</div>
      <div class="comment-time">${fmtDate(c.createdAt)}</div>
    </div>`;
  return div;
}

// ── Actions ──
window.doLike = async function() {
  const user = getCurrentUser();
  if (!user) { toast('Войдите, чтобы ставить лайки', 'error'); return; }

  const likeRef = db.ref('likes/' + currentPostId + '/' + user.uid);
  const snap = await likeRef.once('value');
  const btn  = document.getElementById('like-btn');
  const countEl = document.getElementById('like-count');

  if (snap.exists()) {
    await likeRef.remove();
    await db.ref('posts/' + currentPostId + '/likeCount').transaction(v => Math.max(0, (v||0) - 1));
    btn.classList.remove('active');
    btn.querySelector('.action-icon').textContent = '♡';
    countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
  } else {
    await likeRef.set(true);
    await db.ref('posts/' + currentPostId + '/likeCount').transaction(v => (v||0) + 1);
    btn.classList.add('active');
    btn.querySelector('.action-icon').textContent = '♥';
    countEl.textContent = parseInt(countEl.textContent) + 1;
  }
};

window.doRepost = async function() {
  const user = getCurrentUser();
  if (!user) { toast('Войдите, чтобы репостить', 'error'); return; }

  const ref  = db.ref('reposts/' + user.uid + '/' + currentPostId);
  const snap = await ref.once('value');
  const btn  = document.getElementById('repost-btn');
  const countEl = document.getElementById('repost-count');

  if (snap.exists()) {
    await ref.remove();
    await db.ref('posts/' + currentPostId + '/repostCount').transaction(v => Math.max(0, (v||0) - 1));
    btn.classList.remove('active');
    countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
    toast('Репост удалён');
  } else {
    await ref.set({ postId: currentPostId, originalUid: currentPost?.uid, createdAt: Date.now() });
    await db.ref('posts/' + currentPostId + '/repostCount').transaction(v => (v||0) + 1);
    btn.classList.add('active');
    countEl.textContent = parseInt(countEl.textContent) + 1;
    toast('Репост добавлен!', 'success');
  }
};

window.doShare = function() {
  if (navigator.share) {
    navigator.share({ title: currentPost?.title || 'Пост', url: location.href });
  } else {
    navigator.clipboard.writeText(location.href);
    toast('Ссылка скопирована!', 'success');
  }
};

window.submitComment = async function() {
  const user  = getCurrentUser();
  const udata = getCurrentUserData();
  if (!user) { toast('Войдите, чтобы комментировать', 'error'); return; }

  const textarea = document.getElementById('comment-textarea');
  const text = textarea?.value?.trim();
  if (!text) return;

  const comment = {
    uid: user.uid,
    authorUsername: udata.username,
    authorAvatar: udata.avatar || '',
    text,
    createdAt: Date.now()
  };

  await db.ref('comments/' + currentPostId).push(comment);
  await db.ref('posts/' + currentPostId + '/commentCount').transaction(v => (v||0) + 1);
  textarea.value = '';
};

window.deletePost = async function() {
  const user = getCurrentUser();
  if (!user || user.uid !== currentPost?.uid) return;
  if (!confirm('Удалить пост?')) return;

  // Decrement tag counts
  const allTags = [...(currentPost.tags || []), ...(currentPost.inlineTags || [])];
  await updateTagCounts(allTags, -1);

  await db.ref('posts/' + currentPostId).remove();
  await db.ref('comments/' + currentPostId).remove();
  toast('Пост удалён', 'success');
  setTimeout(() => location.href = 'index.html', 1000);
};

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
