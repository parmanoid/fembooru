import { auth, db, nickToEmail } from "./firebase.js";
import { uploadFile } from "./upload.js";

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {
  ref, push, set, onValue, get
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ===== STATE =====
let currentUser = null;

// ===== AUTH =====
window.login = async () => {
  const nick = document.getElementById("loginNick").value.trim();
  const pass = document.getElementById("loginPass").value;

  if (!nick || !pass) return alert("Введите ник и пароль");

  const email = nickToEmail(nick);

  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch {
    await createUserWithEmailAndPassword(auth, email, pass);
  }
};

onAuthStateChanged(auth, (user) => {
  currentUser = user;

  const nickUI = document.getElementById("nickname");

  if (user) {
    nickUI.innerText = user.email.split("@")[0];
  } else {
    nickUI.innerText = "Guest";
  }
});

// ===== CREATE POST =====
window.createPost = async () => {
  if (!currentUser) return alert("Сначала войди");

  const fileInput = document.getElementById("file");
  const tagsInput = document.getElementById("tags");
  const descInput = document.getElementById("desc");

  let url = "";

  if (fileInput.files[0]) {
    try {
      url = await uploadFile(fileInput.files[0]);
    } catch (e) {
      console.error(e);
      return alert("Ошибка загрузки файла");
    }
  }

  const tags = tagsInput.value
    .split(" ")
    .map(t => t.trim())
    .filter(Boolean);

  const postRef = push(ref(db, "posts"));

  await set(postRef, {
    url,
    tags,
    desc: descInput.value,
    author: currentUser.email,
    created: Date.now()
  });

  // очистка
  fileInput.value = "";
  tagsInput.value = "";
  descInput.value = "";
};

// ===== LOAD POSTS =====
const postsDiv = document.getElementById("posts");

onValue(ref(db, "posts"), async (snapshot) => {
  postsDiv.innerHTML = "";

  const posts = [];

  snapshot.forEach(child => {
    posts.push({
      id: child.key,
      ...child.val()
    });
  });

  // новые сверху
  posts.sort((a, b) => b.created - a.created);

  for (const post of posts) {
    renderPost(post);
  }
});

// ===== RENDER POST =====
async function renderPost(post) {
  const div = document.createElement("div");
  div.className = "post";

  const likeCount = await getLikeCount(post.id);

  div.innerHTML = `
    <b>${formatUser(post.author)}</b>
    <p>${formatText(post.desc)}</p>

    ${renderMedia(post.url)}

    <p>${post.tags.map(t => `#${t}`).join(" ")}</p>

    <button onclick="likePost('${post.id}')">
      ❤️ ${likeCount}
    </button>

    <div id="comments-${post.id}"></div>
    <input placeholder="коммент..." 
      onkeydown="addComment(event,'${post.id}')">
  `;

  postsDiv.appendChild(div);

  loadComments(post.id);
}

// ===== MEDIA =====
function renderMedia(url) {
  if (!url) return "";

  if (url.match(/\.(mp4|webm|ogg)$/)) {
    return `<video src="${url}" controls></video>`;
  }

  return `<img src="${url}">`;
}

// ===== FORMAT =====
function formatText(text = "") {
  return text
    .replace(/#(\w+)/g, '<span class="tag">#$1</span>')
    .replace(/@(\w+)/g, '<span class="user">@$1</span>');
}

function formatUser(email) {
  return email.split("@")[0];
}

// ===== LIKES =====
async function getLikeCount(postId) {
  const snap = await get(ref(db, `likes/${postId}`));
  return snap.exists() ? Object.keys(snap.val()).length : 0;
}

window.likePost = async (postId) => {
  if (!currentUser) return alert("Войди");

  const likeRef = ref(db, `likes/${postId}/${currentUser.uid}`);

  await set(likeRef, true);
};

// ===== COMMENTS =====
function loadComments(postId) {
  const commentsRef = ref(db, `comments/${postId}`);

  onValue(commentsRef, (snap) => {
    const div = document.getElementById(`comments-${postId}`);
    if (!div) return;

    div.innerHTML = "";

    snap.forEach(c => {
      const data = c.val();

      div.innerHTML += `
        <p>
          <b>${formatUser(data.author)}</b>: 
          ${formatText(data.text)}
        </p>
      `;
    });
  });
}

window.addComment = async (e, postId) => {
  if (e.key !== "Enter") return;
  if (!currentUser) return;

  const text = e.target.value.trim();
  if (!text) return;

  const commentRef = push(ref(db, `comments/${postId}`));

  await set(commentRef, {
    text,
    author: currentUser.email,
    created: Date.now()
  });

  e.target.value = "";
};
