const IMGBB_KEY = "120a27bcbb28d3ffd9f03bc4b32bb54f";

// ===== ПРОКСИ =====
const PROXIES = [
  "https://corsproxy.io/?",
  "https://api.allorigins.win/raw?url=",
  "https://thingproxy.freeboard.io/fetch/"
];

// ===== IMG HOSTS =====

// imgbb (основной)
async function uploadImgBB(file) {
  const form = new FormData();
  form.append("image", file);

  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, {
    method: "POST",
    body: form
  });

  const data = await res.json();
  if (!data.success) throw "imgbb fail";

  return data.data.url;
}

// imgbb fallback (base64)
async function uploadImgBBBase64(file) {
  const base64 = await fileToBase64(file);

  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, {
    method: "POST",
    body: new URLSearchParams({ image: base64 })
  });

  const data = await res.json();
  if (!data.success) throw "imgbb base64 fail";

  return data.data.url;
}

// ===== VIDEO (CATBOX) =====

async function uploadCatbox(file) {
  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append("fileToUpload", file);

  // пробуем через прокси
  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy + "https://catbox.moe/user/api.php", {
        method: "POST",
        body: form
      });

      const text = await res.text();

      if (text.startsWith("https://")) {
        return text;
      }
    } catch (e) {
      console.log("proxy fail", proxy);
    }
  }

  throw "catbox fail";
}

// ===== HELPERS =====
function fileToBase64(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result.split(",")[1]);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

// ===== MAIN =====
export async function uploadFile(file) {
  const type = file.type;

  // ===== IMAGE =====
  if (type.startsWith("image/")) {
    try {
      return await uploadImgBB(file);
    } catch {
      console.warn("imgbb failed, trying base64...");
      return await uploadImgBBBase64(file);
    }
  }

  // ===== VIDEO =====
  if (type.startsWith("video/")) {
    return await uploadCatbox(file);
  }

  throw "unsupported file type";
}
