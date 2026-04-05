// ── Feed page ──
const POSTS_PER_PAGE = 24;
let lastPostKey = null;
let loadingMore  = false;
let currentSearchTags = [];

document.addEventListener('DOMContentLoaded', () => {
  checkUrlTag();
  loadPosts();
  setupInfiniteScroll();
  setupGlobalSearch();
});

function checkUrlTag() {
  const params = new URLSearchParams(location.search);
  const tag = params.get('tag');
  if (tag) {
    currentSearchTags = [tag];
    renderSearchTagBar([tag]);
  }
}

function setupGlobalSearch() {
  const input = document.getElementById('search-input');
  if (!input) return;
  const ctrl = setupSearchBar(input, tags => {
    currentSearchTags = tags;
    resetAndLoad();
  });

  // Handle URL tag in search bar
  const params = new URLSearchParams(location.search);
  const tag = params.get('tag');
  if (tag) {
    currentSearchTags = [tag];
    ctrl.getActiveTags().push(tag);
    renderSearchTagBar([tag]);
  }
}

function renderSearchTagBar(tags) {
  let bar = document.getElementById('active-tags-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'active-tags-bar';
    bar.className = 'active-search-tags';
    document.querySelector('.main-content')?.prepend(bar);
  }
  bar.innerHTML = tags.map(t =>
    `<span class="search-tag-active">${t} <button data-tag="${t}">×</button></span>`
  ).join('');
  bar.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => {
      currentSearchTags = currentSearchTags.filter(t => t !== btn.dataset.tag);
      btn.closest('.search-tag-active').remove();
      if (!currentSearchTags.length) bar.remove();
      resetAndLoad();
    };
  });
}

function resetAndLoad() {
  lastPostKey = null;
  const grid = document.getElementById('posts-grid');
  if (grid) grid.innerHTML = '';
  loadPosts();
}

async function loadPosts() {
  if (loadingMore) return;
  loadingMore = true;

  showGridLoader(true);

  try {
    let posts = [];

    if (currentSearchTags.length) {
      posts = await loadPostsByTags(currentSearchTags);
    } else {
      let q = db.ref('posts').orderByChild('createdAt').limitToLast(POSTS_PER_PAGE + 1);
      if (lastPostKey) q = q.endBefore(null, lastPostKey);
      const snap = await q.once('value');
      snap.forEach(c => posts.unshift({ id: c.key, ...c.val() }));
    }

    renderPosts(posts);
  } catch(e) {
    console.error(e);
    toast('Ошибка загрузки постов', 'error');
  }

  showGridLoader(false);
  loadingMore = false;
}

async function loadPostsByTags(tags) {
  // For each tag, get post IDs, intersect
  const tagSets = await Promise.all(tags.map(async tag => {
    const snap = await db.ref('posts').orderByChild('createdAt').limitToLast(200).once('value');
    const ids = new Set();
    snap.forEach(c => {
      const p = c.val();
      const allTags = [...(p.tags || []), ...(p.inlineTags || [])];
      if (allTags.includes(tag)) ids.add(c.key);
    });
    return ids;
  }));

  // Intersect sets
  let intersection = tagSets[0];
  for (let i = 1; i < tagSets.length; i++) {
    intersection = new Set([...intersection].filter(x => tagSets[i].has(x)));
  }

  // Load actual posts
  const posts = [];
  for (const id of intersection) {
    const snap = await db.ref('posts/' + id).once('value');
    if (snap.exists()) posts.push({ id, ...snap.val() });
  }
  posts.sort((a, b) => b.createdAt - a.createdAt);
  return posts;
}

function renderPosts(posts) {
  const grid = document.getElementById('posts-grid');
  if (!grid) return;

  if (!posts.length && !lastPostKey) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state-icon">🖼️</div>
      <div class="empty-state-text">Постов не найдено</div>
    </div>`;
    return;
  }

  for (const post of posts) {
    if (lastPostKey === post.id) continue;
    grid.appendChild(buildPostCard(post));
  }

  if (posts.length) lastPostKey = posts[posts.length - 1].id;

  // Attach real-time comment listeners
  grid.querySelectorAll('[data-post-id]').forEach(card => {
    const pid = card.dataset.postId;
    subscribeCardComments(pid, card);
  });
}

function buildPostCard(post) {
  const card = document.createElement('div');
  card.className = 'post-card';
  card.dataset.postId = post.id;

  const thumb = post.thumb || post.mediaUrl || '';
  const isVideo = post.mediaType === 'video';
  const tags = (post.tags || []).slice(0, 3);
  const avatar = post.authorAvatar || DEFAULT_AVATAR;

  card.innerHTML = `
    <div class="post-author-row">
      <img class="post-author-avatar" src="${avatar}" alt="" onerror="this.src='${DEFAULT_AVATAR}'"
           onclick="event.stopPropagation(); location.href='profile.html?uid=${post.uid}'">
      <a class="post-author-name" href="profile.html?uid=${post.uid}" onclick="event.stopPropagation()">@${post.authorUsername || 'unknown'}</a>
      <span class="post-author-time">${fmtDate(post.createdAt)}</span>
    </div>
    <div class="post-card-media" onclick="location.href='post.html?id=${post.id}'">
      ${isVideo
        ? `<video src="${thumb}" muted preload="none" poster=""></video>
           <span class="media-type-badge">▶ Видео</span>`
        : `<img src="${thumb}" alt="${post.title || ''}" loading="lazy">`
      }
    </div>
    <div class="post-card-body">
      <div class="post-card-title" onclick="location.href='post.html?id=${post.id}'">${escHtml(post.title) || '(без названия)'}</div>
      <div class="post-card-tags">
        ${tags.map(t => `<span class="tag-pill" onclick="event.stopPropagation(); addTagSearch('${escHtml(t)}')">${escHtml(t)}</span>`).join('')}
        ${(post.tags||[]).length > 3 ? `<span class="tag-pill" style="color:var(--text3)">+${post.tags.length - 3}</span>` : ''}
      </div>
      <div class="post-card-stats">
        <span class="post-stat like-btn" data-post="${post.id}">
          <span class="like-icon">♡</span>
          <span class="like-count">${post.likeCount || 0}</span>
        </span>
        <span class="post-stat" onclick="location.href='post.html?id=${post.id}#comments'">
          💬 <span class="comment-count-${post.id}">${post.commentCount || 0}</span>
        </span>
        <span class="post-stat repost-btn" data-post="${post.id}">
          🔁 <span class="repost-count">${post.repostCount || 0}</span>
        </span>
      </div>
      <div class="post-card-comments" id="card-comments-${post.id}">
        <div class="mini-comment-input-wrap">
          <input type="text" class="mini-comment-input" placeholder="Комментарий…" id="mc-input-${post.id}">
          <button class="mini-comment-send" data-post="${post.id}">→</button>
        </div>
      </div>
    </div>`;

  // Like button
  card.querySelector('.like-btn').addEventListener('click', async e => {
    e.stopPropagation();
    await toggleLike(post.id, card.querySelector('.like-btn'));
  });

  // Repost button
  card.querySelector('.repost-btn').addEventListener('click', async e => {
    e.stopPropagation();
    await doRepost(post.id, post);
  });

  // Mini comment send
  card.querySelector('.mini-comment-send').addEventListener('click', async e => {
    e.stopPropagation();
    const input = card.querySelector('.mini-comment-input');
    await sendComment(post.id, input.value, input);
  });

  card.querySelector('.mini-comment-input').addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      await sendComment(post.id, e.target.value, e.target);
    }
  });

  // Sync like state
  syncLikeState(post.id, card.querySelector('.like-btn'));

  return card;
}

function subscribeCardComments(postId, card) {
  const container = document.getElementById('card-comments-' + postId);
  if (!container) return;

  db.ref('comments/' + postId).orderByChild('createdAt').limitToLast(3)
    .on('value', snap => {
      const inputWrap = container.querySelector('.mini-comment-input-wrap');
      const comments = [];
      snap.forEach(c => comments.push({ id: c.key, ...c.val() }));

      container.innerHTML = '';
      comments.forEach(c => {
        const div = document.createElement('div');
        div.className = 'mini-comment';
        div.innerHTML = `<a class="mini-comment-author" href="profile.html?uid=${c.uid}">@${escHtml(c.authorUsername)}</a>
          <span class="mini-comment-text">${escHtml(c.text)}</span>`;
        container.appendChild(div);
      });
      container.appendChild(inputWrap || createMiniInput(postId));
    });
}

function createMiniInput(postId) {
  const wrap = document.createElement('div');
  wrap.className = 'mini-comment-input-wrap';
  wrap.innerHTML = `
    <input type="text" class="mini-comment-input" placeholder="Комментарий…" id="mc-input-${postId}">
    <button class="mini-comment-send" data-post="${postId}">→</button>`;
  wrap.querySelector('.mini-comment-send').addEventListener('click', async e => {
    const input = wrap.querySelector('.mini-comment-input');
    await sendComment(postId, input.value, input);
  });
  wrap.querySelector('.mini-comment-input').addEventListener('keydown', async e => {
    if (e.key === 'Enter') await sendComment(postId, e.target.value, e.target);
  });
  return wrap;
}

async function sendComment(postId, text, inputEl) {
  const user = getCurrentUser();
  const udata = getCurrentUserData();
  if (!user) { toast('Войдите, чтобы комментировать', 'error'); return; }
  if (!text.trim()) return;

  const comment = {
    uid: user.uid,
    authorUsername: udata.username,
    authorAvatar: udata.avatar || '',
    text: text.trim(),
    createdAt: Date.now()
  };

  await db.ref('comments/' + postId).push(comment);
  await db.ref('posts/' + postId + '/commentCount').transaction(v => (v || 0) + 1);
  if (inputEl) inputEl.value = '';
}

async function toggleLike(postId, btn) {
  const user = getCurrentUser();
  if (!user) { toast('Войдите, чтобы ставить лайки', 'error'); return; }

  const likeRef = db.ref('likes/' + postId + '/' + user.uid);
  const snap = await likeRef.once('value');

  if (snap.exists()) {
    await likeRef.remove();
    await db.ref('posts/' + postId + '/likeCount').transaction(v => Math.max(0, (v || 0) - 1));
    btn.classList.remove('liked');
    btn.querySelector('.like-icon').textContent = '♡';
    btn.querySelector('.like-count').textContent = Math.max(0, parseInt(btn.querySelector('.like-count').textContent) - 1);
  } else {
    await likeRef.set(true);
    await db.ref('posts/' + postId + '/likeCount').transaction(v => (v || 0) + 1);
    btn.classList.add('liked');
    btn.querySelector('.like-icon').textContent = '♥';
    btn.querySelector('.like-count').textContent = parseInt(btn.querySelector('.like-count').textContent) + 1;
  }
}

async function syncLikeState(postId, btn) {
  const user = getCurrentUser();
  if (!user || !btn) return;
  const snap = await db.ref('likes/' + postId + '/' + user.uid).once('value');
  if (snap.exists()) {
    btn.classList.add('liked');
    btn.querySelector('.like-icon').textContent = '♥';
  }
}

async function doRepost(postId, postData) {
  const user = getCurrentUser();
  if (!user) { toast('Войдите, чтобы репостить', 'error'); return; }

  const repostRef = db.ref('reposts/' + user.uid + '/' + postId);
  const snap = await repostRef.once('value');
  if (snap.exists()) {
    await repostRef.remove();
    await db.ref('posts/' + postId + '/repostCount').transaction(v => Math.max(0, (v || 0) - 1));
    toast('Репост удалён');
  } else {
    await repostRef.set({ postId, originalUid: postData.uid, createdAt: Date.now() });
    await db.ref('posts/' + postId + '/repostCount').transaction(v => (v || 0) + 1);
    toast('Репост добавлен!', 'success');
  }
}

function addTagSearch(tag) {
  if (!currentSearchTags.includes(tag)) {
    currentSearchTags.push(tag);
    renderSearchTagBar(currentSearchTags);
    resetAndLoad();
  }
}

function setupInfiniteScroll() {
  window.addEventListener('scroll', () => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 300) {
      if (!loadingMore && !currentSearchTags.length) loadPosts();
    }
  });
}

function showGridLoader(show) {
  let loader = document.getElementById('grid-loader');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'grid-loader';
    loader.className = 'loading-spinner';
    loader.innerHTML = '<div class="spinner"></div>';
    document.getElementById('posts-grid')?.after(loader);
  }
  loader.style.display = show ? 'flex' : 'none';
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Load popular tags for sidebar
async function loadSidebarTags() {
  const container = document.getElementById('sidebar-tags');
  if (!container) return;
  const snap = await db.ref('tags').orderByChild('count').limitToLast(20).once('value');
  const tags = [];
  snap.forEach(c => tags.unshift({ name: c.key, count: c.val().count || 0 }));
  container.innerHTML = tags.map(t =>
    `<div class="sidebar-tag" onclick="addTagSearch('${escHtml(t.name)}')">
      <span>${escHtml(t.name)}</span>
      <span class="tag-count">${t.count}</span>
    </div>`
  ).join('') || '<div style="color:var(--text3);font-size:12px;padding:4px">Нет тегов</div>';
}

loadSidebarTags();
