// ── Auth Page ──
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  if (params.get('tab') === 'register') switchTab('register');

  onAuthChange(user => {
    if (user) {
      const redirect = params.get('redirect') || 'index.html';
      location.href = redirect;
    }
  });
});

let activeTab = 'login';

window.switchTab = function(tab) {
  activeTab = tab;
  document.querySelectorAll('.auth-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  document.getElementById('login-form').style.display  = tab === 'login'    ? 'block' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
  clearError();
};

window.doLogin = async function() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  if (!username || !password) { showError('Заполните все поля'); return; }

  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.textContent = 'Вход…';

  try {
    await loginUser(username, password);
    // onAuthChange will redirect
  } catch(e) {
    let msg = 'Ошибка входа';
    if (e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
      msg = 'Неверный логин или пароль';
    } else if (e.code === 'auth/too-many-requests') {
      msg = 'Слишком много попыток. Попробуйте позже';
    }
    showError(msg);
    btn.disabled = false;
    btn.textContent = 'Войти';
  }
};

window.doRegister = async function() {
  const username  = document.getElementById('reg-username').value.trim().toLowerCase();
  const password  = document.getElementById('reg-password').value;
  const password2 = document.getElementById('reg-password2').value;

  if (!username || !password) { showError('Заполните все поля'); return; }
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    showError('Логин: 3-20 символов, только латинские буквы, цифры, _');
    return;
  }
  if (password.length < 6) { showError('Пароль минимум 6 символов'); return; }
  if (password !== password2) { showError('Пароли не совпадают'); return; }

  const btn = document.getElementById('reg-btn');
  btn.disabled = true;
  btn.textContent = 'Регистрация…';

  try {
    await registerUser(username, password);
    // onAuthChange will redirect
  } catch(e) {
    let msg = e.message || 'Ошибка регистрации';
    if (e.code === 'auth/email-already-in-use') msg = 'Этот логин уже занят';
    showError(msg);
    btn.disabled = false;
    btn.textContent = 'Создать аккаунт';
  }
};

function showError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.add('visible');
}

function clearError() {
  const el = document.getElementById('auth-error');
  if (el) el.classList.remove('visible');
}

// Allow Enter key
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (activeTab === 'login') doLogin();
    else doRegister();
  }
});
