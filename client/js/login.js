// ============================================================
// REM System — Login / Account System
// Handles login overlay, register, and session state.
// Session is managed via HttpOnly cookie set by the server.
// ============================================================

// ── Auth state ────────────────────────────────────────────────────────────────
let _remAccountId   = null;
let _remUsername    = null;
let _remDisplayName = null;
let _remAccountInfo = null;
let _authWaiters    = [];

function getAccountId()   { return _remAccountId;   }
function getUsername()    { return _remUsername;     }
function getDisplayName() { return _remDisplayName; }
function getAccountInfo() { return _remAccountInfo; }

function getCurrentAccount() {
  if (!_remAccountId) return null;
  return {
    id: _remAccountId,
    username: _remUsername,
    displayName: _remDisplayName,
    info: _remAccountInfo
  };
}

function resolveAuthWaiters(account) {
  const waiters = _authWaiters;
  _authWaiters = [];
  waiters.forEach(resolve => resolve(account));
}

// ── Tab switcher ──────────────────────────────────────────────────────────────
function switchLoginTab(tab) {
  const loginTab   = document.getElementById('authLoginTab');
  const registerTab = document.getElementById('authRegisterTab');
  const loginBtn   = document.getElementById('authTabLoginBtn');
  const regBtn     = document.getElementById('authTabRegBtn');
  if (!loginTab || !registerTab) return;

  if (tab === 'login') {
    loginTab.style.display    = '';
    registerTab.style.display = 'none';
    if (loginBtn)  loginBtn.className  = 'btn bp flex-1';
    if (regBtn)    regBtn.className    = 'btn bd flex-1';
  } else {
    loginTab.style.display    = 'none';
    registerTab.style.display = '';
    if (loginBtn)  loginBtn.className  = 'btn bd flex-1';
    if (regBtn)    regBtn.className    = 'btn bp flex-1';
  }
  // Clear errors on tab switch
  clearLoginErrors();
}

function clearLoginErrors() {
  const le = document.getElementById('authLoginError');
  const re = document.getElementById('authRegisterError');
  if (le) { le.style.display = 'none'; le.textContent = ''; }
  if (re) { re.style.display = 'none'; re.textContent = ''; }
}

// ── Overlay show/hide ─────────────────────────────────────────────────────────
function showLoginOverlay() {
  const overlay = document.getElementById('loginOverlay');
  if (overlay) overlay.style.display = 'flex';
}

function hideLoginOverlay() {
  const overlay = document.getElementById('loginOverlay');
  if (overlay) overlay.style.display = 'none';
}

// ── Header badge update ───────────────────────────────────────────────────────
function _updateAccountBadge(username) {
  const badge     = document.getElementById('accountBadge');
  const nameSpan  = document.getElementById('accountUsername');
  if (badge)    badge.style.display = '';
  if (nameSpan) nameSpan.textContent = username;
  if (typeof updateStartUserChip === 'function') updateStartUserChip();
}

function _clearAccountBadge() {
  const badge = document.getElementById('accountBadge');
  if (badge) badge.style.display = 'none';
  if (typeof updateStartUserChip === 'function') updateStartUserChip();
}

// ── On successful auth ────────────────────────────────────────────────────────
function _onAuthSuccess(account) {
  _remAccountId   = account.id;
  _remUsername    = account.username;
  _remDisplayName = account.displayName || '';
  _remAccountInfo = account.info || '';
  _updateAccountBadge(account.displayName || account.username);
  hideLoginOverlay();
  // Refresh entity list so the new user's entities are shown
  if (typeof refreshSidebarEntities === 'function') refreshSidebarEntities();
  resolveAuthWaiters(getCurrentAccount());
}

async function getAuthBootstrap() {
  try {
    const resp = await fetch('/api/auth/bootstrap');
    const data = await resp.json().catch(() => ({}));
    if (resp.ok && data && data.ok) return data;
  } catch (_) {}
  return { ok: false, authenticated: false, hasAccounts: false, account: null };
}

function beginAuthFlow(preferredTab = 'login') {
  switchLoginTab(preferredTab === 'register' ? 'register' : 'login');
  clearLoginErrors();
  showLoginOverlay();
  const existing = getCurrentAccount();
  if (existing) return Promise.resolve(existing);
  return new Promise(resolve => {
    _authWaiters.push(resolve);
  });
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function handleLogin() {
  const username = (document.getElementById('authLoginUsername') || {}).value || '';
  const password = (document.getElementById('authLoginPassword') || {}).value || '';
  const errEl    = document.getElementById('authLoginError');

  if (!username.trim() || !password) {
    if (errEl) { errEl.textContent = 'Enter username and password'; errEl.style.display = ''; }
    return;
  }

  try {
    const resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password })
    });
    const data = await resp.json().catch(() => ({}));
    if (data.ok) {
      _onAuthSuccess(data.account);
    } else {
      if (errEl) { errEl.textContent = data.error || 'Login failed'; errEl.style.display = ''; }
    }
  } catch (e) {
    if (errEl) { errEl.textContent = 'Network error: ' + e.message; errEl.style.display = ''; }
  }
}

// ── Register ──────────────────────────────────────────────────────────────────
async function handleRegister() {
  const displayName = (document.getElementById('authRegDisplayName') || {}).value || '';
  const info        = (document.getElementById('authRegInfo')        || {}).value || '';
  const username    = (document.getElementById('authRegUsername')    || {}).value || '';
  const password    = (document.getElementById('authRegPassword')    || {}).value || '';
  const errEl       = document.getElementById('authRegisterError');

  if (!displayName.trim()) {
    if (errEl) { errEl.textContent = 'Please enter your name or nickname'; errEl.style.display = ''; }
    return;
  }
  if (!username.trim() || !password) {
    if (errEl) { errEl.textContent = 'Enter username and password'; errEl.style.display = ''; }
    return;
  }

  try {
    const resp = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: displayName.trim(), info: info.trim(), username: username.trim(), password })
    });
    const data = await resp.json().catch(() => ({}));
    if (data.ok) {
      _onAuthSuccess(data.account);
    } else {
      if (errEl) { errEl.textContent = data.error || 'Registration failed'; errEl.style.display = ''; }
    }
  } catch (e) {
    if (errEl) { errEl.textContent = 'Network error: ' + e.message; errEl.style.display = ''; }
  }
}

// ── Logout ────────────────────────────────────────────────────────────────────
async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (_) {}
  _remAccountId   = null;
  _remUsername    = null;
  _remDisplayName = null;
  _remAccountInfo = null;
  _clearAccountBadge();
  // Clear entity state
  if (typeof currentEntityId !== 'undefined') {
    // eslint-disable-next-line no-global-assign
    currentEntityId = null;
  }
  const sidebarList = document.getElementById('sidebarEntityList');
  if (sidebarList) sidebarList.innerHTML = '<div style="color:var(--td);text-align:center;padding:.75rem .25rem;font-size:.65rem;">No entities yet</div>';
  switchLoginTab('login');
  showLoginOverlay();
}

// ── Init: check for existing session on page load ────────────────────────────
async function initLogin(options = {}) {
  const { showOverlayOnFail = true } = options;
  try {
    const resp = await fetch('/api/auth/me');
    if (resp.ok) {
      const data = await resp.json().catch(() => ({}));
      if (data.ok && data.account) {
        _onAuthSuccess(data.account);
        return { authenticated: true, account: data.account };
      }
    }
  } catch (_) {}
  if (showOverlayOnFail) showLoginOverlay();
  return { authenticated: false, account: null };
}

// Allow Enter key to submit login/register forms
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('authLoginPassword')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('authLoginUsername')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('authRegPassword')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleRegister();
  });
  document.getElementById('authRegUsername')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleRegister();
  });
  document.getElementById('authRegDisplayName')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleRegister();
  });
  document.getElementById('authRegInfo')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleRegister();
  });
});
