// ── Upload Page ──
let selectedFile = null;
let selectedTags = [];
let allUsers     = [];

document.addEventListener('DOMContentLoaded', async () => {
  onAuthChange((user) => {
    if (!user) { location.href = 'login.html?redirect=upload.html'; }
  });

  setupDropZone();
  setupTagsInput();
  setupDescriptionMentions();
  allUsers = await getAllUsers();
});

// ── Drop Zone ──
function setupDropZone() {
  const zone    = document.getElementById('drop-zone');
  const input   = document.getElementById('file-input');
  const preview = document.getElementById('upload-preview');

  ['dragover','dragleave','drop'].forEach(ev => zone.addEventListener(ev, e => e.preventDefault()));
  zone.addEventListener('dragover',  () => zone.classList.add('dragover'));
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    zone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  });

  input.addEventListener('change', e => {
    if (e.target.files[0]) handleFileSelect(e.target.files[0]);
  });
}

function handleFileSelect(file) {
  const maxImg  = 30 * 1024 * 1024;  // 30MB
  const maxVid  = 200 * 1024 * 1024; // 200MB

  if (file.type.startsWith('image/')) {
    if (file.size > maxImg) { toast('Изображение слишком большое (макс. 30МБ)', 'error'); return; }
  } else if (file.type.startsWith('video/')) {
    if (file.size > maxVid) { toast('Видео слишком большое (макс. 200МБ)', 'error'); return; }
  } else {
    toast('Неподдерживаемый формат файла', 'error'); return;
  }

  selectedFile = file;
  showPreview(file);
}

function showPreview(file) {
  const preview = document.getElementById('upload-preview');
  const url = URL.createObjectURL(file);
  preview.innerHTML = file.type.startsWith('video/')
    ? `<video src="${url}" controls style="width:100%;max-height:300px;object-fit:contain"></video>`
    : `<img src="${url}" style="width:100%;max-height:300px;object-fit:contain">`;
  preview.classList.add('visible');
}

// ── Tags Input ──
function setupTagsInput() {
  const input    = document.getElementById('tags-input');
  const pills    = document.getElementById('tags-pills');
  const dropdown = document.getElementById('tags-autocomplete');

  input.addEventListener('keydown', e => {
    if (['Enter', ',', ' '].includes(e.key)) {
      e.preventDefault();
      const val = input.value.trim().toLowerCase().replace(/[^a-zа-яё0-9_\-]/gi, '');
      if (val && !selectedTags.includes(val)) {
        selectedTags.push(val);
        renderTagPills();
      }
      input.value = '';
      dropdown.classList.remove('open');
    }
    if (e.key === 'Backspace' && !input.value && selectedTags.length) {
      selectedTags.pop();
      renderTagPills();
    }
  });

  input.addEventListener('input', async () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { dropdown.classList.remove('open'); return; }
    const snap = await db.ref('tags').orderByChild('count').limitToLast(30).once('value');
    const matches = [];
    snap.forEach(c => { if (c.key.includes(q) && !selectedTags.includes(c.key)) matches.push({ name: c.key, count: c.val().count||0 }); });
    matches.sort((a, b) => b.count - a.count);
    if (!matches.length) { dropdown.classList.remove('open'); return; }
    dropdown.innerHTML = matches.slice(0, 8).map(m =>
      `<div class="autocomplete-item" data-tag="${m.name}">
        <span class="ac-tag">${m.name}</span>
        <span class="ac-count">${m.count}</span>
      </div>`).join('');
    dropdown.classList.add('open');
  });

  dropdown.addEventListener('click', e => {
    const item = e.target.closest('.autocomplete-item');
    if (!item) return;
    const tag = item.dataset.tag;
    if (!selectedTags.includes(tag)) { selectedTags.push(tag); renderTagPills(); }
    input.value = '';
    dropdown.classList.remove('open');
  });

  document.addEventListener('click', e => {
    if (!input.closest('.tags-input-wrap').contains(e.target)) dropdown.classList.remove('open');
  });
}

function renderTagPills() {
  const pills = document.getElementById('tags-pills');
  pills.innerHTML = selectedTags.map(t =>
    `<span class="tag-pill-remove">${t}
      <button type="button" data-tag="${t}">×</button>
    </span>`).join('');
  pills.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => {
      selectedTags = selectedTags.filter(t => t !== btn.dataset.tag);
      renderTagPills();
    };
  });
}

// ── Description @ Mentions ──
function setupDescriptionMentions() {
  const textarea = document.getElementById('desc-input');
  const dropdown = document.getElementById('mention-dropdown');
  let mentionStart = -1;

  textarea.addEventListener('keyup', async e => {
    const pos  = textarea.selectionStart;
    const text = textarea.value.substring(0, pos);
    const match = text.match(/@([a-z0-9_]*)$/i);

    if (match) {
      mentionStart = pos - match[0].length;
      const query  = match[1].toLowerCase();
      const filtered = allUsers.filter(u => u.username.includes(query)).slice(0, 8);

      if (!filtered.length) { dropdown.classList.remove('open'); return; }

      const rect = textarea.getBoundingClientRect();
      dropdown.style.top  = '100%';
      dropdown.style.left = '0';
      dropdown.innerHTML  = filtered.map(u =>
        `<div class="mention-item" data-username="${u.username}">
          <img src="${u.avatar || DEFAULT_AVATAR}" onerror="this.src='${DEFAULT_AVATAR}'">
          <span>@${u.username}</span>
        </div>`).join('');
      dropdown.classList.add('open');
    } else {
      dropdown.classList.remove('open');
    }
  });

  dropdown.addEventListener('click', e => {
    const item = e.target.closest('.mention-item');
    if (!item) return;
    const username = item.dataset.username;
    const before   = textarea.value.substring(0, mentionStart);
    const after    = textarea.value.substring(textarea.selectionStart);
    textarea.value = before + '@' + username + ' ' + after;
    dropdown.classList.remove('open');
    textarea.focus();
  });

  document.addEventListener('click', e => {
    if (!textarea.closest('.desc-wrap')?.contains(e.target)) dropdown.classList.remove('open');
  });
}

// ── Submit ──
window.submitUpload = async function() {
  const user  = getCurrentUser();
  const udata = getCurrentUserData();
  if (!user) { toast('Войдите в аккаунт', 'error'); return; }
  if (!selectedFile) { toast('Выберите файл', 'error'); return; }

  const title = document.getElementById('title-input').value.trim();
  const desc  = document.getElementById('desc-input').value.trim();

  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Загрузка…';

  const progressBar = document.getElementById('upload-progress');
  const bar         = document.getElementById('progress-bar');
  progressBar.classList.add('visible');
  bar.style.width = '10%';

  try {
    let mediaResult;
    const isVideo = selectedFile.type.startsWith('video/');

    bar.style.width = '30%';

    if (isVideo) {
      mediaResult = await uploadVideoFile(selectedFile);
    } else {
      mediaResult = await uploadImageFile(selectedFile);
    }

    bar.style.width = '70%';

    // Parse inline tags from description
    const inlineTags = parseHashTags(desc);
    const allTags    = [...new Set([...selectedTags, ...inlineTags])];

    const post = {
      uid:             user.uid,
      authorUsername:  udata.username,
      authorAvatar:    udata.avatar || '',
      title,
      description:     desc,
      mediaUrl:        mediaResult.primary,
      thumb:           mediaResult.thumb || mediaResult.primary,
      mediaType:       isVideo ? 'video' : 'image',
      mediaSource:     mediaResult.source,
      tags:            selectedTags,
      inlineTags,
      likeCount:       0,
      commentCount:    0,
      repostCount:     0,
      createdAt:       Date.now()
    };

    const ref = await db.ref('posts').push(post);

    bar.style.width = '90%';

    // Update tag counts
    await updateTagCounts(allTags, 1);

    bar.style.width = '100%';
    toast('Пост опубликован!', 'success');
    setTimeout(() => location.href = 'post.html?id=' + ref.key, 800);

  } catch(e) {
    toast('Ошибка: ' + e.message, 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Опубликовать';
    progressBar.classList.remove('visible');
  }
};
