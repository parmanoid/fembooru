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

let currentUser = null;

const postsDiv = document.getElementById("posts");

// ===== AUTH =====
window.login = async () => {
  const nick = document.getElementById("loginNick").value.trim();
  const pass = document.getElementById("loginPass").value;

  if (!nick || !pass) return alert("Введите данные");

  const email = nickToEmail(nick);

  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch {
    await createUserWithEmailAndPassword(auth, email, pass);
  }

  document.getElementById("authModal").classList.add("hidden");
};

onAuthStateChanged(auth, (user) => {
  currentUser = user;

  document.getElementById("nickname").innerText =
    user ? user.email.split("@")[0] : "Гость";
});

// ===== CREATE POST =====
window.createPost = async () => {
  if (!currentUser) return alert("Сначала войди");

  const fileInput = document.getElementById("file");
  const tagsInput = document.getElementById("tags");
  const descInput = document.getElementById("desc");

  let url = "";

  if (fileInput.files[0]) {
    url = await uploadFile(fileInput.files[0]);
  }

  const tags = tagsInput.value.split(" ").filter(Boolean);

  const postRef = push(ref(db, "posts"));

  await set(postRef, {
    url,
    tags,
    desc: descInput.value,
    author: currentUser.email,
    created: Date.now()
  });

  fileInput.value = "";
  tagsInput.value = "";
  descInput.value = "";
};

// ===== LOAD POSTS =====
onValue(ref(db, "posts"), (snapshot) => {
  postsDiv.innerHTML = "";

  const posts = [];

  snapshot.forEach(child => {
    posts.push({
      id: child.key,
      ...child.val()
    });
  });

  posts.sort((a,b)=>b.created-a.created);

  posts.forEach(renderPost);
});

// ===== RENDER =====
async function renderPost(post) {
  const div = document.createElement("div");
  div.className = "post";

  const likeCount = await getLikeCount(post.id);

  div.innerHTML = `
    <div class="actions">
      <button onclick="likePost('${post.id}')">❤️ ${likeCount}</button>
    </div>

    ${renderMedia(post.url)}

    <div class="post-info">
      <b>${formatUser(post.author)}</b>
      <p>${formatText(post.desc)}</p>
      <p>${post.tags.map(t=>"#"+t).join(" ")}</p>

      <div id="comments-${post.id}"></div>
      <input placeholder="коммент..." 
        onkeydown="addComment(event,'${post.id}')">
    </div>
  `;

  postsDiv.appendChild(div);
  loadComments(post.id);
}

// ===== MEDIA =====
function renderMedia(url){
  if(!url) return "";

  if(url.match(/\.(mp4|webm|ogg)$/))
    return `<video src="${url}" controls></video>`;

  return `<img src="${url}">`;
}

// ===== FORMAT =====
function formatText(t=""){
  return t
    .replace(/#(\w+)/g,'<span class="tag">#$1</span>')
    .replace(/@(\w+)/g,'<span class="user">@$1</span>');
}

function formatUser(email){
  return email.split("@")[0];
}

// ===== LIKES =====
async function getLikeCount(id){
  const snap = await get(ref(db,`likes/${id}`));
  return snap.exists() ? Object.keys(snap.val()).length : 0;
}

window.likePost = async(id)=>{
  if(!currentUser) return;

  await set(ref(db,`likes/${id}/${currentUser.uid}`),true);
};

// ===== COMMENTS =====
function loadComments(id){
  onValue(ref(db,`comments/${id}`),snap=>{
    const div=document.getElementById("comments-"+id);
    if(!div) return;

    div.innerHTML="";

    snap.forEach(c=>{
      const d=c.val();
      div.innerHTML+=`
        <p><b>${formatUser(d.author)}</b>: ${formatText(d.text)}</p>
      `;
    });
  });
}

window.addComment = async(e,id)=>{
  if(e.key!=="Enter") return;
  if(!currentUser) return;

  const text=e.target.value.trim();
  if(!text) return;

  const r=push(ref(db,`comments/${id}`));

  await set(r,{
    text,
    author: currentUser.email
  });

  e.target.value="";
};
