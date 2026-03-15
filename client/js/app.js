// ============================================================
// REM System v0.6.0 — App Bootstrap & Core Utilities
// ============================================================

// ============================================================
// GLOBAL STATE
// ============================================================
let busy = false;

// Active provider config: { type: 'openrouter'|'ollama', endpoint, apiKey, model }
let activeConfig = null;
let currentEntityId = null;
let currentEntityName = null;
let currentEntityAvatar = '🤖';


// Chat state (used by chat.js)
let chatHistory = [];
let chatBusy = false;
let chatArchive = '';
let chatRawSource = '';
let pendingSystemPromptText = null;
let loadedArchives = [];
let contextStreamActive = false;
let contextFailsafeTimer = null;

// Subconscious state (used by sleep.js)
let subEnabled = true;
let subArchiving = false;
let subArchiveCount = 0;
let sleeping = false;
let subconsciousBootstrapped = false;

// Config state
const CONFIG_API = '/api/config';
let savedConfig = { profiles: {}, lastActive: null };

// Setup wizard state
let setupActive = false;
let setupStep = 0;
let setupData = {};

const THEME_STORAGE_KEY = 'rem-ui-theme';
const SHELL_THEMES = {
  'system-default': { id: 'system-default', label: 'System Default', href: '' },
  'light-default': { id: 'light-default', label: 'Light Mode', href: 'themes/light-default.css' },
  'neko-default': { id: 'neko-default', label: 'NekoCore', href: 'themes/neko-default.css' },
  'sunset-terminal': { id: 'sunset-terminal', label: 'Sunset Terminal', href: 'themes/sunset-terminal.css' },
  'frosted-orbit': { id: 'frosted-orbit', label: 'Frosted Orbit', href: 'themes/frosted-orbit.css' },
  'mac-sequoia': { id: 'mac-sequoia', label: 'Mac Sequoia', href: 'themes/mac-sequoia.css' },
  'ubuntu-dash': { id: 'ubuntu-dash', label: 'Ubuntu Dash', href: 'themes/ubuntu-dash.css' }
};

let desktopShellInitialized = false;
let shellClockTimer = null;
let shellStatusTimer = null;
let webUiPresenceTimer = null;
let webUiPresenceStarted = false;
let taskbarOverflowRaf = 0;
const WINDOW_LAYOUT_STORAGE_KEY = 'rem-window-layout-v2';
const PINNED_APPS_STORAGE_KEY = 'rem-pinned-apps-v1';
const DEFAULT_PINNED_APPS = ['chat', 'skills', 'activity', 'browser'];

const WINDOW_APPS = [
  { tab: 'chat', label: 'Chat', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>', accent: 'green', w: 980, h: 680 },
  { tab: 'entity', label: 'Entity', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>', accent: 'gold', w: 820, h: 620 },
  { tab: 'creator', label: 'Creator', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>', accent: 'gold', w: 980, h: 760 },
  { tab: 'users', label: 'Users', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>', accent: 'cyan', w: 900, h: 660 },
  { tab: 'browser', label: 'NekoCore Browser', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>', accent: 'cyan', w: 1080, h: 720 },
  { tab: 'skills', label: 'Skills', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>', accent: 'orange', w: 980, h: 680 },
  { tab: 'workspace', label: 'Workspace', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>', accent: 'orange', w: 980, h: 680 },
  { tab: 'documents', label: 'Documents', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>', accent: 'orange', w: 980, h: 680 },
  { tab: 'visualizer', label: 'Visualizer', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>', accent: 'indigo', w: 1020, h: 700 },
  { tab: 'physical', label: 'Physical Body', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>', accent: 'pink', w: 900, h: 640 },
  { tab: 'dreamgallery', label: 'Dream Gallery', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>', accent: 'purple', w: 980, h: 680 },
  { tab: 'lifediary', label: 'Life Diary', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>', accent: 'pink', w: 900, h: 640 },
  { tab: 'dreamdiary', label: 'Dream Diary', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>', accent: 'purple', w: 900, h: 640 },
  { tab: 'themes', label: 'Themes', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>', accent: 'teal', w: 900, h: 640 },
  { tab: 'settings', label: 'Settings', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>', accent: 'teal', w: 980, h: 700 },
  { tab: 'advanced', label: 'Advanced', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>', accent: 'teal', w: 980, h: 680 },
  { tab: 'activity', label: 'Task Manager', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>', accent: 'indigo', w: 980, h: 680 },
  { tab: 'observability', label: 'Observability', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>', accent: 'indigo', w: 980, h: 680 },
  { tab: 'nekocore', label: 'NekoCore OS', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>', accent: 'indigo', w: 900, h: 640 }
];

const START_MENU_CATEGORY_ORDER = [
  { id: 'core', label: 'Core' },
  { id: 'browse', label: 'Browse & Research' },
  { id: 'tools', label: 'Tools & Workspace' },
  { id: 'mind', label: 'Mind & Identity' },
  { id: 'journal', label: 'Journals & Dreams' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'system', label: 'System' }
];

const APP_CATEGORY_BY_TAB = {
  chat: 'core',
  entity: 'core',
  creator: 'core',
  users: 'core',
  browser: 'browse',
  skills: 'tools',
  workspace: 'tools',
  documents: 'tools',
  visualizer: 'mind',
  physical: 'mind',
  dreamgallery: 'journal',
  lifediary: 'journal',
  dreamdiary: 'journal',
  themes: 'appearance',
  settings: 'system',
  advanced: 'system',
  activity: 'system',
  observability: 'system',
  nekocore: 'system'
};

const START_MENU_SPECIAL_APPS = [
  {
    id: 'control-panel',
    tab: 'settings',
    launchTab: 'settings',
    label: 'Control Panel',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3m0 12l-4-4m4 4l4-4"/><path d="M2 17l.621 2.485A2 2 0 0 0 4.561 21h14.878a2 2 0 0 0 1.94-1.515L22 17"/></svg>',
    accent: 'teal',
    category: 'system',
    pinnable: false,
    description: 'Classic settings hub'
  },

  {
    id: 'save-layout',
    label: 'Save Layout',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
    accent: 'green',
    category: 'appearance',
    pinnable: false,
    description: 'Save current windows',
    action: 'saveWindowLayout'
  },
  {
    id: 'restore-layout',
    label: 'Restore Layout',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>',
    accent: 'indigo',
    category: 'appearance',
    pinnable: false,
    description: 'Restore saved layout',
    action: 'restoreWindowLayout'
  },
  {
    id: 'reset-layout',
    label: 'Reset Layout',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
    accent: 'pink',
    category: 'appearance',
    pinnable: false,
    description: 'Reset window positions',
    action: 'resetWindowLayout'
  }
];

const windowManager = {
  stage: null,
  windows: new Map(),
  z: 20,
  initialized: false,
  popoutTab: null,
  dock: {
    overlay: null,
    active: false,
    selectedZone: null,
    tab: null
  }
};
let pinnedApps = [];
let selectedStartCategoryId = '';
let startCategoryViewMode = 'categories';
let layoutResizeRaf = 0;
let systemThemeMediaQuery = null;
const pinnedDragState = {
  tab: null,
  source: null,
  hoveringTab: null
};

const runtimeTelemetry = {
  activePhase: 'Idle',
  phaseSince: 0,
  tokenUsage: null,
  models: {},
  totalDurationMs: 0,
  brainCycleCount: 0,
  brainRunning: false,
  eventFeed: [],
  somatic: {
    cpu: 0,
    ram: 0
  },
  appStats: {},
  activeWindowTab: 'chat',
  lastRequestByTab: {}
};

// ============================================================
// LOGGING
// ============================================================
function lg(type, msg) {
  const body = document.getElementById('sidebarLogContent');
  if (!body) return;
  const entry = document.createElement('div');
  entry.className = 'le ' + type;
  entry.innerHTML = '<span class="ts">' + new Date().toLocaleTimeString() + '</span><span class="mg">' + msg + '</span>';
  body.appendChild(entry);
  body.scrollTop = body.scrollHeight;
}

function waitMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function setBootOverlayState(title, detail, percent) {
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  const titleEl = document.getElementById('bootTitle');
  const detailEl = document.getElementById('bootDetail');
  const phaseEl = document.getElementById('bootPhaseLabel');
  const percentEl = document.getElementById('bootPercentLabel');
  const barEl = document.getElementById('bootProgressBar');
  if (titleEl) titleEl.textContent = title;
  if (detailEl) detailEl.textContent = detail;
  if (phaseEl) phaseEl.textContent = title;
  if (percentEl) percentEl.textContent = pct + '%';
  if (barEl) barEl.style.width = pct + '%';
}

function showBootOverlay() {
  const overlay = document.getElementById('bootOverlay');
  if (overlay) overlay.style.display = 'flex';
}

function hideBootOverlay() {
  const overlay = document.getElementById('bootOverlay');
  if (overlay) overlay.style.display = 'none';
}

function getBootGreetingTitle() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

async function runBootStage(title, detail, percent, delayMs = 520) {
  setBootOverlayState(title, detail, percent);
  await waitMs(delayMs);
}

// ============================================================
// UI HELPERS
// ============================================================
function updateProviderUI(type, connected, label) {
  const statusEl = document.getElementById(type + 'Status');
  if (statusEl) {
    statusEl.className = 'auth-status ' + (connected ? 'connected' : 'disconnected');
    statusEl.querySelector('span').textContent = connected ? 'Connected' : 'Not connected';
  }
  if (connected && label) {
    document.getElementById('providerName').textContent = label;
    const colors = { openrouter: 'var(--ac)', ollama: 'var(--ollama)', apikey: 'var(--ac)' };
    document.getElementById('providerDot').style.background = colors[type] || 'var(--em)';
  } else if (!activeConfig) {
    document.getElementById('providerName').textContent = 'No provider';
    document.getElementById('providerDot').style.background = 'var(--td)';
  }
  if (connected) {
    try { if (typeof flushPendingSystemPrompt === 'function') flushPendingSystemPrompt(); } catch (e) { /* ignore */ }
  }
  syncShellStatusWidgets();
}

function getStoredThemeId() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) || 'system-default';
  } catch (_) {
    return 'system-default';
  }
}

function updateShellThemeSummary(themeId) {
  const resolvedThemeId = themeId === 'system-default'
    ? ((window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'neko-default' : 'light-default')
    : themeId;
  const theme = SHELL_THEMES[resolvedThemeId] || SHELL_THEMES['neko-default'];
  const summary = document.getElementById('shellThemeSummary');
  if (summary) summary.textContent = themeId === 'system-default' ? 'System (' + theme.label + ')' : theme.label;
  const tmTheme = document.getElementById('tmThemeName');
  if (tmTheme) tmTheme.textContent = themeId === 'system-default' ? 'System (' + theme.label + ')' : theme.label;
}

function syncThemeSelectorUI(themeId) {
  document.querySelectorAll('[data-theme-option]').forEach((button) => {
    button.classList.toggle('is-active', button.getAttribute('data-theme-option') === themeId);
  });
  updateShellThemeSummary(themeId);
  renderThemeGallery();
}

function renderThemeGallery() {
  const grid = document.getElementById('themeGalleryGrid');
  if (!grid) return;
  const currentId = getStoredThemeId();
  grid.innerHTML = '';
  const THEME_PREVIEWS = {
    'system-default': { bg: 'linear-gradient(135deg,#1a1a2e 50%,#f5f5f5 50%)', fg: '#fff', accent: '#6c63ff' },
    'light-default':  { bg: '#f5f5f5', fg: '#1a1a2e', accent: '#0078d4' },
    'neko-default':   { bg: '#04060d', fg: '#e4e4e7', accent: '#34d399' },
    'sunset-terminal':{ bg: '#1c1017', fg: '#f0d0a0', accent: '#ff6b35' },
    'frosted-orbit':  { bg: '#101828', fg: '#d0dff0', accent: '#38bdf8' },
    'mac-sequoia':    { bg: '#1e1e2e', fg: '#cdd6f4', accent: '#89b4fa' },
    'ubuntu-dash':    { bg: '#2c001e', fg: '#ffffff', accent: '#e95420' }
  };
  Object.entries(SHELL_THEMES).forEach(([id, theme]) => {
    const p = THEME_PREVIEWS[id] || { bg: '#222', fg: '#eee', accent: '#888' };
    const card = document.createElement('button');
    card.className = 'theme-card' + (id === currentId ? ' is-active' : '');
    card.type = 'button';
    card.onclick = () => applyTheme(id);
    card.innerHTML =
      '<div class="theme-card-preview" style="background:' + p.bg + '">' +
        '<div class="theme-card-bar" style="background:' + p.accent + '"></div>' +
        '<div class="theme-card-line" style="background:' + p.fg + ';opacity:.5"></div>' +
        '<div class="theme-card-line short" style="background:' + p.fg + ';opacity:.3"></div>' +
      '</div>' +
      '<div class="theme-card-label">' + theme.label + '</div>' +
      (id === currentId ? '<div class="theme-card-badge">Active</div>' : '');
    grid.appendChild(card);
  });
}

function applyTheme(themeId) {
  const selected = SHELL_THEMES[themeId] ? themeId : 'neko-default';
  const theme = SHELL_THEMES[selected];
  const themeLink = document.getElementById('themeOverrideLink');

  if (systemThemeMediaQuery && systemThemeMediaQuery.__remListener) {
    systemThemeMediaQuery.removeEventListener('change', systemThemeMediaQuery.__remListener);
    systemThemeMediaQuery.__remListener = null;
  }

  const applyResolvedTheme = (resolvedId) => {
    const resolvedTheme = SHELL_THEMES[resolvedId] || SHELL_THEMES['neko-default'];
    if (themeLink) {
      themeLink.setAttribute('href', resolvedTheme.href);
    }
    document.documentElement.setAttribute('data-theme', selected);
    if (document.body) {
      document.body.classList.toggle('theme-ubuntu-dash', resolvedTheme.id === 'ubuntu-dash');
      document.body.classList.toggle('theme-mac-sequoia', resolvedTheme.id === 'mac-sequoia');
      document.body.classList.toggle('theme-light-mode', resolvedTheme.id === 'light-default');
    }
    updateShellThemeSummary(selected);
  };

  if (selected === 'system-default') {
    systemThemeMediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const resolveSystemTheme = () => (systemThemeMediaQuery && systemThemeMediaQuery.matches) ? 'neko-default' : 'light-default';
    applyResolvedTheme(resolveSystemTheme());
    if (systemThemeMediaQuery) {
      const listener = () => applyResolvedTheme(resolveSystemTheme());
      systemThemeMediaQuery.addEventListener('change', listener);
      systemThemeMediaQuery.__remListener = listener;
    }
  } else {
    applyResolvedTheme(selected);
  }

  try {
    localStorage.setItem(THEME_STORAGE_KEY, selected);
  } catch (_) {
    // Ignore storage failures and continue with in-memory theme.
  }
  syncThemeSelectorUI(selected);
}

function formatTelemetryModel(model) {
  if (!model) return '—';
  return String(model).split('/').pop();
}

function pushTelemetryEvent(line) {
  runtimeTelemetry.eventFeed.unshift({ ts: Date.now(), line });
  runtimeTelemetry.eventFeed = runtimeTelemetry.eventFeed.slice(0, 30);
}

function normalizePercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n <= 1) return Math.max(0, Math.min(100, n * 100));
  return Math.max(0, Math.min(100, n));
}

function getFocusedWindowTab() {
  const openWindows = Array.from(windowManager.windows.values()).filter((meta) => meta.open);
  if (!openWindows.length) return 'chat';
  openWindows.sort((a, b) => (parseInt(b.el.style.zIndex || '1', 10) - parseInt(a.el.style.zIndex || '1', 10)));
  return openWindows[0].tab;
}

function getOrCreateAppStats(tabName) {
  if (!runtimeTelemetry.appStats[tabName]) {
    runtimeTelemetry.appStats[tabName] = {
      cpu: [],
      memory: [],
      requestMs: [],
      label: getWindowApp(tabName).label,
      icon: getWindowApp(tabName).icon
    };
  }
  return runtimeTelemetry.appStats[tabName];
}

function pushSeriesPoint(series, value) {
  series.push(Math.round(value));
  if (series.length > 28) series.shift();
}

function estimateHeapPercent() {
  const mem = (typeof performance !== 'undefined' && performance.memory) ? performance.memory : null;
  if (!mem || !mem.totalJSHeapSize) return 0;
  return normalizePercent(mem.usedJSHeapSize / mem.totalJSHeapSize);
}

function updateAppStatsSeries() {
  const activeTab = runtimeTelemetry.activeWindowTab || getFocusedWindowTab();
  const openTabs = Array.from(windowManager.windows.values()).filter((meta) => meta.open).map((meta) => meta.tab);
  const candidateTabs = Array.from(new Set([...pinnedApps, ...openTabs, activeTab])).slice(0, 9);
  if (!candidateTabs.length) return;

  const cpuBase = normalizePercent(runtimeTelemetry.somatic.cpu) || 7;
  const ramBase = normalizePercent(runtimeTelemetry.somatic.ram) || estimateHeapPercent() || 22;
  const lastRequest = runtimeTelemetry.totalDurationMs || 0;

  candidateTabs.forEach((tabName) => {
    const stats = getOrCreateAppStats(tabName);
    const isOpen = openTabs.includes(tabName);
    const isActive = tabName === activeTab;
    const activityWeight = isActive ? 1 : (isOpen ? 0.6 : 0.28);
    const jitter = (Math.random() * 10) - 5;
    const cpuPoint = Math.max(1, Math.min(100, (cpuBase * activityWeight) + (isOpen ? 10 : 2) + jitter));
    const memPoint = Math.max(2, Math.min(100, (ramBase * (isActive ? 0.82 : 0.55)) + (isOpen ? 9 : 3) + (jitter * 0.4)));
    const reqSample = runtimeTelemetry.lastRequestByTab[tabName] || (tabName === activeTab ? lastRequest : Math.round(lastRequest * 0.38));

    pushSeriesPoint(stats.cpu, cpuPoint);
    pushSeriesPoint(stats.memory, memPoint);
    pushSeriesPoint(stats.requestMs, Math.max(0, Math.min(120000, Number(reqSample) || 0)));
  });
}

function sparklinePath(values, width, height, maxValue) {
  if (!values.length) return '';
  const max = Math.max(1, maxValue || Math.max.apply(null, values));
  const step = values.length === 1 ? width : width / (values.length - 1);
  return values.map((v, idx) => {
    const x = (idx * step).toFixed(1);
    const y = (height - ((Math.max(0, v) / max) * height)).toFixed(1);
    return (idx === 0 ? 'M' : 'L') + x + ' ' + y;
  }).join(' ');
}

function renderAppMetrics() {
  const host = document.getElementById('tmAppMetricsGrid');
  if (!host) return;

  updateAppStatsSeries();

  const keys = Object.keys(runtimeTelemetry.appStats)
    .filter((key) => pinnedApps.includes(key) || windowManager.windows.get(key)?.open)
    .slice(0, 9);

  if (!keys.length) {
    host.innerHTML = '<div class="tm-metric-empty">Open or pin apps to see live app telemetry.</div>';
    return;
  }

  host.innerHTML = keys.map((tabName) => {
    const stats = runtimeTelemetry.appStats[tabName];
    const app = getWindowApp(tabName);
    const cpuNow = stats.cpu.length ? stats.cpu[stats.cpu.length - 1] : 0;
    const memNow = stats.memory.length ? stats.memory[stats.memory.length - 1] : 0;
    const reqNow = stats.requestMs.length ? stats.requestMs[stats.requestMs.length - 1] : 0;
    const reqMax = Math.max(1000, Math.max.apply(null, stats.requestMs.concat([1000])));
    const cpuPath = sparklinePath(stats.cpu, 112, 28, 100);
    const memPath = sparklinePath(stats.memory, 112, 28, 100);
    const reqPath = sparklinePath(stats.requestMs, 112, 28, reqMax);
    const isOpen = windowManager.windows.get(tabName)?.open;

    return '<div class="tm-metric-card' + (isOpen ? ' is-open' : '') + '">' +
      '<div class="tm-metric-head"><span><span class="wm-title-icon" data-accent="' + (app.accent || 'green') + '">' + app.icon + '</span> ' + app.label + '</span><span class="tm-metric-pill">' + (isOpen ? 'Open' : 'Pinned') + '</span></div>' +
      '<div class="tm-spark-row"><span>CPU ' + cpuNow + '%</span><svg viewBox="0 0 112 28" aria-hidden="true"><path d="' + cpuPath + '"></path></svg></div>' +
      '<div class="tm-spark-row"><span>MEM ' + memNow + '%</span><svg viewBox="0 0 112 28" aria-hidden="true"><path d="' + memPath + '"></path></svg></div>' +
      '<div class="tm-spark-row"><span>REQ ' + reqNow + 'ms</span><svg viewBox="0 0 112 28" aria-hidden="true"><path d="' + reqPath + '"></path></svg></div>' +
    '</div>';
  }).join('');
}

function reportPipelinePhase(phase, status, detail) {
  runtimeTelemetry.activePhase = phase || 'Idle';
  runtimeTelemetry.phaseSince = Date.now();
  if (detail) pushTelemetryEvent((status ? status + ': ' : '') + detail);
}

function reportOrchestrationMetrics(data) {
  runtimeTelemetry.tokenUsage = data?.tokenUsage?.total || null;
  runtimeTelemetry.models = data?.models || runtimeTelemetry.models;
  runtimeTelemetry.totalDurationMs = data?.totalDuration || data?.timing?.total_ms || 0;
  const activeTab = runtimeTelemetry.activeWindowTab || getFocusedWindowTab();
  if (runtimeTelemetry.totalDurationMs > 0 && activeTab) {
    runtimeTelemetry.lastRequestByTab[activeTab] = runtimeTelemetry.totalDurationMs;
  }
  runtimeTelemetry.activePhase = 'Idle';
  runtimeTelemetry.phaseSince = Date.now();
  pushTelemetryEvent('Orchestration complete' + (runtimeTelemetry.totalDurationMs ? ' in ' + runtimeTelemetry.totalDurationMs + 'ms' : ''));
}

function updateShellClock() {
  const clock = document.getElementById('shellClock');
  const date = document.getElementById('shellDate');
  if (!clock && !date) return;
  const now = new Date();
  if (clock) clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (date) date.textContent = now.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function syncShellStatusWidgets() {
  const entitySummary = document.getElementById('shellEntitySummary');
  const providerSummary = document.getElementById('shellProviderSummary');
  const brainSummary = document.getElementById('shellBrainSummary');
  const taskbarStatus = document.getElementById('shellTaskbarStatus');

  const entityText = (currentEntityName && currentEntityName.trim())
    || document.getElementById('entityName')?.textContent?.trim()
    || document.getElementById('entityTraits')?.textContent?.trim()
    || 'No entity loaded';
  const providerText = document.getElementById('providerName')?.textContent?.trim() || 'No provider';
  const brainText = document.getElementById('brainLabel')?.textContent?.trim() || 'Idle';
  const openCount = Array.from(windowManager.windows.values()).filter((meta) => meta.open).length;

  if (entitySummary) entitySummary.textContent = entityText;
  if (providerSummary) providerSummary.textContent = providerText;
  if (brainSummary) brainSummary.textContent = brainText;
  if (taskbarStatus) {
    taskbarStatus.textContent = openCount > 0
      ? openCount + ' window' + (openCount === 1 ? '' : 's') + ' open'
      : 'No windows open';
  }

  const tmOpen = document.getElementById('tmOpenWindows');
  if (tmOpen) tmOpen.textContent = String(openCount);
  const tmPinned = document.getElementById('tmPinnedApps');
  if (tmPinned) tmPinned.textContent = String(pinnedApps.length);
}

function updateTaskManagerView() {
  const providerType = activeConfig?.type || 'none';
  const providerModel = activeConfig?.model || 'Not connected';
  const providerModelEl = document.getElementById('tmProviderModel');
  const providerTypeEl = document.getElementById('tmProviderType');
  if (providerModelEl) providerModelEl.textContent = providerModel;
  if (providerTypeEl) providerTypeEl.textContent = providerType;

  const phaseEl = document.getElementById('tmPipelinePhase');
  const ageEl = document.getElementById('tmPipelineAge');
  if (phaseEl) phaseEl.textContent = runtimeTelemetry.activePhase || 'Idle';
  if (ageEl) {
    const ageMs = runtimeTelemetry.phaseSince ? Date.now() - runtimeTelemetry.phaseSince : 0;
    ageEl.textContent = runtimeTelemetry.activePhase === 'Idle'
      ? 'No active orchestration'
      : 'Active for ' + Math.max(0, Math.round(ageMs / 1000)) + 's';
  }

  const tokens = runtimeTelemetry.tokenUsage;
  const tokenTotalEl = document.getElementById('tmTokensTotal');
  const tokenBreakEl = document.getElementById('tmTokensBreakdown');
  if (tokenTotalEl) tokenTotalEl.textContent = tokens ? String(tokens.total_tokens || 0) : '0';
  if (tokenBreakEl) tokenBreakEl.textContent = tokens
    ? 'In: ' + (tokens.prompt_tokens || 0) + ' • Out: ' + (tokens.completion_tokens || 0)
    : 'In: 0 • Out: 0';

  const brainStatusEl = document.getElementById('tmBrainStatus');
  const brainCycleEl = document.getElementById('tmBrainCycles');
  if (brainStatusEl) brainStatusEl.textContent = runtimeTelemetry.brainRunning ? 'Running' : 'Idle';
  if (brainCycleEl) {
    brainCycleEl.textContent = 'Cycle ' + (runtimeTelemetry.brainCycleCount || 0)
      + (runtimeTelemetry.totalDurationMs ? ' • Last run ' + runtimeTelemetry.totalDurationMs + 'ms' : '');
  }

  const models = runtimeTelemetry.models || {};
  const setModel = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = formatTelemetryModel(value);
  };
  setModel('tmModelSub', models.subconscious);
  setModel('tmModelDream', models.dream);
  setModel('tmModelConscious', models.conscious);
  setModel('tmModelOrchestrator', models.orchestrator);

  const feedEl = document.getElementById('tmEventFeed');
  if (feedEl) {
    if (!runtimeTelemetry.eventFeed.length) {
      feedEl.innerHTML = '<div class="tm-event">Waiting for pipeline events...</div>';
    } else {
      feedEl.innerHTML = runtimeTelemetry.eventFeed.slice(0, 12).map((item) => {
        const time = new Date(item.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        return '<div class="tm-event"><span class="tm-event-ts">' + time + '</span><span>' + item.line + '</span></div>';
      }).join('');
    }
  }

  renderAppMetrics();
}

window.reportPipelinePhase = reportPipelinePhase;
window.reportOrchestrationMetrics = reportOrchestrationMetrics;

function closeStartMenu() {
  const menu = document.getElementById('osStartMenu');
  const scrim = document.getElementById('osStartScrim');
  const button = document.getElementById('osStartButton');
  if (menu) {
    menu.classList.remove('open');
    menu.setAttribute('aria-hidden', 'true');
  }
  if (scrim) scrim.classList.remove('open');
  if (button) button.setAttribute('aria-expanded', 'false');
  closeStartPowerMenu();
}

function updateStartUserChip() {
  const nameEl = document.getElementById('osStartUserName');
  if (!nameEl) return;

  try {
    const account = typeof getCurrentAccount === 'function' ? getCurrentAccount() : null;
    if (account && (account.displayName || account.username)) {
      nameEl.textContent = account.displayName || account.username;
      return;
    }
  } catch (_) {}

  const fallback = document.getElementById('accountUsername');
  const fallbackName = fallback ? String(fallback.textContent || '').trim() : '';
  nameEl.textContent = fallbackName || 'NekoCore User';
}

function closeStartPowerMenu() {
  const powerMenu = document.getElementById('osStartPowerMenu');
  const powerButton = document.getElementById('osStartPowerButton');
  if (powerMenu) {
    powerMenu.classList.remove('open');
    powerMenu.setAttribute('aria-hidden', 'true');
  }
  if (powerButton) powerButton.setAttribute('aria-expanded', 'false');
}

function toggleStartPowerMenu(forceOpen) {
  const powerMenu = document.getElementById('osStartPowerMenu');
  const powerButton = document.getElementById('osStartPowerButton');
  if (!powerMenu) return;
  const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !powerMenu.classList.contains('open');
  powerMenu.classList.toggle('open', shouldOpen);
  powerMenu.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
  if (powerButton) powerButton.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
}

function restartShellUI() {
  closeStartMenu();
  window.location.reload();
}

function toggleStartMenu(forceOpen) {
  const menu = document.getElementById('osStartMenu');
  const scrim = document.getElementById('osStartScrim');
  const button = document.getElementById('osStartButton');
  if (!menu || !scrim) return;

  const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !menu.classList.contains('open');
  menu.classList.toggle('open', shouldOpen);
  menu.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
  scrim.classList.toggle('open', shouldOpen);
  if (button) button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  if (shouldOpen) {
    startCategoryViewMode = 'categories';
    updateStartUserChip();
    buildLauncherMenu();
  }
}

function openStartCategoryApps(categoryId) {
  if (!categoryId) return;
  selectedStartCategoryId = categoryId;
  startCategoryViewMode = 'apps';
  buildLauncherMenu();
}

function showStartCategories() {
  startCategoryViewMode = 'categories';
  buildLauncherMenu();
}

function showAllStartApps() {
  startCategoryViewMode = 'all';
  buildLauncherMenu();
}

function initDesktopShell() {
  if (desktopShellInitialized) return;
  desktopShellInitialized = true;

  applyTheme(getStoredThemeId());
  initWindowManager();
  loadBrowserSearchHistory();
  renderBrowserSearchHome();
  loadPinnedApps();
  updateStartUserChip();
  buildLauncherMenu();
  renderPinnedApps();
  updateShellClock();
  syncShellStatusWidgets();
  updateTaskManagerView();
  syncNavSidebarEntities();
  syncNavSidebarProfiles();

  if (!windowManager.popoutTab) {
    const restored = restoreWindowLayout();
    if (!restored) {
      switchMainTab('chat');
    }
  }

  shellClockTimer = window.setInterval(updateShellClock, 30000);
  shellStatusTimer = window.setInterval(syncShellStatusWidgets, 4000);
  window.setInterval(updateTaskManagerView, 1200);
  startWebUiPresenceHeartbeat();

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeStartMenu();
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const clickedInStartMenu = path.includes(document.getElementById('osStartMenu'));
    const clickedStartButton = path.includes(document.getElementById('osStartButton'));
    const clickedTaskbarLeft = path.includes(document.querySelector('.os-taskbar-left'));

    if (!target.closest('.os-start-power-wrap')) {
      closeStartPowerMenu();
    }
    if (clickedInStartMenu || clickedStartButton || clickedTaskbarLeft) return;
    closeStartMenu();
  });

  window.addEventListener('beforeunload', () => {
    if (!windowManager.popoutTab) saveWindowLayout();
    if (typeof browserCleanup === 'function') browserCleanup();
    reportWebUiPresence(false, { beacon: true });
  });
}

function reportWebUiPresence(isOpen, options = {}) {
  const payload = JSON.stringify({
    isOpen: !!isOpen,
    url: window.location.origin
  });

  if (options.beacon && navigator.sendBeacon) {
    const blob = new Blob([payload], { type: 'application/json' });
    navigator.sendBeacon('/api/system/webui-presence', blob);
    return;
  }

  fetch('/api/system/webui-presence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: !!options.keepalive
  }).catch(() => {});
}

function startWebUiPresenceHeartbeat() {
  if (webUiPresenceStarted) return;
  webUiPresenceStarted = true;

  reportWebUiPresence(true);
  webUiPresenceTimer = window.setInterval(() => reportWebUiPresence(true), 15000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) reportWebUiPresence(true);
  });
}

function getWindowApp(tabName) {
  return WINDOW_APPS.find((app) => app.tab === tabName)
    || { tab: tabName, label: tabName, icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>', w: 900, h: 640 };
}

function loadPinnedApps() {
  let hasStoredPins = false;
  try {
    const raw = localStorage.getItem(PINNED_APPS_STORAGE_KEY);
    if (raw !== null) {
      hasStoredPins = true;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        pinnedApps = parsed.filter((tab) => WINDOW_APPS.some((app) => app.tab === tab));
      } else {
        pinnedApps = [];
      }
    }
  } catch (_) {
    pinnedApps = [];
  }

  // Only seed defaults on first run when no stored pin state exists.
  // If users intentionally unpin everything, we keep that empty list.
  if (!hasStoredPins && !pinnedApps.length) pinnedApps = [...DEFAULT_PINNED_APPS];
}

function savePinnedApps() {
  try {
    localStorage.setItem(PINNED_APPS_STORAGE_KEY, JSON.stringify(pinnedApps));
  } catch (_) {
    // Ignore storage failures.
  }
}

function isPinnedApp(tabName) {
  return pinnedApps.includes(tabName);
}

function togglePinnedApp(tabName) {
  if (isPinnedApp(tabName)) {
    pinnedApps = pinnedApps.filter((tab) => tab !== tabName);
  } else {
    pinnedApps.push(tabName);
  }
  savePinnedApps();
  buildLauncherMenu();
  renderPinnedApps();
}

function reorderPinnedApps(dragTab, beforeTab) {
  if (!dragTab || !pinnedApps.includes(dragTab)) return;
  const next = pinnedApps.filter((tab) => tab !== dragTab);
  const insertAt = beforeTab && next.includes(beforeTab) ? next.indexOf(beforeTab) : next.length;
  next.splice(insertAt, 0, dragTab);
  pinnedApps = next;
  savePinnedApps();
  buildLauncherMenu();
  renderPinnedApps();
}

function clearPinnedDropTargets() {
  document.querySelectorAll('.os-pinned-app.drop-target, .os-dash-app.drop-target').forEach((el) => {
    el.classList.remove('drop-target');
  });
}

function onPinnedDragStart(event) {
  const el = event.currentTarget;
  if (!(el instanceof Element)) return;
  const tab = el.getAttribute('data-tab');
  if (!tab) return;
  pinnedDragState.tab = tab;
  pinnedDragState.source = el.classList.contains('os-dash-app') ? 'dash' : 'taskbar';
  el.classList.add('is-dragging');
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', tab);
  }
}

function onPinnedDragEnd(event) {
  const el = event.currentTarget;
  if (el instanceof Element) el.classList.remove('is-dragging');
  pinnedDragState.tab = null;
  pinnedDragState.source = null;
  pinnedDragState.hoveringTab = null;
  clearPinnedDropTargets();
}

function onPinnedDragOver(event) {
  if (!pinnedDragState.tab) return;
  event.preventDefault();
  const el = event.currentTarget;
  if (!(el instanceof Element)) return;
  const targetTab = el.getAttribute('data-tab');
  if (!targetTab || targetTab === pinnedDragState.tab) return;
  clearPinnedDropTargets();
  el.classList.add('drop-target');
  pinnedDragState.hoveringTab = targetTab;
}

function onPinnedDrop(event) {
  if (!pinnedDragState.tab) return;
  event.preventDefault();
  const el = event.currentTarget;
  const targetTab = el instanceof Element ? el.getAttribute('data-tab') : null;
  reorderPinnedApps(pinnedDragState.tab, targetTab || pinnedDragState.hoveringTab || null);
  clearPinnedDropTargets();
}

function onPinnedContainerDragOver(event) {
  if (!pinnedDragState.tab) return;
  event.preventDefault();
}

function onPinnedContainerDrop(event) {
  if (!pinnedDragState.tab) return;
  event.preventDefault();
  if (pinnedDragState.hoveringTab) {
    reorderPinnedApps(pinnedDragState.tab, pinnedDragState.hoveringTab);
  } else {
    reorderPinnedApps(pinnedDragState.tab, null);
  }
  clearPinnedDropTargets();
}

function createPinnedButton(app, className) {
  const button = document.createElement('button');
  button.className = className;
  button.setAttribute('data-tab', app.tab);
  button.title = app.label;
  button.setAttribute('aria-label', app.label);
  button.innerHTML = '<span class="os-pinned-app-icon" data-accent="' + (app.accent || 'green') + '">' + app.icon + '</span>';
  button.onclick = function() { switchMainTab(app.tab, button); };
  button.draggable = true;
  button.addEventListener('dragstart', onPinnedDragStart);
  button.addEventListener('dragend', onPinnedDragEnd);
  button.addEventListener('dragover', onPinnedDragOver);
  button.addEventListener('drop', onPinnedDrop);
  return button;
}

function updateTaskbarOverflow() {
  if (taskbarOverflowRaf) {
    cancelAnimationFrame(taskbarOverflowRaf);
    taskbarOverflowRaf = 0;
  }

  taskbarOverflowRaf = requestAnimationFrame(() => {
    taskbarOverflowRaf = 0;
    const center = document.getElementById('osTaskbarCenter');
    const startBtn = document.getElementById('osStartButton');
    const taskbarHost = document.getElementById('osTaskbarPinned');
    const overflowWrap = document.getElementById('osTaskbarOverflowWrap');
    const overflowMenu = document.getElementById('osTaskbarOverflowMenu');
    const overflowButton = document.getElementById('osTaskbarOverflowButton');
    if (!center || !startBtn || !taskbarHost || !overflowWrap || !overflowMenu || !overflowButton) return;

    overflowMenu.innerHTML = '';
    overflowWrap.classList.remove('open');
    overflowWrap.style.display = 'none';
    overflowButton.setAttribute('aria-expanded', 'false');

    const allButtons = Array.from(taskbarHost.querySelectorAll('.os-pinned-app'));
    if (!allButtons.length) return;

    allButtons.forEach((btn) => {
      btn.style.display = '';
    });

    const available = Math.max(120, center.clientWidth - startBtn.offsetWidth - 14);
    let used = 0;
    let visibleCount = allButtons.length;

    for (let i = 0; i < allButtons.length; i += 1) {
      const width = allButtons[i].offsetWidth + 8;
      if (used + width > available) {
        visibleCount = i;
        break;
      }
      used += width;
    }

    if (visibleCount >= allButtons.length) return;

    overflowWrap.style.display = 'inline-flex';
    overflowWrap.classList.remove('open');
    const reserve = overflowButton.offsetWidth + 8;
    while (visibleCount > 0 && used + reserve > available) {
      visibleCount -= 1;
      used -= (allButtons[visibleCount].offsetWidth + 8);
    }

    allButtons.forEach((btn, index) => {
      if (index < visibleCount) {
        btn.style.display = '';
        return;
      }
      btn.style.display = 'none';
      const clone = btn.cloneNode(true);
      clone.classList.add('os-overflow-app');
      clone.style.display = '';
      clone.onclick = function() {
        switchMainTab(clone.getAttribute('data-tab'), clone);
        overflowWrap.classList.remove('open');
        overflowButton.setAttribute('aria-expanded', 'false');
      };
      overflowMenu.appendChild(clone);
    });

    if (!overflowMenu.children.length) {
      overflowWrap.style.display = 'none';
    }
  });
}

function bindTaskbarOverflowControls() {
  const overflowWrap = document.getElementById('osTaskbarOverflowWrap');
  const overflowButton = document.getElementById('osTaskbarOverflowButton');
  if (!overflowWrap || !overflowButton || overflowButton.dataset.bound === '1') return;

  overflowButton.dataset.bound = '1';
  overflowButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const shouldOpen = !overflowWrap.classList.contains('open');
    overflowWrap.classList.toggle('open', shouldOpen);
    overflowButton.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('#osTaskbarOverflowWrap')) return;
    overflowWrap.classList.remove('open');
    overflowButton.setAttribute('aria-expanded', 'false');
  });
}

function renderPinnedApps() {
  const taskbarHost = document.getElementById('osTaskbarPinned');
  const dashHost = document.getElementById('osSideDashPinned');
  const overflowWrap = document.getElementById('osTaskbarOverflowWrap');
  const overflowMenu = document.getElementById('osTaskbarOverflowMenu');
  if (taskbarHost) taskbarHost.innerHTML = '';
  if (dashHost) dashHost.innerHTML = '';
  if (overflowMenu) overflowMenu.innerHTML = '';
  if (overflowWrap) overflowWrap.classList.remove('open');

  if (taskbarHost) {
    if (taskbarHost.dataset.dropBound !== '1') {
      taskbarHost.addEventListener('dragover', onPinnedContainerDragOver);
      taskbarHost.addEventListener('drop', onPinnedContainerDrop);
      taskbarHost.dataset.dropBound = '1';
    }
  }
  if (dashHost) {
    if (dashHost.dataset.dropBound !== '1') {
      dashHost.addEventListener('dragover', onPinnedContainerDragOver);
      dashHost.addEventListener('drop', onPinnedContainerDrop);
      dashHost.dataset.dropBound = '1';
    }
  }

  pinnedApps.forEach((tabName) => {
    const app = getWindowApp(tabName);
    if (!windowManager.windows.has(tabName)) return;
    if (taskbarHost) taskbarHost.appendChild(createPinnedButton(app, 'os-pinned-app'));
    if (dashHost) {
      const dashBtn = document.createElement('button');
      dashBtn.className = 'os-dash-app';
      dashBtn.setAttribute('data-tab', app.tab);
      dashBtn.title = app.label;
      dashBtn.innerHTML = '<span class="os-pinned-app-icon" data-accent="' + (app.accent || 'green') + '">' + app.icon + '</span>';
      dashBtn.onclick = function() { switchMainTab(app.tab, dashBtn); };
      dashBtn.draggable = true;
      dashBtn.addEventListener('dragstart', onPinnedDragStart);
      dashBtn.addEventListener('dragend', onPinnedDragEnd);
      dashBtn.addEventListener('dragover', onPinnedDragOver);
      dashBtn.addEventListener('drop', onPinnedDrop);
      dashHost.appendChild(dashBtn);
    }
  });

  bindTaskbarOverflowControls();
  updateTaskbarOverflow();
  updateTaskManagerView();
}

function getStageRect() {
  if (!windowManager.stage) {
    return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight - 72 };
  }
  return windowManager.stage.getBoundingClientRect();
}

function scheduleLayoutResizeSignal(detail = {}) {
  if (layoutResizeRaf) return;
  layoutResizeRaf = requestAnimationFrame(() => {
    layoutResizeRaf = 0;
    try { window.dispatchEvent(new Event('resize')); } catch (_) {}
    try { window.dispatchEvent(new CustomEvent('rem:layout-resized', { detail })); } catch (_) {}
  });
}

function clampWindowRect(rect, minWidth = 460, minHeight = 320) {
  const stage = getStageRect();
  const width = Math.max(minWidth, Math.min(rect.width, stage.width));
  const height = Math.max(minHeight, Math.min(rect.height, stage.height));
  const maxLeft = Math.max(0, stage.width - width);
  const maxTop = Math.max(0, stage.height - height);
  const left = Math.max(0, Math.min(rect.left, maxLeft));
  const top = Math.max(0, Math.min(rect.top, maxTop));
  return { left, top, width, height };
}

function setWindowRect(meta, rect) {
  const clamped = clampWindowRect(rect);
  meta.el.style.left = clamped.left + 'px';
  meta.el.style.top = clamped.top + 'px';
  meta.el.style.width = clamped.width + 'px';
  meta.el.style.height = clamped.height + 'px';
  scheduleLayoutResizeSignal({ tab: meta.tab, width: clamped.width, height: clamped.height });
}

function captureWindowRect(meta) {
  return {
    left: parseFloat(meta.el.style.left) || 0,
    top: parseFloat(meta.el.style.top) || 0,
    width: parseFloat(meta.el.style.width) || 900,
    height: parseFloat(meta.el.style.height) || 640
  };
}

function rememberWindowRestoreRect(meta) {
  if (meta.maximized || meta.snapState) return;
  meta.restoreRect = captureWindowRect(meta);
}

function clearWindowDockState(meta) {
  meta.maximized = false;
  meta.snapState = null;
  meta.el.classList.remove('maximized');
}

function restoreWindowForDrag(meta, pointerEvent) {
  if (!meta.maximized && !meta.snapState) {
    return captureWindowRect(meta);
  }

  const stage = getStageRect();
  const currentBounds = meta.el.getBoundingClientRect();
  const fallback = getWindowApp(meta.tab);
  const restoreRect = meta.restoreRect || {
    left: Math.round((stage.width - fallback.w) / 2),
    top: Math.round((stage.height - fallback.h) / 2),
    width: fallback.w,
    height: fallback.h
  };
  const pointerRatioX = currentBounds.width > 0
    ? (pointerEvent.clientX - currentBounds.left) / currentBounds.width
    : 0.5;
  const anchorX = Math.max(0.18, Math.min(0.82, pointerRatioX));
  const targetRect = {
    left: (pointerEvent.clientX - stage.left) - (restoreRect.width * anchorX),
    top: Math.max(0, (pointerEvent.clientY - stage.top) - 24),
    width: restoreRect.width,
    height: restoreRect.height
  };

  clearWindowDockState(meta);
  setWindowRect(meta, targetRect);
  return captureWindowRect(meta);
}

function focusWindow(tabName) {
  const meta = windowManager.windows.get(tabName);
  if (!meta || !meta.open) return;
  windowManager.z += 1;
  meta.el.style.zIndex = String(windowManager.z);
  windowManager.windows.forEach((item) => item.el.classList.remove('focused'));
  meta.el.classList.add('focused');
  runtimeTelemetry.activeWindowTab = tabName;
}

function applyWindowActivationEffects(tabName) {
  if (tabName === 'physical') {
    initPhysicalTab();
  }
  if (tabName === 'entity') {
    ensureEntityWindowContent(false);
  }
  if (tabName === 'users') {
    usersAppRefresh();
  }
  if (tabName === 'lifediary' && typeof loadLifeDiary === 'function') {
    loadLifeDiary();
  }
  if (tabName === 'dreamdiary' && typeof loadDreamDiary === 'function') {
    loadDreamDiary();
  }
  if (tabName === 'browser' && typeof initBrowserApp === 'function') {
    initBrowserApp();
  }
}

function openNekoCoreWithMessage(msg) {
  const text = (msg || '').trim();
  if (!text) { openWindow('nekocore'); return; }
  // Clear the taskbar input
  const inp = document.getElementById('nkQuickInput');
  if (inp) inp.value = '';
  // Open (or focus) the NekoCore window
  openWindow('nekocore');
  // Load the iframe if not yet loaded
  const fr = document.getElementById('nekocore-panel-frame');
  if (!fr) return;
  const dispatch = () => fr.contentWindow && fr.contentWindow.postMessage({ type: 'nk_send_message', text }, '*');
  if (fr.getAttribute('src')) {
    // Already loaded — post immediately (allow a tick for focus)
    setTimeout(dispatch, 80);
  } else {
    fr.addEventListener('load', () => setTimeout(dispatch, 80), { once: true });
  }
}

function openWindow(tabName, options = {}) {
  const meta = windowManager.windows.get(tabName);
  if (!meta) return;

  const needsCenter = options.center === true || !meta.open;
  meta.open = true;
  meta.el.style.display = 'flex';
  meta.el.classList.add('open', 'opening');
  window.setTimeout(() => meta.el.classList.remove('opening'), 220);

  if (needsCenter && !meta.maximized) {
    const stage = getStageRect();
    const app = getWindowApp(tabName);
    setWindowRect(meta, {
      left: Math.round((stage.width - app.w) / 2),
      top: Math.round((stage.height - app.h) / 2),
      width: app.w,
      height: app.h
    });
  }

  if (options.maximize) {
    toggleMaximizeWindow(tabName, true);
  }

  focusWindow(tabName);
  applyWindowActivationEffects(tabName);
  syncShellStatusWidgets();

  // Per-tab on-open hooks
  if (tabName === 'workspace' && typeof feRender === 'function') feRender();
  if (tabName === 'nekocore') {
    // Lazy-load the iframe on first open so no API calls happen at startup
    const fr = document.getElementById('nekocore-panel-frame');
    if (fr && !fr.getAttribute('src')) fr.src = 'nekocore.html';
  }
}

function closeWindow(tabName) {
  const meta = windowManager.windows.get(tabName);
  if (!meta) return;
  // Browser-specific: save session on window close
  if (tabName === 'browser' && typeof _browserSaveSessionSync === 'function') {
    _browserSaveSessionSync();
  }
  meta.open = false;
  meta.el.classList.remove('open', 'focused');
  meta.el.style.display = 'none';
  runtimeTelemetry.activeWindowTab = getFocusedWindowTab();
  syncShellStatusWidgets();
}

function toggleMaximizeWindow(tabName, force) {
  const meta = windowManager.windows.get(tabName);
  if (!meta) return;
  const shouldMaximize = typeof force === 'boolean' ? force : !meta.maximized;
  const stage = getStageRect();

  if (shouldMaximize && !meta.maximized) {
    rememberWindowRestoreRect(meta);
    meta.maximized = true;
    meta.snapState = null;
    meta.el.classList.add('maximized');
    setWindowRect(meta, { left: 0, top: 0, width: stage.width, height: stage.height });
  } else if (!shouldMaximize && meta.maximized) {
    clearWindowDockState(meta);
    if (meta.restoreRect) setWindowRect(meta, meta.restoreRect);
  }
}

function snapWindow(tabName, side) {
  const meta = windowManager.windows.get(tabName);
  if (!meta) return;
  const stage = getStageRect();
  rememberWindowRestoreRect(meta);
  clearWindowDockState(meta);
  if (side === 'left') {
    meta.snapState = 'left';
    setWindowRect(meta, { left: 0, top: 0, width: stage.width / 2, height: stage.height });
  } else if (side === 'right') {
    meta.snapState = 'right';
    setWindowRect(meta, { left: stage.width / 2, top: 0, width: stage.width / 2, height: stage.height });
  } else if (side === 'top') {
    meta.snapState = 'top';
    setWindowRect(meta, { left: 0, top: 0, width: stage.width, height: stage.height / 2 });
  } else if (side === 'bottom') {
    meta.snapState = 'bottom';
    setWindowRect(meta, { left: 0, top: stage.height / 2, width: stage.width, height: stage.height / 2 });
  } else if (side === 'top-left') {
    meta.snapState = 'top-left';
    setWindowRect(meta, { left: 0, top: 0, width: stage.width / 2, height: stage.height / 2 });
  } else if (side === 'top-right') {
    meta.snapState = 'top-right';
    setWindowRect(meta, { left: stage.width / 2, top: 0, width: stage.width / 2, height: stage.height / 2 });
  } else if (side === 'bottom-left') {
    meta.snapState = 'bottom-left';
    setWindowRect(meta, { left: 0, top: stage.height / 2, width: stage.width / 2, height: stage.height / 2 });
  } else if (side === 'bottom-right') {
    meta.snapState = 'bottom-right';
    setWindowRect(meta, { left: stage.width / 2, top: stage.height / 2, width: stage.width / 2, height: stage.height / 2 });
  } else if (side === 'maximize') {
    toggleMaximizeWindow(tabName, true);
    return;
  }
  focusWindow(tabName);
}

function showSnapDock(tabName) {
  const overlay = windowManager.dock.overlay;
  if (!overlay || windowManager.popoutTab) return;
  windowManager.dock.active = true;
  windowManager.dock.tab = tabName;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
}

function hideSnapDock() {
  const overlay = windowManager.dock.overlay;
  if (!overlay) return;
  windowManager.dock.active = false;
  windowManager.dock.selectedZone = null;
  windowManager.dock.tab = null;
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.querySelectorAll('.wm-snap-zone').forEach((zone) => zone.classList.remove('is-active'));
}

function updateSnapDockPointer(clientX, clientY) {
  if (!windowManager.dock.active || !windowManager.dock.overlay) return;
  const hovered = document.elementFromPoint(clientX, clientY);
  const zoneEl = hovered && hovered.closest ? hovered.closest('.wm-snap-zone') : null;
  windowManager.dock.overlay.querySelectorAll('.wm-snap-zone').forEach((zone) => {
    zone.classList.toggle('is-active', zone === zoneEl);
  });
  windowManager.dock.selectedZone = zoneEl ? zoneEl.getAttribute('data-zone') : null;
}

function resolveEdgeSnap(clientX, clientY) {
  const stage = getStageRect();
  const x = clientX - stage.left;
  const y = clientY - stage.top;
  const threshold = 26;

  const left = x <= threshold;
  const right = x >= stage.width - threshold;
  const top = y <= threshold;
  const bottom = y >= stage.height - threshold;

  if (top && left) return 'top-left';
  if (top && right) return 'top-right';
  if (bottom && left) return 'bottom-left';
  if (bottom && right) return 'bottom-right';
  if (top) return 'maximize';
  if (left) return 'left';
  if (right) return 'right';
  if (bottom) return 'bottom';
  return null;
}

function startDrag(meta, event) {
  event.preventDefault();
  const startX = event.clientX;
  const startY = event.clientY;
  const rect = restoreWindowForDrag(meta, event);

  const move = (moveEvent) => {
    const stage = getStageRect();
    const relativeY = moveEvent.clientY - stage.top;
    if (relativeY <= 30) {
      showSnapDock(meta.tab);
    } else if (windowManager.dock.active && relativeY > 86) {
      hideSnapDock();
    }
    updateSnapDockPointer(moveEvent.clientX, moveEvent.clientY);

    setWindowRect(meta, {
      left: rect.left + (moveEvent.clientX - startX),
      top: rect.top + (moveEvent.clientY - startY),
      width: rect.width,
      height: rect.height
    });
  };
  const up = (upEvent) => {
    const selectedZone = windowManager.dock.selectedZone || resolveEdgeSnap(upEvent.clientX, upEvent.clientY);
    if (selectedZone) {
      snapWindow(meta.tab, selectedZone);
    }
    hideSnapDock();
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
  };

  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

function startResize(meta, direction, event) {
  if (meta.maximized) return;
  event.preventDefault();
  event.stopPropagation();

  const startX = event.clientX;
  const startY = event.clientY;
  const initial = {
    left: parseFloat(meta.el.style.left) || 0,
    top: parseFloat(meta.el.style.top) || 0,
    width: parseFloat(meta.el.style.width) || 900,
    height: parseFloat(meta.el.style.height) || 640
  };

  const move = (moveEvent) => {
    const dx = moveEvent.clientX - startX;
    const dy = moveEvent.clientY - startY;
    const next = { ...initial };

    if (direction.includes('e')) next.width = initial.width + dx;
    if (direction.includes('s')) next.height = initial.height + dy;
    if (direction.includes('w')) {
      next.width = initial.width - dx;
      next.left = initial.left + dx;
    }
    if (direction.includes('n')) {
      next.height = initial.height - dy;
      next.top = initial.top + dy;
    }

    setWindowRect(meta, next);
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
  };

  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

function popOutWindow(tabName) {
  const url = new URL(window.location.href);
  url.searchParams.set('popout', tabName);
  window.open(url.toString(), '_blank', 'popup=yes,width=1400,height=900,resizable=yes,scrollbars=yes');
}

function createWindowShell(tabName, tabElement) {
  const app = getWindowApp(tabName);
  const shell = document.createElement('section');
  shell.className = 'wm-window';
  shell.dataset.tab = tabName;
  shell.style.display = 'none';

  shell.innerHTML = `
    <header class="wm-titlebar">
      <div class="wm-title"><span class="wm-title-icon" data-accent="${app.accent || 'green'}">${app.icon}</span> ${app.label}</div>
      <div class="wm-controls">
        <button class="wm-btn" data-action="pin" title="Pin/Unpin to taskbar">★</button>
        <button class="wm-btn" data-action="snap-left" title="Snap left">◧</button>
        <button class="wm-btn" data-action="snap-right" title="Snap right">◨</button>
        <button class="wm-btn" data-action="popout" title="Pop out window">↗</button>
        <button class="wm-btn" data-action="maximize" title="Maximize">▢</button>
        <button class="wm-btn wm-btn-close" data-action="close" title="Close">✕</button>
      </div>
    </header>
    <div class="wm-content"></div>
  `;

  ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].forEach((direction) => {
    const handle = document.createElement('div');
    handle.className = 'wm-resize wm-resize-' + direction;
    handle.addEventListener('pointerdown', (event) => startResize(windowManager.windows.get(tabName), direction, event));
    shell.appendChild(handle);
  });

  const content = shell.querySelector('.wm-content');
  tabElement.classList.remove('on');
  tabElement.classList.add('wm-tab-pane');
  content.appendChild(tabElement);

  const meta = {
    tab: tabName,
    el: shell,
    open: false,
    maximized: false,
    restoreRect: null,
    snapState: null
  };
  windowManager.windows.set(tabName, meta);

  shell.addEventListener('pointerdown', () => focusWindow(tabName));
  shell.querySelector('.wm-titlebar').addEventListener('pointerdown', (event) => {
    if (event.target.closest('.wm-controls')) return;
    focusWindow(tabName);
    startDrag(meta, event);
  });

  shell.querySelector('.wm-controls').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.getAttribute('data-action');
    if (action === 'close') closeWindow(tabName);
    if (action === 'maximize') toggleMaximizeWindow(tabName);
    if (action === 'popout') popOutWindow(tabName);
    if (action === 'snap-left') snapWindow(tabName, 'left');
    if (action === 'snap-right') snapWindow(tabName, 'right');
    if (action === 'pin') togglePinnedApp(tabName);
  });

  windowManager.stage.appendChild(shell);
  setWindowRect(meta, { left: 24, top: 24, width: app.w, height: app.h });
}

function buildLauncherMenu() {
  const categoryHost = document.getElementById('osStartCategoryGrid');
  const appsHost = document.getElementById('osStartCategoryApps');
  const pinnedHost = document.getElementById('osStartPinnedGrid');
  if (!categoryHost || !appsHost) return;
  categoryHost.innerHTML = '';
  appsHost.innerHTML = '';

  const allApps = WINDOW_APPS
    .filter((app) => windowManager.windows.has(app.tab))
    .map((app) => ({
      ...app,
      launchTab: app.tab,
      category: APP_CATEGORY_BY_TAB[app.tab] || 'workspace',
      pinnable: true,
      description: ''
    }));
  const startApps = [...allApps, ...START_MENU_SPECIAL_APPS];

  const categoryGroups = new Map();
  startApps.forEach((app) => {
    const key = app.category || 'workspace';
    if (!categoryGroups.has(key)) categoryGroups.set(key, []);
    categoryGroups.get(key).push(app);
  });

  const availableCategories = START_MENU_CATEGORY_ORDER.filter((category) => (categoryGroups.get(category.id) || []).length > 0);
  if (!selectedStartCategoryId || !categoryGroups.has(selectedStartCategoryId)) {
    selectedStartCategoryId = availableCategories.length ? availableCategories[0].id : '';
  }

  if (pinnedHost) {
    pinnedHost.innerHTML = '';
    pinnedApps.forEach((tabName) => {
      const app = allApps.find((item) => item.tab === tabName);
      if (!app) return;
      const button = document.createElement('button');
      button.className = 'os-launcher-item os-start-pinned-app';
      button.setAttribute('data-tab', app.launchTab);
      button.innerHTML = '<span class="launcher-app-left"><span class="launcher-app-icon" data-accent="' + (app.accent || 'green') + '">' + app.icon + '</span><span class="launcher-app-label">' + app.label + '</span></span><span class="launcher-pin-btn">Pinned</span>';
      button.onclick = function() { switchMainTab(app.launchTab, button); };
      pinnedHost.appendChild(button);
    });
  }

  if (startCategoryViewMode === 'categories') {
    categoryHost.style.display = '';
    appsHost.style.display = '';
    availableCategories.forEach((category) => {
      const apps = categoryGroups.get(category.id) || [];
      const card = document.createElement('button');
      card.className = 'os-start-category-card';
      card.setAttribute('type', 'button');
      card.classList.toggle('on', category.id === selectedStartCategoryId);
      card.innerHTML = [
        '<span class="os-start-category-title">' + category.label + '</span>',
        '<span class="os-start-category-preview">',
        apps.slice(0, 4).map((app) => '<span class="os-start-category-app-icon" data-accent="' + (app.accent || 'green') + '" title="' + app.label + '">' + app.icon + '</span>').join(''),
        '</span>'
      ].join('');
      card.onclick = function(clickEvent) {
        clickEvent.stopPropagation();
        openStartCategoryApps(category.id);
      };
      categoryHost.appendChild(card);
    });
  } else {
    categoryHost.style.display = 'none';
    appsHost.style.display = '';
  }

  const makeAppButton = (app) => {
    const button = document.createElement('button');
    button.className = 'os-launcher-item os-start-app-item';
    if (app.launchTab) button.setAttribute('data-tab', app.launchTab);
    const desc = app.description ? '<span class="launcher-app-meta">' + app.description + '</span>' : '';
    button.innerHTML = '<span class="launcher-app-left"><span class="launcher-app-icon" data-accent="' + (app.accent || 'green') + '">' + app.icon + '</span><span class="launcher-app-label">' + app.label + '</span></span>' + desc;

    if (app.pinnable) {
      const pin = document.createElement('span');
      pin.className = 'launcher-pin-btn';
      pin.setAttribute('role', 'button');
      pin.setAttribute('tabindex', '0');
      pin.textContent = isPinnedApp(app.tab) ? 'Unpin' : 'Pin';
      pin.onclick = function(event) {
        event.stopPropagation();
        togglePinnedApp(app.tab);
      };
      pin.onkeydown = function(event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        togglePinnedApp(app.tab);
      };
      button.appendChild(pin);
    }

    if (app.action) {
      button.onclick = function() {
        const fn = window[app.action];
        if (typeof fn === 'function') fn();
        closeStartMenu();
      };
    } else {
      button.onclick = function() { switchMainTab(app.launchTab, button); };
    }
    return button;
  };

  const selectedCategory = START_MENU_CATEGORY_ORDER.find((category) => category.id === selectedStartCategoryId);
  const selectedApps = categoryGroups.get(selectedStartCategoryId) || [];

  if (startCategoryViewMode === 'apps') {
    const tools = document.createElement('div');
    tools.className = 'os-start-inline-actions';
    const back = document.createElement('button');
    back.className = 'btn bg text-xs-c';
    back.textContent = '← Back to Categories';
    back.onclick = function(clickEvent) {
      clickEvent.stopPropagation();
      showStartCategories();
    };
    tools.appendChild(back);

    const showAll = document.createElement('button');
    showAll.className = 'btn bg text-xs-c';
    showAll.textContent = 'Show All Apps';
    showAll.onclick = function(clickEvent) {
      clickEvent.stopPropagation();
      showAllStartApps();
    };
    tools.appendChild(showAll);

    appsHost.appendChild(tools);

    const heading = document.createElement('div');
    heading.className = 'os-start-section-title';
    heading.textContent = (selectedCategory ? selectedCategory.label : 'Apps') + ' Apps';
    appsHost.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'os-launcher-grid os-launcher-grid-categorized';
    selectedApps.forEach((app) => grid.appendChild(makeAppButton(app)));
    appsHost.appendChild(grid);
  } else if (startCategoryViewMode === 'all') {
    const tools = document.createElement('div');
    tools.className = 'os-start-inline-actions';
    const back = document.createElement('button');
    back.className = 'btn bg text-xs-c';
    back.textContent = '← Back to Categories';
    back.onclick = function(clickEvent) {
      clickEvent.stopPropagation();
      showStartCategories();
    };
    tools.appendChild(back);
    appsHost.appendChild(tools);

    const heading = document.createElement('div');
    heading.className = 'os-start-section-title';
    heading.textContent = 'All Apps';
    appsHost.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'os-launcher-grid os-launcher-grid-categorized';
    startApps.forEach((app) => grid.appendChild(makeAppButton(app)));
    appsHost.appendChild(grid);
  } else {
    const hint = document.createElement('div');
    hint.className = 'os-start-section-title';
    hint.textContent = 'Select a category to open apps';
    appsHost.appendChild(hint);

    const tools = document.createElement('div');
    tools.className = 'os-start-inline-actions';
    const showAll = document.createElement('button');
    showAll.className = 'btn bg text-xs-c';
    showAll.textContent = 'Show All Apps';
    showAll.onclick = function(clickEvent) {
      clickEvent.stopPropagation();
      showAllStartApps();
    };
    tools.appendChild(showAll);
    appsHost.appendChild(tools);
  }
}

function serializeWindow(meta) {
  return {
    open: meta.open,
    maximized: meta.maximized,
    left: parseFloat(meta.el.style.left) || 0,
    top: parseFloat(meta.el.style.top) || 0,
    width: parseFloat(meta.el.style.width) || 900,
    height: parseFloat(meta.el.style.height) || 640,
    z: parseInt(meta.el.style.zIndex || '1', 10)
  };
}

function saveWindowLayout() {
  const layout = {};
  windowManager.windows.forEach((meta, tabName) => {
    layout[tabName] = serializeWindow(meta);
  });
  try {
    localStorage.setItem(WINDOW_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    lg('ok', 'Window layout saved');
  } catch (err) {
    lg('warn', 'Could not save window layout: ' + err.message);
  }
}

function restoreWindowLayout() {
  let raw = null;
  try {
    raw = localStorage.getItem(WINDOW_LAYOUT_STORAGE_KEY);
  } catch (_) {
    raw = null;
  }
  if (!raw) return false;

  let layout = null;
  try {
    layout = JSON.parse(raw);
  } catch (_) {
    return false;
  }
  if (!layout || typeof layout !== 'object') return false;

  windowManager.windows.forEach((meta, tabName) => {
    const item = layout[tabName];
    if (!item) {
      closeWindow(tabName);
      return;
    }
    setWindowRect(meta, {
      left: Number(item.left) || 0,
      top: Number(item.top) || 0,
      width: Number(item.width) || 900,
      height: Number(item.height) || 640
    });
    meta.el.style.zIndex = String(Number(item.z) || 10);
    if (item.open) {
      openWindow(tabName, { center: false });
      toggleMaximizeWindow(tabName, !!item.maximized);
    } else {
      closeWindow(tabName);
    }
  });

  const topWindow = Array.from(windowManager.windows.values())
    .filter((meta) => meta.open)
    .sort((a, b) => (parseInt(b.el.style.zIndex || '1', 10) - parseInt(a.el.style.zIndex || '1', 10)))[0];
  if (topWindow) focusWindow(topWindow.tab);
  syncShellStatusWidgets();
  return true;
}

function resetWindowLayout() {
  try {
    localStorage.removeItem(WINDOW_LAYOUT_STORAGE_KEY);
  } catch (_) {
    // ignore
  }
  windowManager.windows.forEach((_, tabName) => closeWindow(tabName));
  switchMainTab('chat');
}

function initWindowManager() {
  if (windowManager.initialized) return;
  const stage = document.getElementById('windowStage');
  if (!stage) return;

  windowManager.stage = stage;
  windowManager.popoutTab = new URLSearchParams(window.location.search).get('popout');
  windowManager.dock.overlay = document.getElementById('wmSnapDock');

  stage.querySelectorAll('.tab-content').forEach((tabElement) => {
    const id = tabElement.id || '';
    const tabName = id.replace(/^tab-/, '');
    if (!tabName) return;
    createWindowShell(tabName, tabElement);
  });

  windowManager.initialized = true;

  if (windowManager.popoutTab && !windowManager.windows.has(windowManager.popoutTab)) {
    windowManager.popoutTab = null;
  }

  if (windowManager.popoutTab && windowManager.windows.has(windowManager.popoutTab)) {
    document.body.classList.add('popout-mode');
    windowManager.windows.forEach((_, tabName) => closeWindow(tabName));
    openWindow(windowManager.popoutTab, { maximize: true, center: false });
  }

  window.addEventListener('resize', () => {
    windowManager.windows.forEach((meta) => {
      if (meta.maximized) {
        toggleMaximizeWindow(meta.tab, true);
      } else {
        setWindowRect(meta, {
          left: parseFloat(meta.el.style.left) || 0,
          top: parseFloat(meta.el.style.top) || 0,
          width: parseFloat(meta.el.style.width) || 900,
          height: parseFloat(meta.el.style.height) || 640
        });
      }
    });
    updateTaskbarOverflow();
  });
}

// ── Browser app code moved to client/js/browser-app.js (NB-3) ──

function switchTab(name, el) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.auth-tab-content').forEach(t => t.classList.remove('on'));
  el.classList.add('on');
  document.getElementById('tab-' + name).classList.add('on');
}

function setStep(n) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById('s' + i);
    if (!el) continue;
    el.className = 'pip';
    if (i < n) el.classList.add('dn');
    if (i === n) el.classList.add('on');
  }
}

function setStatus(type, text) {
  const dot = document.getElementById('sDot');
  if (dot) {
    dot.className = 'dot';
    if (type) dot.classList.add(type);
  }
  const statusText = document.getElementById('sTxt');
  if (statusText) statusText.textContent = text;
}

function toggleAuth(forceOpen) {
  const body = document.getElementById('authBody');
  const tgl = document.getElementById('authTgl');
  if (forceOpen === true || !body.classList.contains('open')) {
    body.classList.add('open'); tgl.innerHTML = '&#9650; Hide';
  } else { body.classList.remove('open'); tgl.innerHTML = '&#9660; Show'; }
}

function toggleLog() {
  toggleSidebarLog();
}

function toggleSidebarLog() {
  const body = document.getElementById('sidebarLogBody');
  const arrow = document.getElementById('sidebarLogArrow');
  if (!body) return;
  body.classList.toggle('collapsed');
  if (arrow) arrow.textContent = body.classList.contains('collapsed') ? '▶' : '▼';
}

function autoOpenLog() {
  const body = document.getElementById('sidebarLogBody');
  const arrow = document.getElementById('sidebarLogArrow');
  if (body && body.classList.contains('collapsed')) {
    body.classList.remove('collapsed');
    if (arrow) arrow.textContent = '▼';
  }
}

// ============================================================
// SETUP ENFORCEMENT — Require API configuration before entity ops
// ============================================================
function isApiConfigured() {
  if (!activeConfig || !activeConfig.model || !activeConfig.endpoint) return false;
  // OpenRouter requires API key, Ollama does not
  if (activeConfig.type === 'openrouter') {
    return !!activeConfig.apiKey;
  }
  // Ollama only needs endpoint and model
  return true;
}

function showSetupRequired() {
  const modal = document.getElementById('setupRequiredModal');
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('open');
  }
}

function hideSetupRequired() {
  const modal = document.getElementById('setupRequiredModal');
  if (modal) {
    modal.classList.remove('open');
    setTimeout(() => modal.style.display = 'none', 200);
  }
}

function goToSetupTab(provider) {
  // Switch to Settings tab
  document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('on'));
  
  const settingsBtn = document.querySelector('.tab-btn:nth-child(3)');
  if (settingsBtn) {
    settingsBtn.classList.add('on');
  }
  document.getElementById('tab-settings').classList.add('on');
  
  // Switch to the requested provider tab
  setTimeout(() => {
    if (provider === 'openrouter') {
      const btn = document.querySelector('[onclick="showProviderTab(\'main\', this)"]');
      if (btn) btn.click();
      const tabBtn = document.querySelector('[onclick="switchTab(\'openrouter-main\', this)"]');
      if (tabBtn) tabBtn.click();
    } else if (provider === 'ollama') {
      const btn = document.querySelector('[onclick="showProviderTab(\'main\', this)"]');
      if (btn) btn.click();
      const tabBtn = document.querySelector('[onclick="switchTab(\'ollama-main\', this)"]');
      if (tabBtn) tabBtn.click();
    }
  }, 100);
  
  // Hide the setup modal
  hideSetupRequired();
}

function guardEntityOperation(operationName) {
  if (!isApiConfigured()) {
    lg('err', 'API not configured. Please set up OpenRouter or Ollama first.');
    showSetupRequired();
    return false;
  }
  return true;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
  initDesktopShell();
  initSettingsModelSuggestions();

  // Initialize thoughts-in-chat toggle visual state
  const thoughtsEl = document.getElementById('thoughtsToggle');
  if (thoughtsEl) thoughtsEl.classList.toggle('on', showThoughtsInChat);

  // Load saved config from server FIRST
  try {
    await loadSavedConfig();
    lg('ok', 'Saved configuration loaded');
    syncShellStatusWidgets();
  } catch (err) {
    lg('warn', 'Could not load saved config: ' + err.message);
  }
  
  // Give the page time to load all scripts, then start app
  setTimeout(() => {
    // Let _startApp decide whether setup is needed after all restore attempts.
    _startApp();
    startBrainPoll();
    initChatPhysical();
  }, 200);
});

function copyOut() {
  const v = document.getElementById('finalOut').value;
  if (!v) return;
  navigator.clipboard.writeText(v).then(() => lg('ok', 'Copied')).catch(() => { document.getElementById('finalOut').select(); document.execCommand('copy'); lg('ok', 'Copied'); });
}

function dlOut() {
  const v = document.getElementById('finalOut').value;
  if (!v) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([v], { type: 'text/plain' }));
  a.download = 'memory-archive-' + Date.now() + '.txt';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  lg('ok', 'Downloaded');
}

function resetAll() {
  if (busy || chatBusy) return;
  document.getElementById('rawInput').value = '';
  document.getElementById('finalOut').value = '';
  const logEl = document.getElementById('sidebarLogContent');
  if (logEl) logEl.innerHTML = '';
  document.getElementById('sSrc').textContent = '0';
  document.getElementById('sOut').textContent = '0';
  document.getElementById('sSav').innerHTML = '&mdash;';
  clearChat();
  setStep(0); setStatus('', 'Ready');
  lg('info', 'Reset');
}

async function shutdownServer() {
  if (!confirm('Stop the REM System server? You will lose access to this page.')) return;
  try {
    await fetch('/api/shutdown', { method: 'POST' });
  } catch (e) { /* connection will drop */ }

  // Try to self-close the dedicated app window after shutdown completes.
  setTimeout(() => {
    try {
      window.open('', '_self');
      window.close();
    } catch (_) {}
  }, 220);

  setTimeout(() => {
    if (!document.hidden) {
      document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#04060d;color:#a1a1aa;font-family:sans-serif;flex-direction:column;gap:1rem"><h1 style="color:#e4e4e7">Server Stopped</h1><p>WebUI close was requested. If this window is still open, you can close it now. Run <code style="color:#34d399">npm start</code> to restart.</p></div>';
    }
  }, 500);
}

// ============================================================
// SERVER COMMUNICATION HELPERS
// ============================================================
async function saveMemoryToServer(filename, content) {
  try {
    const resp = await fetch('/api/memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, content })
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(text || resp.status);
    }
    lg('ok', 'Saved memory to server: ' + filename);
  } catch (e) {
    lg('err', 'Failed to save memory to server: ' + e.message);
  }
}

async function saveSessionMetaToServer(metaText) {
  if (!metaText) return;
  try {
    const resp = await fetch('/api/session-meta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metaText })
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(text || resp.status);
    }
    lg('ok', 'Saved session meta to server');
  } catch (e) {
    lg('err', 'Failed to save session meta: ' + e.message);
  }
}

// ============================================================
// SYSTEM PROMPT LOADING
// ============================================================
async function loadSystemPrompt() {
  try {
    const resp = await fetch('/api/system-prompt');
    if (!resp.ok) {
      lg('warn', 'No system prompt found on server');
      return;
    }
    const data = await resp.json();
    if (!data.ok || !data.text) { lg('warn', 'System prompt empty'); return; }
    const text = data.text;
    if (activeConfig) {
      chatHistory.push({ role: 'system', content: text });
      lg('ok', 'Loaded system prompt into chat history');
    } else {
      pendingSystemPromptText = text;
      const el = addChatBubble('system', '\u{1F9E0} Core system prompt loaded from server. Press Enter (when a provider is connected) to send this prompt to the model.\n\n' + text);
      el.id = 'pendingSysPromptBubble';
      lg('info', 'System prompt loaded and pending until a provider connects');
    }
  } catch (e) {
    lg('warn', 'Failed to load system prompt: ' + e.message);
  }
}

function flushPendingSystemPrompt() {
  if (!pendingSystemPromptText) return;
  if (!activeConfig) return;
  chatHistory.push({ role: 'system', content: pendingSystemPromptText });
  pendingSystemPromptText = null;
  const el = document.getElementById('pendingSysPromptBubble'); if (el) el.remove();
  lg('ok', 'System prompt sent to LLM');
}

// ============================================================
// CONFIG PERSISTENCE (via server.js /api/config)
// ============================================================
async function loadSavedConfig() {
  try {
    const resp = await fetch(CONFIG_API);
    if (!resp.ok) throw new Error('Server not reachable');
    const data = await resp.json();
    if (data && data.profiles) {
      savedConfig = data;
      lg('info', 'Config loaded from server (' + Object.keys(data.profiles).length + ' profile(s))');
      renderProfileChips();
      
      // Do NOT auto-connect from last active profile. Require user to select a model/profile.
      // Optionally, highlight the last active profile for user convenience.
      if (data.lastActive && data.profiles[data.lastActive]) {
        lg('info', 'Last active profile available: ' + data.lastActive + ' (user must select to connect)');
      }
    }
  } catch (e) {
    lg('warn', 'Config not loaded (ensure server is running): ' + e.message);
  }
}

function getMainConfigFromProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;

  // Preferred multi-aspect profile format.
  if (profile.main && typeof profile.main === 'object') {
    const m = profile.main;
    const mType = String(m.type || '').toLowerCase();
    if (mType === 'openrouter') {
      const endpoint = m.endpoint || OPENROUTER_PRESET.ep;
      const apiKey = m.apiKey || m.key || '';
      const model = m.model || OPENROUTER_PRESET.def;
      if (endpoint && apiKey && model) {
        return { type: 'openrouter', endpoint, apiKey, model };
      }
    }
    if (mType === 'ollama') {
      const endpoint = m.endpoint || m.ollamaUrl || 'http://localhost:11434';
      const model = m.model || m.ollamaModel || 'llama3';
      if (endpoint && model) {
        return { type: 'ollama', endpoint, model };
      }
    }
  }

  // Legacy single-provider profile format.
  const aType = String(profile._activeType || '').toLowerCase();
  if ((aType === 'apikey' || aType === 'openrouter') && profile.apikey) {
    const endpoint = profile.apikey.endpoint || OPENROUTER_PRESET.ep;
    const apiKey = profile.apikey.key || profile.apikey.apiKey || '';
    const model = profile.apikey.model || OPENROUTER_PRESET.def;
    if (endpoint && apiKey && model) {
      return { type: 'openrouter', endpoint, apiKey, model };
    }
  }
  if (aType === 'ollama' && profile.ollama) {
    const endpoint = profile.ollama.url || profile.ollama.endpoint || 'http://localhost:11434';
    const model = profile.ollama.model || 'llama3';
    if (endpoint && model) {
      return { type: 'ollama', endpoint, model };
    }
  }

  return null;
}

function hydrateMainProviderInputs(config) {
  if (!config) return;

  const endpointEl = document.getElementById('apikeyEndpoint-main');
  const keyEl = document.getElementById('apikeyKey-main');
  const modelEl = document.getElementById('apikeyModel-main');
  const ollamaUrlEl = document.getElementById('ollamaUrl-main');
  const ollamaModelEl = document.getElementById('ollamaModel-main');

  if (config.type === 'openrouter') {
    if (endpointEl) endpointEl.value = config.endpoint || OPENROUTER_PRESET.ep;
    if (keyEl) keyEl.value = config.apiKey || '';
    if (modelEl) modelEl.value = config.model || OPENROUTER_PRESET.def;
  } else if (config.type === 'ollama') {
    if (ollamaUrlEl) ollamaUrlEl.value = config.endpoint || 'http://localhost:11434';
    if (ollamaModelEl) ollamaModelEl.value = config.model || 'llama3';
  }

  // Pre-fill sub/dream/orchestrator endpoint + key from main so user only needs to pick a model
  if (config.type === 'openrouter' && config.endpoint && config.apiKey) {
    inheritMainConfigToAspect('subconscious');
    inheritMainConfigToAspect('dreams');
    inheritMainConfigToAspect('orchestrator');
  }
}

async function persistConfig() {
  try {
    lg('info', 'Saving config (' + Object.keys(savedConfig.profiles || {}).length + ' profile(s))...');
    const resp = await fetch(CONFIG_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(savedConfig)
    });
    if (!resp.ok) throw new Error('Server returned ' + resp.status);
    lg('ok', 'Config saved successfully (lastActive: ' + savedConfig.lastActive + ')');
    return true;
  } catch (e) {
    lg('err', 'Could not save config: ' + e.message);
    return false;
  }
}

function gatherProfile() {
  const profile = {};
  const olUrl = document.getElementById('ollamaUrl-main')?.value?.trim();
  if (olUrl) profile.ollama = { url: olUrl, model: document.getElementById('ollamaModel-main')?.value || 'llama3' };
  const akEp = document.getElementById('apikeyEndpoint-main')?.value?.trim();
  const akKey = document.getElementById('apikeyKey-main')?.value?.trim();
  const akMd = document.getElementById('apikeyModel-main')?.value;
  if (akEp) profile.apikey = { endpoint: akEp, key: akKey, model: akMd };
  return profile;
}

async function autoSaveConfig() {
  // Reload from server first so we never overwrite aspect configs saved via /api/entity-config
  try {
    const freshResp = await fetch(CONFIG_API);
    if (freshResp.ok) {
      const freshData = await freshResp.json();
      if (freshData && freshData.profiles) savedConfig = freshData;
    }
  } catch (_) { /* proceed with local copy if server unreachable */ }

  const profile = gatherProfile();
  let name = savedConfig.lastActive || 'default-multi-llm';
  const existing = savedConfig.profiles[name] || {};

  // Merge gathered main fields into the existing profile
  if (profile.ollama) existing.ollama = profile.ollama;
  if (profile.apikey)  existing.apikey  = profile.apikey;
  existing._activeType = activeConfig?.type || existing._activeType || null;

  // Update the main aspect config from activeConfig (keeps sub/dream/orchestrator intact)
  if (activeConfig) {
    existing.main = {
      type: activeConfig.type,
      endpoint: activeConfig.endpoint || activeConfig.url || '',
      ...(activeConfig.apiKey ? { apiKey: activeConfig.apiKey } : {}),
      model: activeConfig.model || ''
    };
    if (!existing._activeTypes || typeof existing._activeTypes !== 'object') existing._activeTypes = {};
    existing._activeTypes.main = activeConfig.type;
  }

  savedConfig.profiles[name] = existing;
  savedConfig.lastActive = name;
  const ok = await persistConfig();
  if (ok) {
    const el = document.getElementById('saveStatus');
    el.textContent = '\u2713 Auto-saved';
    el.style.color = 'var(--em)';
    setTimeout(() => { el.textContent = ''; }, 2500);
    renderProfileChips();
    lg('ok', 'Auto-saved config: ' + name);
    if (isApiConfigured()) {
      hideSetupRequired();
    }
  }
}

/** Reload savedConfig from server so client stays in sync after /api/entity-config writes */
async function refreshSavedConfig() {
  try {
    const resp = await fetch(CONFIG_API);
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.profiles) {
        savedConfig = data;
        renderProfileChips();
        initSimpleProviderUI();
      }
    }
  } catch (_) {}
}

function saveCurrentProfile() {
  const profile = gatherProfile();
  let name = savedConfig.lastActive || 'default';
  const inputName = prompt('Save profile as:', name);
  if (!inputName) return;
  name = inputName.trim();
  profile._activeType = activeConfig?.type || null;
  savedConfig.profiles[name] = profile;
  savedConfig.lastActive = name;
  persistConfig().then(ok => {
    if (ok) {
      const el = document.getElementById('saveStatus');
      el.textContent = 'Saved!';
      el.style.color = 'var(--em)';
      setTimeout(() => { el.textContent = ''; }, 2000);
      renderProfileChips();
      lg('ok', 'Profile saved: ' + name);
    }
  });
}

function loadProfile(name) {
  const p = savedConfig.profiles[name];
  if (!p) return;

  // Load Ollama fields if present
  if (p.ollama) {
    const urlEl = document.getElementById('ollamaUrl-main');
    const modelEl = document.getElementById('ollamaModel-main');
    if (urlEl) urlEl.value = p.ollama.url || 'http://localhost:11434';
    if (modelEl) modelEl.value = p.ollama.model || 'llama3';
  }

  // Load OpenRouter/API key fields if present
  if (p.apikey) {
    const epEl = document.getElementById('apikeyEndpoint-main');
    const keyEl = document.getElementById('apikeyKey-main');
    const modelEl = document.getElementById('apikeyModel-main');
    if (epEl) epEl.value = p.apikey.endpoint || '';
    if (keyEl) keyEl.value = p.apikey.key || '';
    if (modelEl) modelEl.value = p.apikey.model || '';
  }

  // Auto-connect based on saved active type
  const aType = p._activeType;
  if ((aType === 'apikey' || aType === 'openrouter') && p.apikey && p.apikey.endpoint && p.apikey.key) {
    activeConfig = { type: 'openrouter', endpoint: p.apikey.endpoint, apiKey: p.apikey.key, model: p.apikey.model };
    updateProviderUI('openrouter', true, 'OpenRouter (' + p.apikey.model + ')');
    lg('ok', 'Auto-connected: ' + p.apikey.model);
    hideSetupRequired();
  } else if (aType === 'ollama' && p.ollama) {
    activeConfig = { type: 'ollama', endpoint: p.ollama.url, model: p.ollama.model };
    updateProviderUI('ollama', true, 'Ollama (' + p.ollama.model + ')');
    hideSetupRequired();
  }

  savedConfig.lastActive = name;
  persistConfig();
  renderProfileChips();
  lg('info', 'Loaded profile: ' + name);
}

function deleteProfile(name, ev) {
  ev.stopPropagation();
  if (!confirm('Delete profile "' + name + '"?')) return;
  delete savedConfig.profiles[name];
  if (savedConfig.lastActive === name) savedConfig.lastActive = null;
  persistConfig().then(() => {
    renderProfileChips();
    lg('info', 'Deleted profile: ' + name);
  });
}

function renderProfileChips() {
  const container = document.getElementById('profileChips');
  if (!container) return;
  const names = Object.keys(savedConfig.profiles || {});
  if (names.length === 0) {
    container.innerHTML = '<span style="font-size:.6rem;color:var(--td)">No saved profiles</span>';
    return;
  }
  container.innerHTML = '';
  names.forEach(name => {
    const chip = document.createElement('button');
    chip.className = 'profile-chip' + (name === savedConfig.lastActive ? ' active' : '');
    const p = savedConfig.profiles[name];
    let icon = '\u{1F511}';
    if (p._activeType === 'ollama') icon = '\u{1F7E0}';
    else if (p._activeType === 'openrouter' || p._activeType === 'apikey') icon = '\u{1F310}';
    chip.innerHTML = icon + ' ' + name + '<span class="del" onclick="deleteProfile(\'' + name.replace(/'/g, "\\'") + '\', event)">&times;</span>';
    chip.onclick = () => loadProfile(name);
    container.appendChild(chip);
  });
  syncNavSidebarProfiles();
}

// ============================================================
// SETUP WIZARD — Initial onboarding uses Main only.
// ============================================================

const SETUP_STEPS = {
  MAIN: 1,
  READY: 2
};

const LLM_ROLES = {
  main: 'Main Mind (Conscious)',
  subconscious: 'Subconscious',
  dream: 'Dream Engine'
};

// Curated OpenRouter recommendations per cognitive role.
// Users can always type/paste any custom model ID in the same input field.
const OPENROUTER_ROLE_MODELS = {
  main: {
    def: 'openai/gpt-4o',
    models: [
      { id: 'openai/gpt-4o', l: 'OpenAI GPT-4o (balanced main chat)' },
      { id: 'anthropic/claude-sonnet-4', l: 'Claude Sonnet 4 (strong reasoning)' },
      { id: 'google/gemini-2.5-pro', l: 'Gemini 2.5 Pro (deep thinking)' },
      { id: 'google/gemini-2.5-flash', l: 'Gemini 2.5 Flash (fast/cheap)' },
      { id: 'deepseek/deepseek-chat-v3-0324', l: 'DeepSeek V3 (cost-effective)' }
    ]
  },
  subconscious: {
    def: 'google/gemini-2.5-flash',
    models: [
      { id: 'google/gemini-2.5-flash', l: 'Gemini 2.5 Flash (memory/background tasks)' },
      { id: 'deepseek/deepseek-chat-v3-0324', l: 'DeepSeek V3 (long context value)' },
      { id: 'anthropic/claude-sonnet-4', l: 'Claude Sonnet 4 (reflection quality)' },
      { id: 'meta-llama/llama-3.3-70b-instruct', l: 'Llama 3.3 70B (self-host friendly alt)' },
      { id: 'openai/gpt-4o-mini', l: 'OpenAI GPT-4o Mini (low-cost throughput)' }
    ]
  },
  dream: {
    def: 'anthropic/claude-sonnet-4',
    models: [
      { id: 'anthropic/claude-sonnet-4', l: 'Claude Sonnet 4 (creative synthesis)' },
      { id: 'openai/gpt-4o', l: 'OpenAI GPT-4o (imaginative + coherent)' },
      { id: 'google/gemini-2.5-pro', l: 'Gemini 2.5 Pro (narrative planning)' },
      { id: 'meta-llama/llama-3.3-70b-instruct', l: 'Llama 3.3 70B (dream simulation alt)' },
      { id: 'deepseek/deepseek-chat-v3-0324', l: 'DeepSeek V3 (economical dream cycles)' }
    ]
  },
  orchestrator: {
    def: 'openai/gpt-4o',
    models: [
      { id: 'openai/gpt-4o', l: 'OpenAI GPT-4o (balanced synthesis)' },
      { id: 'anthropic/claude-sonnet-4', l: 'Claude Sonnet 4 (strong persona modulation)' },
      { id: 'google/gemini-2.5-pro', l: 'Gemini 2.5 Pro (deep integration)' },
      { id: 'google/gemini-2.5-flash', l: 'Gemini 2.5 Flash (fast/cheap orchestration)' },
      { id: 'deepseek/deepseek-chat-v3-0324', l: 'DeepSeek V3 (cost-effective)' }
    ]
  }
};

function getOpenRouterRolePreset(aspect) {
  return OPENROUTER_ROLE_MODELS[aspect] || OPENROUTER_ROLE_MODELS.main;
}

let currentRecommendedSetupTab = 'best';
let currentRecommendedPresetProvider = 'openrouter';

const RECOMMENDED_MODEL_STACKS = {
  best: {
    main: 'anthropic/claude-sonnet-4.6',
    subconscious: 'moonshotai/kimi-k2.5',
    dream: 'anthropic/claude-sonnet-4.6',
    orchestrator: 'anthropic/claude-sonnet-4.6'
  },
  fast: {
    main: 'inception/mercury-2',
    subconscious: 'inception/mercury-2',
    dream: 'google/gemini-3.1-flash-lite-preview',
    orchestrator: 'inception/mercury-2'
  },
  cheap: {
    main: 'arcee-ai/trinity-large-preview:free',
    subconscious: 'stepfun/step-3.5-flash:free',
    dream: 'arcee-ai/trinity-large-preview:free',
    orchestrator: 'arcee-ai/trinity-large-preview:free'
  },
  hybrid: {
    main: 'deepseek/deepseek-v3.2',
    subconscious: 'inception/mercury-2',
    dream: 'google/gemini-3-flash-preview',
    orchestrator: 'deepseek/deepseek-v3.2'
  }
};

const OLLAMA_RECOMMENDED_STACKS = {
  best: {
    main: 'qwen2.5:7b',
    subconscious: 'qwen2.5:3b',
    dream: 'Qwen:latest',
    orchestrator: 'qwen2.5:7b'
  },
  fast: {
    main: 'llama3.2:3b',
    subconscious: 'qwen2.5:1.5b',
    dream: 'Qwen:latest',
    orchestrator: 'llama3.2:3b'
  },
  cheap: {
    main: 'Qwen:latest',
    subconscious: 'gemma3:1b',
    dream: 'Qwen:latest',
    orchestrator: 'Qwen:latest'
  },
  hybrid: {
    main: 'Qwen:latest',
    subconscious: 'qwen2.5:3b',
    dream: 'qwen2.5:3b',
    orchestrator: 'Qwen:latest'
  }
};

const RECOMMENDED_PANEL_COPY = {
  openrouter: {
    best: 'Best quality and strongest persona fidelity. Uses Claude Sonnet 4.6 for personality-facing phases.',
    fast: 'Lowest latency stack. Uses Mercury 2 as core for high-throughput phases.',
    cheap: 'Cost floor stack. Uses free-tier Trinity + Step 3.5 Flash.',
    hybrid: 'Balanced quality, speed, and cost using DeepSeek + Mercury + Gemini.',
    custom: 'Set each aspect manually below and save each panel as needed.'
  },
  ollama: {
    best: 'Best local quality stack without 8B: qwen2.5:7b core with lighter support models.',
    fast: 'Lowest local latency stack using lightweight 3B/1.5B workers and a fast dream model.',
    cheap: 'Lowest local footprint stack for stability under load on 8GB VRAM.',
    hybrid: 'Recommended balanced local stack without 8B for chat quality, latency, and parallel-stage stability.',
    custom: 'Set each Ollama aspect manually below, then connect/save each panel as needed.'
  }
};

function refreshRecommendedPanelCopy() {
  const copy = RECOMMENDED_PANEL_COPY[currentRecommendedPresetProvider] || RECOMMENDED_PANEL_COPY.openrouter;
  ['best', 'fast', 'cheap', 'hybrid', 'custom'].forEach(name => {
    const el = document.getElementById('recommendedPanelText-' + name);
    if (el && copy[name]) el.textContent = copy[name];
  });
  const hint = document.getElementById('recommendedProviderHint');
  if (hint) {
    hint.textContent = currentRecommendedPresetProvider === 'ollama'
      ? 'Applying Ollama stacks'
      : 'Applying OpenRouter stacks';
  }
}

function showRecommendedPresetProvider(provider, el) {
  currentRecommendedPresetProvider = (provider === 'ollama') ? 'ollama' : 'openrouter';
  const orBtn = document.getElementById('recommendedProvider-openrouter');
  const olBtn = document.getElementById('recommendedProvider-ollama');
  if (orBtn) orBtn.classList.toggle('on', currentRecommendedPresetProvider === 'openrouter');
  if (olBtn) olBtn.classList.toggle('on', currentRecommendedPresetProvider === 'ollama');
  if (el && !el.classList.contains('on')) el.classList.add('on');
  refreshRecommendedPanelCopy();
  const statusEl = document.getElementById('recommendedPresetStatus');
  if (statusEl) statusEl.textContent = '';
}

function showRecommendedSetupTab(tabName, el) {
  currentRecommendedSetupTab = tabName;
  ['best', 'fast', 'cheap', 'hybrid', 'custom'].forEach(name => {
    const btn = document.getElementById('recommendedTab-' + name);
    const panel = document.getElementById('recommendedPanel-' + name);
    if (btn) btn.classList.toggle('on', name === tabName);
    if (panel) panel.classList.toggle('on', name === tabName);
  });
  refreshRecommendedPanelCopy();
  const statusEl = document.getElementById('recommendedPresetStatus');
  if (statusEl) statusEl.textContent = '';
  if (el && !el.classList.contains('on')) el.classList.add('on');
}

function applyRecommendedPresetInputs(stackKey, provider = 'openrouter') {
  const stack = provider === 'ollama'
    ? OLLAMA_RECOMMENDED_STACKS[stackKey]
    : RECOMMENDED_MODEL_STACKS[stackKey];
  if (!stack) return false;

  if (provider === 'ollama') {
    const endpoint = 'http://localhost:11434';
    const mainUrl = document.getElementById('ollamaUrl-main');
    const subUrl = document.getElementById('ollamaUrl-subconscious');
    const dreamUrl = document.getElementById('ollamaUrl-dreams');
    const orchUrl = document.getElementById('ollamaUrl-orchestrator');
    if (mainUrl) mainUrl.value = endpoint;
    if (subUrl) subUrl.value = endpoint;
    if (dreamUrl) dreamUrl.value = endpoint;
    if (orchUrl) orchUrl.value = endpoint;

    const mainModel = document.getElementById('ollamaModel-main');
    const subModel = document.getElementById('ollamaModel-subconscious');
    const dreamModel = document.getElementById('ollamaModel-dreams');
    const orchModel = document.getElementById('ollamaModel-orchestrator');
    if (mainModel) mainModel.value = stack.main;
    if (subModel) subModel.value = stack.subconscious;
    if (dreamModel) dreamModel.value = stack.dream;
    if (orchModel) orchModel.value = stack.orchestrator;
    return true;
  }

  const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
  const mainEndpoint = document.getElementById('apikeyEndpoint-main');
  if (mainEndpoint) mainEndpoint.value = endpoint;

  const subEndpoint = document.getElementById('subApiEndpoint');
  const dreamEndpoint = document.getElementById('dreamApiEndpoint');
  const orchEndpoint = document.getElementById('orchApiEndpoint');
  if (subEndpoint) subEndpoint.value = endpoint;
  if (dreamEndpoint) dreamEndpoint.value = endpoint;
  if (orchEndpoint) orchEndpoint.value = endpoint;

  const mainModel = document.getElementById('apikeyModel-main');
  const subModel = document.getElementById('subModel');
  const dreamModel = document.getElementById('dreamModel');
  const orchModel = document.getElementById('orchModel');
  if (mainModel) mainModel.value = stack.main;
  if (subModel) subModel.value = stack.subconscious;
  if (dreamModel) dreamModel.value = stack.dream;
  if (orchModel) orchModel.value = stack.orchestrator;
  return true;
}

async function applyRecommendedSetupTab() {
  const statusEl = document.getElementById('recommendedPresetStatus');
  if (currentRecommendedSetupTab === 'custom') {
    if (statusEl) statusEl.textContent = 'Custom mode selected. Edit fields below, then save each panel.';
    return;
  }

  const provider = currentRecommendedPresetProvider;
  const ok = applyRecommendedPresetInputs(currentRecommendedSetupTab, provider);
  if (!ok) {
    if (statusEl) statusEl.textContent = 'Preset not found.';
    return;
  }

  if (provider === 'ollama') {
    try {
      await ollamaConnect('main');
      await ollamaConnect('subconscious');
      await ollamaConnect('dreams');
      await ollamaConnect('orchestrator');
      await refreshSavedConfig();
      if (statusEl) statusEl.textContent = 'Ollama preset applied and saved to global profile.';
      lg('ok', 'Applied ' + currentRecommendedSetupTab + ' Ollama preset to global settings');
    } catch (e) {
      if (statusEl) statusEl.textContent = 'Failed to save Ollama preset globally.';
      lg('err', 'Ollama preset save failed: ' + e.message);
    }
    return;
  }

  const key = (document.getElementById('apikeyKey-main')?.value || '').trim();
  if (!key) {
    if (statusEl) statusEl.textContent = 'Preset applied to fields. Add OpenRouter key, then click Apply again to save globally.';
    lg('warn', 'Preset filled, but API key is missing. Add key to save global settings.');
    return;
  }

  try {
    await saveMainProviderConfig();
    await saveSubconsciousConfig();
    await saveDreamConfig();
    await saveOrchestratorConfig();
    if (statusEl) statusEl.textContent = 'Preset applied and saved to global profile.';
    lg('ok', 'Applied ' + currentRecommendedSetupTab + ' preset to global settings');
  } catch (e) {
    if (statusEl) statusEl.textContent = 'Failed to save preset globally.';
    lg('err', 'Preset save failed: ' + e.message);
  }
}

function applySettingsOpenRouterSuggestions(panel = 'main') {
  const aspect = panel === 'subconscious' ? 'subconscious' : (panel === 'dreams' ? 'dream' : (panel === 'orchestrator' ? 'orchestrator' : 'main'));
  const preset = getOpenRouterRolePreset(aspect);
  const modelId = panel === 'main' ? 'apikeyModel-main' : (panel === 'subconscious' ? 'subModel' : (panel === 'orchestrator' ? 'orchModel' : 'dreamModel'));
  const listId = panel === 'main' ? 'openrouterModelList-main' : (panel === 'subconscious' ? 'openrouterModelList-sub' : (panel === 'orchestrator' ? 'openrouterModelList-orch' : 'openrouterModelList-dream'));
  const modelInput = document.getElementById(modelId);
  const modelList = document.getElementById(listId);
  if (!modelInput) return;

  if (modelList) {
    modelList.innerHTML = '';
    preset.models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      if (m.l) opt.label = m.l;
      modelList.appendChild(opt);
    });
  }

  modelInput.placeholder = preset.def + ' (or paste any OpenRouter model id)';
  if (!modelInput.value || !modelInput.value.trim()) {
    modelInput.value = preset.def;
  }
}

function initSettingsModelSuggestions() {
  applySettingsOpenRouterSuggestions('main');
  applySettingsOpenRouterSuggestions('subconscious');
  applySettingsOpenRouterSuggestions('dreams');
  applySettingsOpenRouterSuggestions('orchestrator');
  refreshRecommendedPanelCopy();
  initSimpleProviderUI();
}

// ============================================================
// SIMPLIFIED PROVIDER UI
// ============================================================

let simpleActiveProvider = 'openrouter';

function initSimpleProviderUI() {
  // Populate OpenRouter model suggestions in the simple UI datalist
  const list = document.getElementById('simpleOrModelList');
  if (list) {
    list.innerHTML = '';
    const allModels = new Map();
    for (const role of Object.values(OPENROUTER_ROLE_MODELS)) {
      for (const m of role.models) allModels.set(m.id, m.l);
    }
    for (const [id, label] of allModels) {
      const opt = document.createElement('option');
      opt.value = id;
      if (label) opt.label = label;
      list.appendChild(opt);
    }
  }

  // Hydrate fields from saved config
  try {
    const profile = savedConfig?.profiles?.[savedConfig.lastActive];
    if (profile) {
      const mainCfg = profile.main;
      if (mainCfg) {
        if (mainCfg.type === 'ollama') {
          simplePickProvider('ollama');
          const urlEl = document.getElementById('simpleOllamaUrl');
          if (urlEl && mainCfg.endpoint) urlEl.value = mainCfg.endpoint;
          simpleFetchOllamaModels().then(() => {
            const sel = document.getElementById('simpleOllamaModel');
            if (sel && mainCfg.model) sel.value = mainCfg.model;
          });
        } else {
          simplePickProvider('openrouter');
          const keyEl = document.getElementById('simpleOrKey');
          const modelEl = document.getElementById('simpleOrModel');
          if (keyEl && mainCfg.apiKey) keyEl.value = mainCfg.apiKey;
          if (modelEl && mainCfg.model) modelEl.value = mainCfg.model;
        }
      }
      // Hydrate advanced overrides
      if (profile.subconscious?.model) {
        const el = document.getElementById('simpleAdvSub');
        if (el) el.value = profile.subconscious.model;
      }
      if (profile.dream?.model) {
        const el = document.getElementById('simpleAdvDream');
        if (el) el.value = profile.dream.model;
      }
      if (profile.orchestrator?.model) {
        const el = document.getElementById('simpleAdvOrch');
        if (el) el.value = profile.orchestrator.model;
      }
    }
  } catch (_) {}
}

function simplePickProvider(provider) {
  simpleActiveProvider = provider;
  const orBtn = document.getElementById('simpleProviderBtn-openrouter');
  const olBtn = document.getElementById('simpleProviderBtn-ollama');
  const orPanel = document.getElementById('simplePanel-openrouter');
  const olPanel = document.getElementById('simplePanel-ollama');
  if (orBtn) orBtn.classList.toggle('on', provider === 'openrouter');
  if (olBtn) olBtn.classList.toggle('on', provider === 'ollama');
  if (orPanel) orPanel.style.display = provider === 'openrouter' ? '' : 'none';
  if (olPanel) olPanel.style.display = provider === 'ollama' ? '' : 'none';
}

function simpleApplyPreset(stackKey) {
  const stack = RECOMMENDED_MODEL_STACKS[stackKey];
  if (!stack) return;
  const modelEl = document.getElementById('simpleOrModel');
  if (modelEl) modelEl.value = stack.main;
  // Fill advanced overrides with per-stage models
  const subEl = document.getElementById('simpleAdvSub');
  const dreamEl = document.getElementById('simpleAdvDream');
  const orchEl = document.getElementById('simpleAdvOrch');
  if (subEl) subEl.value = stack.subconscious !== stack.main ? stack.subconscious : '';
  if (dreamEl) dreamEl.value = stack.dream !== stack.main ? stack.dream : '';
  if (orchEl) orchEl.value = stack.orchestrator !== stack.main ? stack.orchestrator : '';
  // Highlight active preset
  ['best', 'fast', 'cheap', 'hybrid'].forEach(k => {
    const btn = document.getElementById('simplePresetBtn-' + k);
    if (btn) btn.classList.toggle('on', k === stackKey);
  });
  // Auto-open advanced if overrides differ
  if (subEl?.value || dreamEl?.value || orchEl?.value) {
    const details = document.getElementById('simpleAdvancedToggle');
    if (details) details.open = true;
  }
}

async function simpleFetchOllamaModels() {
  const urlEl = document.getElementById('simpleOllamaUrl');
  const selEl = document.getElementById('simpleOllamaModel');
  const statusEl = document.getElementById('simpleOllamaFetchStatus');
  const url = (urlEl?.value || 'http://localhost:11434').trim();
  if (statusEl) { statusEl.textContent = 'Connecting...'; statusEl.style.color = 'var(--wn)'; }
  try {
    const resp = await fetch(url + '/api/tags');
    if (!resp.ok) throw new Error('Cannot reach Ollama at ' + url);
    const data = await resp.json();
    const models = (data.models || []).map(m => m.name);
    if (selEl) {
      selEl.innerHTML = '';
      if (models.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No models found — pull one with `ollama pull`';
        selEl.appendChild(opt);
      } else {
        models.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m;
          opt.textContent = m;
          selEl.appendChild(opt);
        });
      }
    }
    if (statusEl) { statusEl.textContent = models.length + ' model(s) found'; statusEl.style.color = 'var(--em)'; }
  } catch (e) {
    if (statusEl) { statusEl.textContent = 'Failed: ' + e.message; statusEl.style.color = 'var(--dn)'; }
  }
}

async function simpleSaveConfig() {
  const isOllama = simpleActiveProvider === 'ollama';
  let mainModel, mainEndpoint, mainKey, mainType;

  if (isOllama) {
    mainType = 'ollama';
    mainEndpoint = (document.getElementById('simpleOllamaUrl')?.value || 'http://localhost:11434').trim();
    mainModel = (document.getElementById('simpleOllamaModel')?.value || '').trim();
    mainKey = '';
    if (!mainModel) {
      simpleShowStatus('ollamaStatus', 'Pick a model first', 'var(--dn)');
      return;
    }
  } else {
    mainType = 'openrouter';
    mainEndpoint = OPENROUTER_PRESET.ep;
    mainKey = (document.getElementById('simpleOrKey')?.value || '').trim();
    mainModel = (document.getElementById('simpleOrModel')?.value || '').trim();
    if (!mainKey) {
      simpleShowStatus('orStatus', 'API key is required', 'var(--dn)');
      return;
    }
    if (!mainModel) {
      simpleShowStatus('orStatus', 'Pick or paste a model', 'var(--dn)');
      return;
    }
  }

  const statusKey = isOllama ? 'ollamaStatus' : 'orStatus';
  simpleShowStatus(statusKey, 'Saving...', 'var(--wn)');

  try {
    const cfg = isOllama
      ? { type: 'ollama', endpoint: mainEndpoint, model: mainModel }
      : { type: 'openrouter', endpoint: mainEndpoint, key: mainKey, model: mainModel };
    const resp = await fetch('/api/entity-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'main', config: cfg })
    });
    if (!resp.ok) throw new Error('Failed to save main provider');

    // Update local active config
    activeConfig = {
      type: mainType,
      endpoint: mainEndpoint,
      ...(mainKey ? { apiKey: mainKey } : {}),
      model: mainModel
    };

    // Sync savedConfig from server
    await refreshSavedConfig();

    // Update provider UI
    const label = (isOllama ? 'Ollama' : 'OpenRouter') + ' (' + mainModel.split('/').pop() + ')';
    updateProviderUI(mainType, true, label);

    simpleShowStatus(statusKey, '✓ Connected — ' + mainModel, 'var(--em)');
    lg('ok', 'Main provider saved: ' + mainType + ' / ' + mainModel + ' (other roles inherit until customized)');

    if (isApiConfigured()) hideSetupRequired();
  } catch (e) {
    simpleShowStatus(statusKey, 'Error: ' + e.message, 'var(--dn)');
    lg('err', 'Config save failed: ' + e.message);
  }
}

function simpleShowStatus(suffix, text, color) {
  const el = document.getElementById('simple' + suffix.charAt(0).toUpperCase() + suffix.slice(1));
  if (el) {
    el.textContent = text;
    el.style.color = color || '';
  }
}

// Store configs for onboarding.
let setupAspectConfigs = {
  main: null
};

function applyOpenRouterModelSuggestions(fieldId, aspect = 'main') {
  const field = document.getElementById(fieldId);
  if (!field) return;
  const rolePreset = OPENROUTER_ROLE_MODELS[aspect] || OPENROUTER_ROLE_MODELS.main;
  const models = rolePreset.models || OPENROUTER_PRESET.models;
  const defaultModel = rolePreset.def || OPENROUTER_PRESET.def;

  // Support legacy <select> and new <input list=...> fields.
  if (field.tagName === 'SELECT') {
    field.innerHTML = '';
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.l;
      field.appendChild(opt);
    });
    field.value = defaultModel;
    return;
  }

  const listId = field.getAttribute('list');
  if (listId) {
    const list = document.getElementById(listId);
    if (list) {
      list.innerHTML = '';
      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        if (m.l) opt.label = m.l;
        list.appendChild(opt);
      });
    }
  }

  // Hint that custom model IDs are supported.
  field.placeholder = defaultModel + ' (or paste any OpenRouter model id)';

  if (!field.value || !field.value.trim()) {
    field.value = defaultModel;
  }
}

function showSetupWizard() {
  const overlay = document.getElementById('setupOverlay');
  if (overlay) overlay.classList.add('active');
  setupActive = true;
  setupStep = SETUP_STEPS.MAIN;
  setupAspectConfigs = { main: null };
  setupData = { currentAspect: 'main', provider: null };
  updateSetupSteps(SETUP_STEPS.MAIN);
  lg('info', 'Setup wizard opened — connect the Main Mind first');
}

function hideSetupWizard() {
  const overlay = document.getElementById('setupOverlay');
  if (overlay) overlay.classList.remove('active');
  setupActive = false;
}

function updateSetupSteps(step) {
  for (let i = 1; i <= 2; i++) {
    const el = document.getElementById('setupStep' + i);
    if (!el) continue;
    el.className = 'setup-step' + (i < step ? ' done' : '') + (i === step ? ' active' : '');
  }
  for (let i = 1; i <= 2; i++) {
    const panel = document.getElementById('setupPanel' + i);
    if (panel) panel.style.display = (i === step) ? 'block' : 'none';
  }
}

/**
 * Setup a single LLM aspect (main, subconscious, or dream)
 */
function setupSelectProviderForAspect(aspect, type) {
  setupData.currentAspect = aspect;
  setupData.provider = type;
  
  // Determine form suffixes based on aspect
  let suffix = aspect === 'main' ? '' : (aspect === 'subconscious' ? '2' : '3');
  
  // Hide all provider section containers (use exact IDs to avoid hiding child inputs)
  ['setupOpenrouter', 'setupOpenrouter2', 'setupOpenrouter3'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  ['setupOllama', 'setupOllama2', 'setupOllama3'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  
  const orSectionId = 'setupOpenrouter' + suffix;
  const olSectionId = 'setupOllama' + suffix;
  const orSection = document.getElementById(orSectionId);
  const olSection = document.getElementById(olSectionId);

  if (type === 'openrouter') {
    if (orSection) {
      orSection.style.display = 'block';
      applyOpenRouterModelSuggestions('setupOrModel' + suffix, aspect);
    }
  } else {
    if (olSection) olSection.style.display = 'block';
  }

  // Show the config section
  const configSection = document.querySelector('#setupPanel1 .setup-config-section');
  if (configSection) configSection.style.display = 'block';

  document.getElementById('setupStatus').textContent = '';
  lg('info', 'Configuring ' + LLM_ROLES[aspect] + '...');
}

/**
 * Test and save config for current LLM aspect
 */
async function setupTestConnectionForAspect() {
  const statusEl = document.getElementById('setupStatus');
  const aspect = setupData.currentAspect;
  statusEl.textContent = 'Testing connection for ' + LLM_ROLES[aspect] + '...';
  statusEl.style.color = 'var(--wn)';

  try {
    let config = null;
    let suffix = aspect === 'main' ? '' : (aspect === 'subconscious' ? '2' : '3');

    if (setupData.provider === 'openrouter') {
      const keyId = 'setupOrKey' + suffix;
      const modelId = 'setupOrModel' + suffix;
      
      const key = document.getElementById(keyId).value.trim();
      const model = document.getElementById(modelId).value;
      if (!key) { 
        statusEl.textContent = 'API key is required'; 
        statusEl.style.color = 'var(--dn)'; 
        return; 
      }

      // Test with a minimal request
      const resp = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: OPENROUTER_PRESET.ep,
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
          body: { model, messages: [{ role: 'user', content: 'Say "ok"' }], max_tokens: 5 }
        })
      });
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error('API returned ' + resp.status + ': ' + errText.slice(0, 200));
      }

      config = {
        type: 'openrouter',
        endpoint: OPENROUTER_PRESET.ep,
        key: key,
        model: model
      };

      statusEl.textContent = LLM_ROLES[aspect] + ' connected (' + model.split('/').pop() + ')';
      statusEl.style.color = 'var(--em)';

    } else {
      // Ollama
      const urlId = 'setupOllamaUrl' + suffix;
      const modelId = 'setupOllamaModel' + suffix;
      
      const url = document.getElementById(urlId).value.trim() || 'http://localhost:11434';
      const model = document.getElementById(modelId).value.trim() || 'llama3';

      const resp = await fetch(url + '/api/tags');
      if (!resp.ok) throw new Error('Cannot reach Ollama at ' + url);
      const data = await resp.json();
      const models = (data.models || []).map(m => m.name);

      config = {
        type: 'ollama',
        ollamaUrl: url,
        ollamaModel: model
      };

      statusEl.textContent = LLM_ROLES[aspect] + ' connected (' + model + ')';
      statusEl.style.color = 'var(--em)';
    }

    // Save to aspect-specific config
    setupAspectConfigs[aspect] = config;
    lg('ok', LLM_ROLES[aspect] + ' configured successfully');

    // Move to next step
    advanceSetupStep();

  } catch (err) {
    statusEl.textContent = 'Connection failed: ' + err.message;
    statusEl.style.color = 'var(--dn)';
    lg('err', 'Setup test failed: ' + err.message);
  }
}

/**
 * Advance to next setup step
 */
function advanceSetupStep() {
  setupStep = SETUP_STEPS.READY;
  updateSetupSteps(SETUP_STEPS.READY);
  updateSetupSummary();
  document.getElementById('setupStatus').textContent = '';
}

/**
 * Clear form fields for the next setup aspect
 */
function clearSetupFormFields() {
  const suffix = '';
  
  const keyInputId = 'setupOrKey' + suffix;
  const modelSelectId = 'setupOrModel' + suffix;
  const urlInputId = 'setupOllamaUrl' + suffix;
  const ollamaModelId = 'setupOllamaModel' + suffix;
  
  const keyInput = document.getElementById(keyInputId);
  const modelSelect = document.getElementById(modelSelectId);
  const urlInput = document.getElementById(urlInputId);
  const ollamaModel = document.getElementById(ollamaModelId);
  
  if (keyInput) keyInput.value = '';
  if (urlInput) urlInput.value = 'http://localhost:11434';
  if (ollamaModel) ollamaModel.value = 'llama3';
  
  // Hide provider section containers (use exact IDs to avoid hiding child inputs)
  ['setupOpenrouter', 'setupOpenrouter2', 'setupOpenrouter3'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  ['setupOllama', 'setupOllama2', 'setupOllama3'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  
  // Hide config section
  const configSection = document.querySelector('#setupPanel1 .setup-config-section');
  if (configSection) configSection.style.display = 'none';
}

/**
 * Update the summary display before hatch
 */
function updateSetupSummary() {
  const summaryMain = document.getElementById('setupSummaryMain');
  
  if (summaryMain && setupAspectConfigs.main) {
    const model = (setupAspectConfigs.main.model || setupAspectConfigs.main.ollamaModel || '').split('/').pop();
    summaryMain.textContent = setupAspectConfigs.main.type + ' (' + model + ')';
  }
}

/**
 * Get the LLM aspect for a given setup step
 */
function getAspectForStep(step) {
  return step === SETUP_STEPS.READY ? 'main' : 'main';
}

/**
 * Go back to previous setup step
 */
function previousSetupStep() {
  if (setupStep > SETUP_STEPS.MAIN) {
    setupStep--;
    updateSetupSteps(setupStep);
    document.getElementById('setupStatus').textContent = '';
  }
}

/**
 * Finalize setup: save all configs and hatch entity
 */
async function setupFinish() {
  const statusEl = document.getElementById('setupStatus');
  const btn = document.querySelector('#setupPanel' + SETUP_STEPS.READY + ' .btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
  }
  statusEl.textContent = 'Saving LLM configurations...';
  statusEl.style.color = 'var(--wn)';

  try {
    const mainConfig = setupAspectConfigs.main;
    if (!mainConfig) throw new Error('Main provider config is missing');

    const profileName = savedConfig.lastActive || 'default-multi-llm';
    const existing = savedConfig.profiles[profileName] || {};
    const profile = {
      ...existing,
      main: mainConfig,
      _activeType: mainConfig.type,
      _activeTypes: {
        ...(existing._activeTypes || {}),
        main: mainConfig.type
      }
    };

    if (mainConfig.type === 'openrouter') {
      profile.apikey = {
        endpoint: mainConfig.endpoint,
        key: mainConfig.key,
        model: mainConfig.model
      };
    } else if (mainConfig.type === 'ollama') {
      profile.ollama = {
        url: mainConfig.ollamaUrl,
        model: mainConfig.ollamaModel
      };
    }

    savedConfig.profiles[profileName] = profile;
    savedConfig.lastActive = profileName;
    await persistConfig();

    // Set main provider as active for UI
    const m = setupAspectConfigs.main;
    if (m.type === 'openrouter') {
      activeConfig = { type: 'openrouter', endpoint: m.endpoint, apiKey: m.key, model: m.model };
      updateProviderUI('openrouter', true, 'OpenRouter (' + m.model.split('/').pop() + ')');
    } else {
      activeConfig = { type: 'ollama', endpoint: m.ollamaUrl, model: m.ollamaModel };
      updateProviderUI('ollama', true, 'Ollama (' + m.ollamaModel + ')');
    }

    hideSetupWizard();
    lg('ok', 'Main provider saved. Advanced roles will inherit it until you customize them later.');

    showHatchScreen();

    refreshSidebarEntities();
  } catch (err) {
    statusEl.textContent = 'Setup failed: ' + err.message;
    statusEl.style.color = 'var(--dn)';
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Retry';
    }
    lg('err', 'Setup error: ' + err.message);
  }
}

function showHatchScreen() {
  switchMainTab('creator');
}

// ============================================================
// STARTUP — deferred to run after all other scripts load
// ============================================================
function _startApp() {
  // rawInput character counter
  const rawInput = document.getElementById('rawInput');
  if (rawInput) rawInput.addEventListener('input', function() {
    document.getElementById('sSrc').textContent = this.value.length.toLocaleString();
  });

  // Start real-time brain event stream
  if (typeof initBrainSSE === 'function') initBrainSSE();

  // Main startup sequence
  (async function startup() {
    if (typeof setupPasteDetection === 'function') {
      setupPasteDetection();
    }

    showBootOverlay();
    await runBootStage(getBootGreetingTitle(), 'Launching the desktop shell...', 10, 420);

    let authBootstrap = { authenticated: false, hasAccounts: false, account: null };
    try {
      authBootstrap = await getAuthBootstrap();
    } catch (_) {}

    await runBootStage('Installing updates', 'Checking local runtime files and saved preferences...', 34, 520);

    // 1. Try loading saved config
    try {
      const resp = await fetch(CONFIG_API);
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.profiles) {
          savedConfig = data;
          renderProfileChips();
          initSimpleProviderUI();
        }
      }
    } catch (e) {
      lg('warn', 'Config not loaded: ' + e.message);
    }

    await runBootStage('Getting things ready', 'Preparing your workspace and restoring shell state...', 62, 620);

    if (authBootstrap.authenticated && authBootstrap.account) {
      _onAuthSuccess(authBootstrap.account);
      await runBootStage('Welcome back', 'Session restored for ' + (authBootstrap.account.displayName || authBootstrap.account.username || 'user') + '.', 76, 280);
    } else {
      await runBootStage(
        authBootstrap.hasAccounts ? 'Sign in to continue' : 'Create your user',
        authBootstrap.hasAccounts
          ? 'Use your local account to enter NekoCore.'
          : 'Create your first local account to begin.',
        78,
        320
      );
      await beginAuthFlow(authBootstrap.hasAccounts ? 'login' : 'register');
      await runBootStage('User ready', 'Account linked. Finalizing startup...', 86, 260);
    }

    // 2. Try auto-connecting from saved config
    const lastProfile = savedConfig.lastActive && savedConfig.profiles[savedConfig.lastActive];
    if (lastProfile) {
      const restored = getMainConfigFromProfile(lastProfile);
      if (restored) {
        activeConfig = restored;
        if (activeConfig.type === 'openrouter') {
          updateProviderUI('openrouter', true, 'OpenRouter (' + (activeConfig.model || '').split('/').pop() + ')');
        } else {
          updateProviderUI('ollama', true, 'Ollama (' + (activeConfig.model || 'llama3') + ')');
        }
        hydrateMainProviderInputs(activeConfig);
        hideSetupRequired();
        hideSetupWizard();
        lg('ok', 'Auto-connected: ' + savedConfig.lastActive);
      }
    }

    // 3. If no active provider → show setup wizard
    if (!activeConfig) {
      await runBootStage('Connect your Main Mind', 'Choose OpenRouter or Ollama for the initial setup.', 94, 280);
      hideBootOverlay();
      lg('info', 'No provider configured — showing main-provider setup');
      showSetupWizard();
      refreshSidebarEntities();
      return;
    }

    // 4. Provider connected — show empty chat, user picks entity from sidebar
    await runBootStage('Ready', 'Desktop online. Open Creator to hatch your first entity.', 100, 220);
    hideBootOverlay();
    lg('info', 'Ready — select or create an entity from the sidebar');
    refreshSidebarEntities();
  })();

  lg('info', 'REM System v0.6.0 ready');
  setStatus('ok', 'Ready');
}

/**
 * Derive an avatar emoji from entity gender / identity keywords.
 * Returns a single emoji character.
 */
function deriveEntityAvatar(gender, traits, name) {
  // Check traits/name for animal or non-human identity keywords
  const all = ((traits || []).join(' ') + ' ' + (name || '')).toLowerCase();
  const animalMap = [
    [/\bcat\b|\bfeline\b|\bkitty\b|\bneko\b/, '🐱'],
    [/\bdog\b|\bcanine\b|\bpuppy\b|\bwolf\b/, '🐺'],
    [/\bfox\b|\bvixen\b/, '🦊'],
    [/\bbear\b/, '🐻'],
    [/\browl\b|\bbird\b|\braven\b|\bcrow\b|\beagle\b|\bhawk\b/, '🦅'],
    [/\brobot\b|\bandroid\b|\bcyborg\b/, '🤖'],
    [/\bdragon\b/, '🐉'],
    [/\bdemon\b|\bdevil\b/, '😈'],
    [/\bangel\b|\bcelestial\b/, '😇'],
    [/\bghost\b|\bspirit\b|\bphantom\b/, '👻'],
    [/\belf\b|\belven\b/, '🧝'],
    [/\bwizard\b|\bmage\b|\bsorcerer\b/, '🧙'],
    [/\bvampire\b/, '🧛'],
    [/\bzombie\b|\bundead\b/, '🧟'],
    [/\bfairy\b|\bfae\b|\bpixie\b/, '🧚'],
    [/\bmonkey\b|\bape\b|\bprimate\b/, '🐵'],
    [/\brabbit\b|\bbunny\b|\bhare\b/, '🐰'],
    [/\bsnake\b|\bserpent\b/, '🐍'],
    [/\bunicorn\b/, '🦄'],
  ];
  for (const [regex, emoji] of animalMap) {
    if (regex.test(all)) return emoji;
  }
  // Gender-based fallback
  if (gender === 'female') return '👩';
  if (gender === 'male') return '👨';
  return '🧑'; // neutral/unknown
}

/**
 * Update the global entity display info (name + avatar).
 * Call after loading, switching, or hatching an entity.
 */
function setEntityDisplay(name, gender, traits) {
  currentEntityName = name || 'Entity';
  currentEntityAvatar = deriveEntityAvatar(gender, traits, name);
  syncShellStatusWidgets();
}

// ============================================================
// NEW TAB SYSTEM & ENTITY MANAGEMENT
// ============================================================

function switchMainTab(tabName, el) {
  if (!windowManager.initialized) {
    const tab = document.getElementById('tab-' + tabName);
    document.querySelectorAll('.tab-content').forEach((node) => node.classList.remove('on'));
    if (tab) tab.classList.add('on');
    return;
  }

  document.querySelectorAll('.tab-btn, .nav-item, .os-shortcut, .os-launcher-item, .os-start-pinned-app, .os-start-app-item, .os-pinned-app, .os-dash-app, .os-overflow-app').forEach((button) => {
    button.classList.remove('on');
  });

  if (el) el.classList.add('on');
  document.querySelectorAll('[data-tab="' + tabName + '"]').forEach((button) => button.classList.add('on'));

  openWindow(tabName);
  runtimeTelemetry.activeWindowTab = tabName;
  closeStartMenu();
}

// ── Nav Sidebar ──────────────────────────────────
function toggleNavSidebar() {
  const sidebar = document.getElementById('navSidebar');
  if (!sidebar) return;
  sidebar.classList.toggle('collapsed');
  document.body.classList.toggle('nav-collapsed', sidebar.classList.contains('collapsed'));
}

function toggleNavGroup(groupId) {
  const group = document.getElementById(groupId);
  if (group) group.classList.toggle('open');
}

// Sync entity list and profile chips into nav sidebar
function syncNavSidebarEntities() {
  const src = document.getElementById('sidebarEntityList');
  const dst = document.getElementById('navEntityList');
  if (src && dst) dst.innerHTML = src.innerHTML;
  const shellDst = document.getElementById('shellEntityList');
  if (src && shellDst) shellDst.innerHTML = src.innerHTML;
}
function syncNavSidebarProfiles() {
  const src = document.getElementById('profileChips');
  const dst = document.getElementById('navProfileChips');
  if (src && dst) dst.innerHTML = src.innerHTML;
  const shellDst = document.getElementById('shellProfileChips');
  if (src && shellDst) shellDst.innerHTML = src.innerHTML;
}

// ── Physical Body Tab ──────────────────────────────────
let physicalTabInitialized = false;
let physicalSSE = null;

const SOMATIC_METRIC_LABELS = {
  cpu_usage:         { label: 'CPU Usage',          icon: '⚡', desc: 'Processing power available' },
  ram_usage:         { label: 'RAM Usage',           icon: '🧠', desc: 'Working memory space' },
  disk_usage:        { label: 'Disk Usage',          icon: '💾', desc: 'Memory archive storage' },
  response_latency:  { label: 'Response Latency',    icon: '⏱️', desc: 'How fast responses come' },
  context_fullness:  { label: 'Context Fullness',    icon: '📋', desc: 'Attention span capacity' },
  memory_decay_rate: { label: 'Memory Decay',        icon: '🔮', desc: 'Rate of memory fading' },
  cycle_time:        { label: 'Cycle Time',          icon: '🔄', desc: 'Brain loop cycle speed' },
  error_rate:        { label: 'Error Rate',          icon: '⚠️', desc: 'System reliability' }
};

function initPhysicalTab() {
  if (!physicalTabInitialized) {
    physicalTabInitialized = true;
    buildPhysicalMetricCards();
    connectPhysicalSSE();
    fetchDeepSleepInterval();
  }
  fetchPhysicalState();
}

function buildPhysicalMetricCards() {
  const grid = document.getElementById('physicalMetricsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  for (const [metric, info] of Object.entries(SOMATIC_METRIC_LABELS)) {
    const card = document.createElement('div');
    card.className = 'config-card';
    card.id = 'physical-card-' + metric;
    card.style.cssText = 'border-left:3px solid var(--border-default);transition:border-color .5s';
    card.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-2)">' +
        '<div style="display:flex;align-items:center;gap:var(--space-2)">' +
          '<span style="font-size:1.1rem">' + info.icon + '</span>' +
          '<span style="font-weight:600;font-size:var(--text-sm)">' + info.label + '</span>' +
        '</div>' +
        '<div class="sub-toggle on" id="physical-toggle-' + metric + '" onclick="toggleSomaticMetric(\'' + metric + '\')" title="Toggle this sense"></div>' +
      '</div>' +
      '<div class="text-xs-c text-tertiary-c" style="margin-bottom:var(--space-2)">' + info.desc + '</div>' +
      '<div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-1)">' +
        '<div style="flex:1;height:6px;background:var(--bg-tertiary);border-radius:3px;overflow:hidden">' +
          '<div id="physical-bar-' + metric + '" style="height:100%;width:0%;border-radius:3px;transition:width .5s,background .5s;background:var(--accent-green)"></div>' +
        '</div>' +
        '<span class="text-xs-c" id="physical-zone-' + metric + '" style="padding:1px 6px;border-radius:3px;background:var(--bg-tertiary);min-width:50px;text-align:center">—</span>' +
      '</div>' +
      '<div class="text-xs-c" id="physical-phrase-' + metric + '" style="color:var(--text-secondary);font-style:italic;min-height:1.2em">—</div>';
    grid.appendChild(card);
  }
}

async function fetchPhysicalState() {
  try {
    const resp = await fetch('/api/somatic');
    const data = await resp.json();
    if (data.ok) updatePhysicalUI(data);
  } catch (err) {
    lg('err', 'Failed to fetch somatic state: ' + err.message);
  }
  fetchNeuroState();
}

async function fetchNeuroState() {
  try {
    const resp = await fetch('/api/neurochemistry');
    const data = await resp.json();
    if (data) updateNeuroUI(data);
  } catch (err) {
    lg('err', 'Failed to fetch neurochemistry state: ' + err.message);
  }
}

function updateNeuroUI(data) {
  const chemicals = data.chemicals || data.state || {};
  const vec = data.emotionalVector || {};

  const chems = ['dopamine', 'serotonin', 'cortisol', 'oxytocin'];
  for (const chem of chems) {
    const val = chemicals[chem];
    if (val == null) continue;
    const pct = Math.round(val * 100);
    const bar = document.getElementById('neuro-bar-' + chem);
    const label = document.getElementById('neuro-val-' + chem);
    if (bar) bar.style.width = pct + '%';
    if (label) label.textContent = pct + '%';
  }

  // Derive mood label from emotional vector if available
  const valence = vec.valence != null ? vec.valence : null;
  const arousal = vec.arousal != null ? vec.arousal : null;
  const moodEl = document.getElementById('neuroMoodLabel');
  const emotionsEl = document.getElementById('neuroEmotionsLabel');
  if (moodEl && valence != null) {
    const moodText = valence > 0.6 ? 'Positive' : valence < 0.35 ? 'Low' : 'Neutral';
    const energyText = arousal > 0.6 ? 'High energy' : arousal < 0.35 ? 'Low energy' : 'Balanced';
    moodEl.textContent = moodText;
    if (emotionsEl) emotionsEl.textContent = energyText + ' · valence ' + Math.round(valence * 100) + '% · arousal ' + Math.round(arousal * 100) + '%';
  } else if (moodEl) {
    moodEl.textContent = 'Active';
  }
}

function updatePhysicalUI(data) {
  const zoneColors = { good: 'var(--accent-green)', warn: 'var(--wn)', critical: 'var(--dn)' };
  const zoneBg = { good: 'var(--accent-green)', warn: 'var(--wn)', critical: 'var(--dn)' };

  // Update overall
  const overallStress = data.overallStress || 0;
  const overallZone = overallStress < 0.2 ? 'HEALTHY' : overallStress < 0.5 ? 'MILD STRAIN' : overallStress < 0.75 ? 'STRESSED' : 'DISTRESSED';
  const overallColor = overallStress < 0.2 ? 'var(--accent-green)' : overallStress < 0.5 ? 'var(--wn)' : 'var(--dn)';

  const zoneEl = document.getElementById('physicalOverallZone');
  const narrativeEl = document.getElementById('physicalNarrative');
  const overallBar = document.getElementById('physicalOverallBar');
  const overallCard = document.getElementById('physicalOverallCard');

  if (zoneEl) { zoneEl.textContent = overallZone; zoneEl.style.background = overallColor; }
  if (narrativeEl) narrativeEl.textContent = data.bodyNarrative || 'No body awareness data yet.';
  if (overallBar) { overallBar.style.width = (overallStress * 100) + '%'; overallBar.style.background = overallColor; }
  if (overallCard) overallCard.style.borderLeftColor = overallColor;

  runtimeTelemetry.somatic.cpu = normalizePercent((data?.metrics?.cpu_usage ?? data?.sensations?.cpu_usage?.stress ?? 0));
  runtimeTelemetry.somatic.ram = normalizePercent((data?.metrics?.ram_usage ?? data?.sensations?.ram_usage?.stress ?? 0));

  // Update toggles
  if (data.toggles) {
    for (const [metric, enabled] of Object.entries(data.toggles)) {
      const toggleEl = document.getElementById('physical-toggle-' + metric);
      if (toggleEl) {
        toggleEl.classList.toggle('on', enabled);
      }
    }
  }

  // Update individual metrics
  for (const [metric, info] of Object.entries(SOMATIC_METRIC_LABELS)) {
    const sensation = data.sensations && data.sensations[metric];
    const rawValue = data.metrics && data.metrics[metric];
    const card = document.getElementById('physical-card-' + metric);
    const bar = document.getElementById('physical-bar-' + metric);
    const zoneSpan = document.getElementById('physical-zone-' + metric);
    const phrase = document.getElementById('physical-phrase-' + metric);
    const enabled = !data.toggles || data.toggles[metric] !== false;

    if (card) card.style.opacity = enabled ? '1' : '0.4';

    if (sensation) {
      const color = zoneColors[sensation.zone] || 'var(--border-default)';
      if (bar) { bar.style.width = (sensation.stress * 100) + '%'; bar.style.background = color; }
      if (zoneSpan) { zoneSpan.textContent = sensation.zone.toUpperCase(); zoneSpan.style.background = zoneBg[sensation.zone] || 'var(--bg-tertiary)'; zoneSpan.style.color = 'var(--bg-primary)'; }
      if (phrase) phrase.textContent = sensation.phrase || '—';
      if (card) card.style.borderLeftColor = color;
    } else if (!enabled) {
      if (bar) { bar.style.width = '0%'; }
      if (zoneSpan) { zoneSpan.textContent = 'OFF'; zoneSpan.style.background = 'var(--bg-tertiary)'; zoneSpan.style.color = 'var(--text-tertiary)'; }
      if (phrase) phrase.textContent = 'Sense disabled';
      if (card) card.style.borderLeftColor = 'var(--border-default)';
    }
  }
}

// ── Chat Sidebar Physical Widget (compact mirror) ──
function updateChatPhysical(data) {
  const overallStress = data.overallStress || 0;
  const zoneLabel = overallStress < 0.2 ? 'HEALTHY' : overallStress < 0.5 ? 'MILD STRAIN' : overallStress < 0.75 ? 'STRESSED' : 'DISTRESSED';
  const color = overallStress < 0.2 ? 'var(--accent-green)' : overallStress < 0.5 ? 'var(--wn)' : 'var(--dn)';

  const zone = document.getElementById('chatPhysicalZone');
  const narrative = document.getElementById('chatPhysicalNarrative');
  const bar = document.getElementById('chatPhysicalBar');
  const card = document.getElementById('chatPhysicalOverallCard');

  if (zone) { zone.textContent = zoneLabel; zone.style.background = color; }
  if (narrative) narrative.textContent = data.bodyNarrative || 'No body awareness data yet.';
  if (bar) { bar.style.width = (overallStress * 100) + '%'; bar.style.background = color; }
  if (card) card.style.borderLeftColor = color;

  // Compact metric rows
  const container = document.getElementById('chatPhysicalMetrics');
  if (!container) return;
  container.innerHTML = '';
  for (const [metric, info] of Object.entries(SOMATIC_METRIC_LABELS)) {
    const sensation = data.sensations && data.sensations[metric];
    if (!sensation) continue;
    const mColor = sensation.zone === 'good' ? 'var(--accent-green)' : sensation.zone === 'warn' ? 'var(--wn)' : 'var(--dn)';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:11px;padding:2px 0';
    row.innerHTML = '<span>' + info.icon + '</span><span style="flex:1;color:var(--text-secondary)">' + info.label + '</span>' +
      '<span style="padding:1px 5px;border-radius:3px;background:' + mColor + ';color:var(--bg-primary);font-size:10px">' + sensation.zone.toUpperCase() + '</span>';
    container.appendChild(row);
  }
}

let chatPhysicalSSE = null;
function initChatPhysical() {
  // Fetch initial state
  fetch('/api/somatic').then(r => r.json()).then(data => {
    if (data.ok) updateChatPhysical(data);
  }).catch(() => {});
  // Listen for updates
  if (!chatPhysicalSSE) {
    try {
      chatPhysicalSSE = new EventSource('/api/brain/events');
      chatPhysicalSSE.addEventListener('thought', function(e) {
        try {
          const d = JSON.parse(e.data);
          if (d.type === 'SOMATIC_UPDATE') updateChatPhysical(d);
        } catch (_) {}
      });
    } catch (_) {}
  }
}

async function toggleSomaticMetric(metric) {
  const toggleEl = document.getElementById('physical-toggle-' + metric);
  if (!toggleEl) return;
  const currentlyOn = toggleEl.classList.contains('on');
  const newEnabled = !currentlyOn;

  try {
    const resp = await fetch('/api/somatic/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metric: metric, enabled: newEnabled })
    });
    const data = await resp.json();
    if (data.ok) {
      toggleEl.classList.toggle('on', newEnabled);
      fetchPhysicalState();
    }
  } catch (err) {
    lg('err', 'Failed to toggle metric: ' + err.message);
  }
}

function connectPhysicalSSE() {
  if (physicalSSE) return;
  try {
    physicalSSE = new EventSource('/api/brain/events');
    physicalSSE.addEventListener('thought', function(e) {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'SOMATIC_UPDATE') {
          updatePhysicalUI({
            metrics: data.metrics,
            sensations: data.sensations,
            overallStress: data.overallStress,
            bodyNarrative: data.bodyNarrative,
            toggles: data.toggles
          });
        } else if (data.type === 'NEUROCHEMICAL_SHIFT' && data.state) {
          updateNeuroUI({ chemicals: data.state, emotionalVector: data.emotionalVector });
        }
      } catch (err) { /* ignore */ }
    });
  } catch (err) { /* ignore */ }
}

// ── Deep Sleep Interval Slider ──
function updateDeepSleepIntervalLabel(val) {
  const el = document.getElementById('deepSleepIntervalValue');
  if (el) el.textContent = val + ' cycles';
}

async function fetchDeepSleepInterval() {
  try {
    const resp = await fetch('/api/brain/deep-sleep-interval');
    const data = await resp.json();
    if (data.ok) {
      const slider = document.getElementById('deepSleepIntervalSlider');
      const label = document.getElementById('deepSleepIntervalValue');
      if (slider) slider.value = data.deepSleepInterval;
      if (label) label.textContent = data.deepSleepInterval + ' cycles';
    }
  } catch (err) { /* ignore */ }
}

async function saveDeepSleepInterval(val) {
  try {
    await fetch('/api/brain/deep-sleep-interval', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deepSleepInterval: Number(val) })
    });
  } catch (err) { /* ignore */ }
}

// ── Mini Neural Viz in Chat Sidebar (data-only panel) ──
let miniVizInitialized = false;
let miniVizEventSource = null;

function toggleMiniViz() {
  const body = document.getElementById('miniVizBody');
  const arrow = document.getElementById('miniVizArrow');
  if (!body) return;

  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (arrow) arrow.textContent = isOpen ? '▶' : '▼';

  // Initialize mini viz SSE on first open
  if (!isOpen && !miniVizInitialized) {
    miniVizInitialized = true;
    setupMiniVizSSE();
  }
}

function setupMiniVizSSE() {
  try {
    miniVizEventSource = new EventSource('/api/brain/events');
    miniVizEventSource.addEventListener('memory_accessed', function(e) {
      try {
        const data = JSON.parse(e.data);
        if (data.memory_id) {
          showMiniMemoryDetail(data.memory_id);
        }
      } catch (err) { /* ignore */ }
    });
  } catch (err) { /* ignore */ }
}

function showMemoryDetail(memId, panelId) {
  var panel = document.getElementById(panelId);
  if (!panel) return;

  panel.innerHTML = '<div class="mini-viz-loading">Loading...</div>';
  panel.style.display = 'block';

  fetch('/api/memory/summary?id=' + encodeURIComponent(memId))
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.ok && data.summary) {
        var summary = data.summary.length > 200 ? data.summary.substring(0, 200) + '...' : data.summary;
        var accessInfo = data.access_count > 0 ? ('Accessed ' + data.access_count + ' times') : 'Never accessed';
        var typeLabel = data.type ? (data.type.charAt(0).toUpperCase() + data.type.slice(1)) : 'Unknown';
        panel.innerHTML =
          '<div class="mini-detail-id" title="' + escapeHtmlAttr(memId) + '">' + escapeHtmlInner(memId) + '</div>' +
          '<div class="mini-detail-summary">' + escapeHtmlInner(summary) + '</div>' +
          '<div class="mini-detail-meta">' + typeLabel + ' &middot; ' + accessInfo +
            (data.created ? ' &middot; ' + new Date(data.created).toLocaleDateString() : '') +
          '</div>';
      } else {
        panel.innerHTML = '<div class="mini-detail-empty">No summary available</div>';
      }
    })
    .catch(function() {
      panel.innerHTML = '<div class="mini-detail-empty">Failed to load</div>';
    });
}

function showMiniMemoryDetail(memId) {
  // Update chat sidebar panel
  showMemoryDetail(memId, 'miniVizDetail');
  var status = document.getElementById('miniVizStatus');
  if (status) status.textContent = memId;

  // Also update Neural tab context panel
  showMemoryDetail(memId, 'vizContextDetail');
  addVizActivityItem(memId);

  // Also select in main viz if available
  if (typeof NeuralViz !== 'undefined' && NeuralViz.isInitialized) {
    NeuralViz.selectNodeById(memId);
  }
}

function addVizActivityItem(memId) {
  var list = document.getElementById('vizContextActivityList');
  if (!list) return;
  // Remove placeholder
  var placeholder = list.querySelector('.mini-detail-empty');
  if (placeholder) placeholder.remove();
  // Add item at top
  var item = document.createElement('div');
  item.className = 'viz-activity-item';
  item.onclick = function() {
    showMemoryDetail(memId, 'vizContextDetail');
    if (typeof NeuralViz !== 'undefined' && NeuralViz.isInitialized) {
      NeuralViz.selectNodeById(memId);
    }
  };
  var now = new Date();
  item.innerHTML =
    '<div class="viz-activity-item-id">' + escapeHtmlInner(memId) + '</div>' +
    '<div class="viz-activity-item-time">' + now.toLocaleTimeString() + '</div>';
  list.insertBefore(item, list.firstChild);
  // Keep max 20 items
  while (list.children.length > 20) list.removeChild(list.lastChild);
}

function escapeHtmlInner(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
function escapeHtmlAttr(str) {
  return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Neural Viz Search (works for both full and mini) ──
function setupVizSearch(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;

  input.addEventListener('input', function() {
    const query = this.value.trim().toLowerCase();
    if (!query || query.length < 3) {
      const results = document.getElementById('vizSearchResults');
      if (results) results.style.display = 'none';
      return;
    }

    if (typeof NeuralViz === 'undefined' || !NeuralViz.isInitialized) return;

    const allIds = NeuralViz.getNodeIds();
    const matches = allIds.filter(id => id.toLowerCase().includes(query)).slice(0, 8);

    const results = document.getElementById('vizSearchResults');
    if (results && matches.length > 0) {
      results.innerHTML = matches.map(id =>
        `<div class="viz-search-item" onclick="vizSearchSelect('${id}')">${id}</div>`
      ).join('');
      results.style.display = 'block';
    } else if (results) {
      results.style.display = 'none';
    }
  });

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = this.value.trim();
      if (query && typeof NeuralViz !== 'undefined' && NeuralViz.isInitialized) {
        NeuralViz.selectNodeById(query);
        this.value = '';
        const results = document.getElementById('vizSearchResults');
        if (results) results.style.display = 'none';
      }
    }
  });

  // Close dropdown on click outside
  document.addEventListener('mousedown', function(e) {
    if (!input.contains(e.target)) {
      const results = document.getElementById('vizSearchResults');
      if (results) results.style.display = 'none';
    }
  });
}

function vizSearchSelect(memId) {
  if (typeof NeuralViz !== 'undefined' && NeuralViz.isInitialized) {
    NeuralViz.selectNodeById(memId);
  }
  // Also show in context panel
  showMemoryDetail(memId, 'vizContextDetail');
  addVizActivityItem(memId);
  const results = document.getElementById('vizSearchResults');
  if (results) results.style.display = 'none';
  // Clear search inputs
  ['vizSearchInput', 'miniVizSearchInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

// Mini viz search (direct select, no dropdown)
function setupMiniVizSearch() {
  const input = document.getElementById('miniVizSearchInput');
  if (!input) return;
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = this.value.trim();
      if (query) {
        showMiniMemoryDetail(query);
        this.value = '';
      }
    }
  });
}

// Neural tab context panel search
function setupVizContextSearch() {
  var input = document.getElementById('vizContextSearchInput');
  if (!input) return;
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      var query = this.value.trim();
      if (query) {
        showMemoryDetail(query, 'vizContextDetail');
        addVizActivityItem(query);
        if (typeof NeuralViz !== 'undefined' && NeuralViz.isInitialized) {
          NeuralViz.selectNodeById(query);
        }
        this.value = '';
      }
    }
  });
}

// Initialize search handlers after DOM ready
document.addEventListener('DOMContentLoaded', function() {
  setupVizSearch('vizSearchInput');
  setupMiniVizSearch();
  setupVizContextSearch();

  // When a 3D node is clicked, also update the context panel
  window.onNeuralNodeSelected = function(memId) {
    showMemoryDetail(memId, 'vizContextDetail');
    addVizActivityItem(memId);
  };
});

function toggleAdvancedMenu(el) {
  // Legacy — Advanced is now a regular tab in the nav sidebar
  switchMainTab('advanced', el);
}

function toggleAdvancedSection(headerEl) {
  const content = headerEl.nextElementSibling;
  if (content) {
    content.classList.toggle('open');
    const toggle = headerEl.querySelector('.section-toggle');
    if (toggle) {
      toggle.style.transform = content.classList.contains('open') ? 'rotate(180deg)' : 'rotate(0)';
    }
  }
}

function showProviderTab(providerName, el) {
  // Hide all provider tabs
  document.querySelectorAll('.provider-tab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.provider-btn').forEach(b => b.classList.remove('on'));
  
  // Show selected provider
  const tab = document.getElementById('provider-' + providerName);
  if (tab) {
    tab.classList.add('on');
    el.classList.add('on');
  }

  applySettingsOpenRouterSuggestions(providerName);

  // Auto-inherit endpoint + API key from Main Chat into sub/dream/orchestrator tabs
  if (providerName === 'subconscious' || providerName === 'dreams' || providerName === 'orchestrator') {
    inheritMainConfigToAspect(providerName);
  }
}

/** Pre-fill sub/dream/orchestrator endpoint + key from the main config when those fields are empty. */
function inheritMainConfigToAspect(panel) {
  const mainEndpoint = document.getElementById('apikeyEndpoint-main')?.value?.trim() || '';
  const mainKey      = document.getElementById('apikeyKey-main')?.value?.trim() || '';
  if (!mainEndpoint && !mainKey) return; // nothing to inherit

  const idMap = {
    subconscious: { ep: 'subApiEndpoint', key: 'subApiKey' },
    dreams:       { ep: 'dreamApiEndpoint', key: 'dreamApiKey' },
    orchestrator: { ep: 'orchApiEndpoint', key: 'orchApiKey' }
  };
  const ids = idMap[panel];
  if (!ids) return;

  const epEl  = document.getElementById(ids.ep);
  const keyEl = document.getElementById(ids.key);
  if (epEl && !epEl.value.trim() && mainEndpoint) epEl.value = mainEndpoint;
  if (keyEl && !keyEl.value.trim() && mainKey)     keyEl.value = mainKey;
}

// ============================================================
// ENTITY MANAGEMENT
// ============================================================

function buildEntityChip(entity) {
  const chip = document.createElement('div');
  chip.className = 'entity-chip' + (entity.id === currentEntityId ? ' active' : '');
  const avatar = deriveEntityAvatar(entity.gender, entity.traits || entity.personality_traits, entity.name);
  const traits = (entity.traits || entity.personality_traits || []).slice(0, 2).join(', ');
  const isOwner = entity.isOwner !== false;
  const showVisibilityBtn = entity.ownerId && isOwner && !currentEntityId;
  const visibilityHtml = showVisibilityBtn
    ? `<span class="entity-chip-vis" title="${entity.isPublic ? 'Shared — click to make private' : 'Private — click to share'}" style="font-size:.65rem;cursor:pointer;opacity:.6;margin-right:.15rem;">${entity.isPublic ? '🌐' : '🔒'}</span>`
    : (entity.ownerId && !isOwner && !currentEntityId ? '<span style="font-size:.62rem;opacity:.4;margin-right:.15rem;" title="Shared by another user">🌐</span>' : '');

  chip.innerHTML = `
    <span class="entity-chip-avatar">${avatar}</span>
    <div class="entity-chip-info">
      <div class="entity-chip-name">${entity.name || 'Unnamed'}</div>
      <div class="entity-chip-meta">${traits || entity.gender || ''}</div>
    </div>
    ${visibilityHtml}
    ${isOwner && !currentEntityId ? `<span class="entity-chip-del" title="Delete ${entity.name || 'entity'}">&times;</span>` : ''}
  `;

  chip.addEventListener('click', (e) => {
    if (e.target.closest('.entity-chip-del')) return;
    if (e.target.closest('.entity-chip-vis')) return;
    if (entity.id === currentEntityId) {
      toggleEntityInfoPanel();
    } else {
      sidebarSelectEntity(entity.id);
    }
  });

  const delBtn = chip.querySelector('.entity-chip-del');
  if (delBtn) {
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebarDeleteEntity(entity.id, entity.name);
    });
  }

  const visBtn = chip.querySelector('.entity-chip-vis');
  if (visBtn) {
    visBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const vResp = await fetch('/api/entities/visibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entityId: entity.id })
        });
        const data2 = await vResp.json();
        if (data2.ok) refreshSidebarEntities();
      } catch (_) {}
    });
  }

  return chip;
}

function renderEntityBrowser(entities) {
  const panel = document.getElementById('entityInfoPanel');
  if (!panel) return;

  if (!entities || !entities.length) {
    panel.innerHTML = '<div class="eip-card"><div class="eip-header"><div class="eip-header-info"><div class="eip-name">Entity Browser</div><div class="eip-meta">No entities available yet</div></div></div><div class="eip-section"><div class="eip-intro-text">No entities found. Open the Creator app to make one.</div></div></div>';
    return;
  }

  const cards = entities.map((entity) => {
    const avatar = deriveEntityAvatar(entity.gender, entity.traits || entity.personality_traits, entity.name);
    const traits = (entity.traits || entity.personality_traits || []).slice(0, 3).join(', ');
    const memCount = entity.memory_count ?? entity.memoryCount ?? 0;
    const status = entity.id === currentEntityId ? 'Active now' : (entity.isPublic ? 'Shared' : 'Available');
    return '<button class="entity-list-item" type="button" onclick="sidebarSelectEntity(\'' + String(entity.id).replace(/'/g, "\\'") + '\')">'
      + '<div style="display:flex;align-items:center;gap:12px">'
      + '<div class="entity-avatar" style="width:42px;height:42px;font-size:1.2rem">' + avatar + '</div>'
      + '<div style="flex:1;text-align:left">'
      + '<div class="entity-list-item-name">' + (entity.name || 'Unnamed') + '</div>'
      + '<div class="entity-list-item-traits">' + (traits || entity.gender || 'Unknown') + '</div>'
      + '<div class="entity-list-item-traits">' + memCount + ' memories • ' + status + '</div>'
      + '</div>'
      + '<div style="font-size:var(--text-xs);color:var(--text-secondary)">Preview</div>'
      + '</div>'
      + '</button>';
  }).join('');

  panel.innerHTML = '<div class="eip-card">'
    + '<div class="eip-header">'
    + '<div class="eip-header-info"><div class="eip-name">Entity Browser</div><div class="eip-meta">Select an entity to preview or check it out</div></div>'
    + '</div>'
    + '<div class="eip-section"><div class="eip-label">Available Entities</div><div style="display:grid;gap:10px">' + cards + '</div></div>'
    + '</div>';
}

async function ensureEntityWindowContent(forceRefresh) {
  const panel = document.getElementById('entityInfoPanel');
  if (!panel) return;
  const hasContent = panel.textContent && panel.textContent.trim().length > 0;
  if (!forceRefresh && hasContent) return;

  panel.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-tertiary)">Loading entities...</div>';

  if (currentEntityId) {
    try {
      const resp = await fetch('/api/entity/profile');
      if (!resp.ok) throw new Error('Failed to fetch active profile');
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || 'No active profile');
      renderEntityInfoPanel(data.profile, 'active');
      return;
    } catch (_) {
      // Fall through to the entity browser so the window is still useful.
    }
  }

  try {
    const resp = await fetch('/api/entities');
    if (!resp.ok) throw new Error('Failed to fetch entities');
    const data = await resp.json();
    renderEntityBrowser(data.entities || []);
  } catch (e) {
    panel.innerHTML = '<div class="eip-card"><div class="eip-section"><div style="color:var(--danger)">Failed to load entities: ' + e.message + '</div></div></div>';
  }
}

// --- Sidebar entity list ---
async function refreshSidebarEntities() {
  const listEls = ['sidebarEntityList', 'navEntityList', 'shellEntityList']
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  if (!listEls.length) return;

  const titleEl = document.getElementById('navEntityTitle');
  const newBtn = document.getElementById('navNewEntityBtn');
  const releaseBtns = ['navReleaseEntityBtn', 'shellReleaseEntityBtn', 'chatReleaseEntityBtn']
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  try {
    // Sync active entity from server so release controls remain accurate
    // even if local currentEntityId gets out of sync after reloads.
    let activeEntityId = currentEntityId;
    try {
      const stateResp = await fetch('/api/entities/current');
      if (stateResp.ok) {
        const stateData = await stateResp.json();
        if (stateData?.loaded && stateData?.entity?.id) {
          activeEntityId = stateData.entity.id;
          currentEntityId = stateData.entity.id;
        }
      }
    } catch (_) {}

    const resp = await fetch('/api/entities');
    if (!resp.ok) throw new Error('Failed to fetch');
    const data = await resp.json();

    // Update nav header and button states based on active entity
    if (activeEntityId) {
      if (titleEl) titleEl.textContent = 'Active Entity';
      if (newBtn) newBtn.style.display = '';
      releaseBtns.forEach((btn) => { btn.style.display = ''; });
    } else {
      if (titleEl) titleEl.textContent = 'Entities';
      if (newBtn) newBtn.style.display = '';
      releaseBtns.forEach((btn) => { btn.style.display = 'none'; });
    }

    if (!data.entities || data.entities.length === 0) {
      listEls.forEach((listEl) => {
        listEl.innerHTML = '<div style="color:var(--td);text-align:center;padding:.75rem .25rem;font-size:.65rem;">No entities yet</div>';
      });
      return;
    }

    // If an entity is active, only show that one
    const entitiesToShow = activeEntityId
      ? data.entities.filter(e => e.id === activeEntityId)
      : data.entities;

    listEls.forEach((listEl) => {
      listEl.innerHTML = '';
    });

    entitiesToShow.forEach(entity => {
      listEls.forEach((listEl) => {
        listEl.appendChild(buildEntityChip(entity));
      });
    });
  } catch (e) {
    listEls.forEach((listEl) => {
      listEl.innerHTML = '<div style="color:var(--dn);text-align:center;padding:.5rem;font-size:.6rem;">' + e.message + '</div>';
    });
  }
}

// --- Preview entity before checkout ---
async function sidebarSelectEntity(entityId) {
  if (entityId === currentEntityId) return;
  const panel = document.getElementById('entityInfoPanel');
  if (!panel) return;
  panel.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-tertiary)">Loading preview...</div>';
  switchMainTab('entity');
  try {
    const resp = await fetch('/api/entities/preview?id=' + encodeURIComponent(entityId));
    if (!resp.ok) throw new Error('Failed to fetch preview');
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || 'No preview data');
    renderEntityInfoPanel(data.profile, 'preview', entityId);
  } catch (e) {
    panel.innerHTML = '<div style="color:var(--dn);padding:1rem;font-size:.8rem;">Failed to load preview: ' + e.message + '</div>';
  }
}

// --- Actually check out an entity (called from preview panel) ---
async function checkoutEntity(entityId) {
  try {
    const resp = await fetch('/api/entities/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId })
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to load entity');
    }
    const data = await resp.json();

    updateEntityDisplay(data.entity);
    document.getElementById('entityName').textContent = ' — ' + data.entity.name;
    document.getElementById('entityTraits').textContent = (data.entity.personality_traits || []).join(', ');
    currentEntityId = entityId;
    setEntityDisplay(data.entity.name, data.entity.gender, data.entity.personality_traits);
    resetChatForEntitySwitch(data.entity.name, data.entity.introduction, data.entity.memory_count);
    if (typeof initUserSwitcher === 'function') initUserSwitcher();
    lg('ok', 'Checked out entity: ' + data.entity.name);

    const delBtn = document.getElementById('deleteEntityBtn');
    if (delBtn) delBtn.style.display = 'inline-block';
    ensureEntityWindowContent(true);
    switchMainTab('chat');
    refreshSidebarEntities();
  } catch (e) {
    lg('err', 'Failed to check out entity: ' + e.message);
  }
}

// --- Entity info panel (active entity view or preview) ---
async function toggleEntityInfoPanel() {
  const entityTab = document.getElementById('tab-entity');
  if (entityTab && entityTab.classList.contains('on')) {
    switchMainTab('chat');
    return;
  }
  const panel = document.getElementById('entityInfoPanel');
  if (!panel) return;
  panel.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-tertiary)">Loading...</div>';
  switchMainTab('entity');
  try {
    const resp = await fetch('/api/entity/profile');
    if (!resp.ok) throw new Error('Failed to fetch');
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || 'No profile');
    renderEntityInfoPanel(data.profile, 'active');
  } catch (e) {
    panel.innerHTML = '<div style="color:var(--dn);padding:1rem;font-size:.8rem;">Failed to load: ' + e.message + '</div>';
  }
}

let _eipRelMap = {};

function renderEntityInfoPanel(p, mode, previewEntityId) {
  const panel = document.getElementById('entityInfoPanel');
  if (!panel) return;
  _eipRelMap = {};
  const avatar = deriveEntityAvatar(p.gender, p.traits, p.name);

  let html = '<div class="eip-card">';

  // ── Header ──
  html += '<div class="eip-header">';
  html += '<span class="eip-avatar">' + avatar + '</span>';
  html += '<div class="eip-header-info">';
  html += '<div class="eip-name">' + (p.name || 'Unknown') + '</div>';
  html += '<div class="eip-meta">' + (p.gender || '') + (p.created ? ' · Created ' + new Date(p.created).toLocaleDateString() : '') + '</div>';
  if (p.mood) {
    html += '<div class="eip-mood-inline"><span class="eip-badge eip-badge-mood">' + p.mood + '</span>';
    if (p.emotions) html += '<span class="eip-emotions">' + p.emotions + '</span>';
    html += '</div>';
  }
  html += '</div>';
  html += '<button class="eip-close" onclick="switchMainTab(\'chat\')" title="Back to chat">✕</button>';
  html += '</div>';

  // ── Introduction ──
  if (p.introduction) {
    html += '<div class="eip-section eip-intro"><div class="eip-label">Introduction</div><div class="eip-intro-text">' + p.introduction + '</div></div>';
  }

  // ── Two-column body ──
  html += '<div class="eip-body">';

  // Left column
  html += '<div class="eip-col">';

  if (p.traits && p.traits.length) {
    html += '<div class="eip-section"><div class="eip-label">Personality</div><div class="eip-value">';
    p.traits.forEach(t => { html += '<span class="eip-badge eip-badge-trait">' + t + '</span>'; });
    html += '</div></div>';
  }

  if (p.relationships && p.relationships.length) {
    html += '<div class="eip-section"><div class="eip-label">Relationships</div>';
    p.relationships.forEach(r => {
      const name = r.userName || r.userId || 'Unknown';
      const trust = typeof r.trust === 'number' ? Math.round(r.trust * 100) : null;
      const pct = trust !== null ? trust : 0;
      const color = pct > 70 ? 'var(--accent-green)' : pct > 40 ? 'var(--accent-orange)' : 'var(--accent-red)';
      const safeUid = (r.userId || 'u').replace(/[^a-zA-Z0-9_-]/g, '_');
      _eipRelMap[safeUid] = r;
      html += '<div class="eip-rel-row">';
      html += '<div class="eip-rel" data-uid="' + safeUid + '">';
      html += '<span class="eip-rel-name">' + name + '</span>';
      if (trust !== null) {
        html += '<div class="eip-rel-bar-wrap"><div class="eip-rel-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>';
        html += '<span class="eip-rel-trust">' + pct + '%</span>';
      }
      html += '<span class="eip-rel-chevron">›</span>';
      html += '</div>';
      html += '<div class="eip-rel-detail" id="eip-reld-' + safeUid + '"></div>';
      html += '</div>';
    });
    html += '</div>';
  }

  if (p.goals && p.goals.length) {
    html += '<div class="eip-section"><div class="eip-label">Goals</div>';
    p.goals.forEach(g => {
      html += '<div class="eip-goal">' + (g.description || 'Unnamed goal') + '</div>';
    });
    html += '</div>';
  }

  if (p.skills && p.skills.length) {
    html += '<div class="eip-section"><div class="eip-label">Active Skills</div><div class="eip-value">';
    p.skills.forEach(s => { html += '<span class="eip-badge eip-badge-skill">' + s.name + '</span>'; });
    html += '</div></div>';
  }

  if (p.sleepCount) {
    html += '<div class="eip-section"><div class="eip-label">Sleep Cycles</div><div class="eip-stat-big">' + p.sleepCount + '</div></div>';
  }

  html += '</div>'; // end left col

  // Right column — neurochemistry
  html += '<div class="eip-col">';
  if (p.neurochemistry && p.neurochemistry.levels) {
    html += '<div class="eip-section"><div class="eip-label">Neurochemistry</div>';
    const levels = p.neurochemistry.levels;
    const chemLabels = { dopamine: 'Dopamine', cortisol: 'Cortisol', serotonin: 'Serotonin', oxytocin: 'Oxytocin' };
    const chemIcons  = { dopamine: '⚡', cortisol: '⚠️', serotonin: '🌿', oxytocin: '💛' };
    for (const [key, val] of Object.entries(levels)) {
      const pct = Math.round((val || 0) * 100);
      const color = key === 'cortisol'
        ? (pct > 60 ? 'var(--accent-red)' : pct > 35 ? 'var(--accent-orange)' : 'var(--accent-green)')
        : (pct > 70 ? 'var(--accent-green)' : pct > 40 ? 'var(--accent-orange)' : 'var(--accent-red)');
      html += '<div class="eip-neuro-bar">';
      html += '<span class="eip-neuro-icon">' + (chemIcons[key] || '') + '</span>';
      html += '<span class="eip-neuro-label">' + (chemLabels[key] || key) + '</span>';
      html += '<div class="eip-neuro-track"><div class="eip-neuro-fill" style="width:' + pct + '%;background:' + color + '"></div></div>';
      html += '<span class="eip-neuro-val">' + pct + '%</span>';
      html += '</div>';
    }
    html += '</div>';
  }
  html += '</div>'; // end right col

  html += '</div>'; // end eip-body

  // Checkout button
  if (mode === 'preview' && previewEntityId) {
    html += '<div class="eip-checkout-row">';
    html += '<button class="eip-checkout-btn" onclick="checkoutEntity(\'' + previewEntityId.replace(/'/g, "\\'") + '\')">Check Out Entity →</button>';
    html += '</div>';
  }

  // Release button for active entity view
  if (mode === 'active') {
    html += '<div class="eip-checkout-row">';
    html += '<button class="eip-checkout-btn" onclick="releaseActiveEntity()">Release Entity</button>';
    html += '</div>';
  }

  html += '</div>'; // end eip-card
  panel.innerHTML = html;
  panel.querySelectorAll('.eip-rel[data-uid]').forEach(el => {
    el.addEventListener('click', () => _toggleRelDetail(el.dataset.uid));
  });
  switchMainTab('entity');
}

function _toggleRelDetail(uid) {
  const r = _eipRelMap[uid];
  if (!r) return;
  const detailEl = document.getElementById('eip-reld-' + uid);
  if (!detailEl) return;
  const isOpen = detailEl.classList.toggle('open');
  const relEl = document.querySelector('.eip-rel[data-uid="' + uid + '"]');
  const chevron = relEl && relEl.querySelector('.eip-rel-chevron');
  if (chevron) chevron.textContent = isOpen ? '∨' : '›';
  if (!isOpen) { detailEl.innerHTML = ''; return; }

  const tPct = Math.round((r.trust || 0) * 100);
  const rPct = Math.round((r.rapport || 0) * 100);
  const tColor = tPct > 70 ? 'var(--accent-green)' : tPct > 40 ? 'var(--accent-orange)' : 'var(--accent-red)';
  const rColor = rPct > 60 ? 'var(--accent-green)' : rPct > 30 ? 'var(--accent-orange)' : 'var(--accent-red)';
  const feelEmoji = (_FEELING_EMOJI && _FEELING_EMOJI[r.feeling]) || '😶';

  let d = '';
  d += '<div class="eip-reld-feeling"><span>' + feelEmoji + '</span><strong>' + (r.feeling || 'neutral') + '</strong></div>';

  d += '<div class="eip-reld-bars">';
  d += '<div class="eip-reld-bar-row"><span class="eip-reld-bar-label">Trust</span><div class="eip-rel-bar-wrap"><div class="eip-rel-bar-fill" style="width:' + tPct + '%;background:' + tColor + '"></div></div><span class="eip-reld-bar-val">' + tPct + '%</span></div>';
  d += '<div class="eip-reld-bar-row"><span class="eip-reld-bar-label">Rapport</span><div class="eip-rel-bar-wrap"><div class="eip-rel-bar-fill" style="width:' + rPct + '%;background:' + rColor + '"></div></div><span class="eip-reld-bar-val">' + rPct + '%</span></div>';
  d += '</div>';

  if (r.userRole || r.entityRole) {
    d += '<div class="eip-reld-roles">';
    if (r.userRole) d += '<div class="eip-reld-role"><span class="eip-reld-role-label">Their role</span><span class="eip-badge">' + r.userRole + '</span></div>';
    if (r.entityRole) d += '<div class="eip-reld-role"><span class="eip-reld-role-label">My role</span><span class="eip-badge">' + r.entityRole + '</span></div>';
    d += '</div>';
  }

  if (r.beliefs && r.beliefs.length) {
    d += '<div class="eip-reld-section"><div class="eip-reld-section-label">Beliefs</div>';
    r.beliefs.forEach(b => {
      const conf = Math.round((b.confidence || 0) * 100);
      d += '<div class="eip-reld-belief"><span class="eip-reld-belief-text">\u201c' + (b.belief || '') + '\u201d</span><span class="eip-reld-belief-conf">' + conf + '%</span></div>';
    });
    d += '</div>';
  }

  if (r.summary) {
    d += '<div class="eip-reld-section"><div class="eip-reld-section-label">Summary</div><div class="eip-reld-summary">' + r.summary + '</div></div>';
  }

  const statParts = [];
  if (r.interactionCount) statParts.push(r.interactionCount + ' interactions');
  if (r.firstMet) statParts.push('Met ' + new Date(r.firstMet).toLocaleDateString());
  if (r.lastSeen) statParts.push('Last seen ' + new Date(r.lastSeen).toLocaleDateString());
  if (statParts.length) d += '<div class="eip-reld-stats">' + statParts.join(' · ') + '</div>';

  detailEl.innerHTML = d;
}

// --- Release active entity ---
async function releaseActiveEntity() {
  let entityId = currentEntityId;
  if (!entityId) {
    try {
      const currentResp = await fetch('/api/entities/current');
      if (currentResp.ok) {
        const currentData = await currentResp.json();
        if (currentData?.loaded && currentData?.entity?.id) {
          entityId = currentData.entity.id;
          currentEntityId = entityId;
        }
      }
    } catch (_) {}
  }
  if (!entityId) {
    lg('warn', 'No active entity to release');
    return;
  }
  if (!confirm('Release this entity? Other users will be able to check it out.')) return;
  try {
    const resp = await fetch('/api/entities/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId })
    });
    if (!resp.ok) throw new Error('Failed to release');

    lg('ok', 'Entity released');
    currentEntityId = null;
    currentEntityName = null;
    currentEntityAvatar = '🤖';
    document.getElementById('entityName').textContent = '';
    document.getElementById('entityTraits').textContent = 'No entity loaded';
    const display = document.getElementById('entityDisplay');
    if (display) {
      display.classList.remove('loaded');
      display.innerHTML = '<div style="color:var(--td);text-align:center;padding:2rem"><div>No entity loaded</div></div>';
    }
    const delBtn = document.getElementById('deleteEntityBtn');
    if (delBtn) delBtn.style.display = 'none';
    if (typeof resetUserSwitcher === 'function') resetUserSwitcher();
    if (typeof clearChat === 'function') clearChat();
    chatHistory = [];
    loadedArchives = [];
    await usersAppRefresh();
    ensureEntityWindowContent(true);
    switchMainTab('chat');
    refreshSidebarEntities();
  } catch (e) {
    lg('err', 'Failed to release entity: ' + e.message);
  }
}

async function sidebarDeleteEntity(entityId, entityName) {
  if (!confirm('Delete entity "' + (entityName || entityId) + '"? This cannot be undone.')) return;
  try {
    const resp = await fetch('/api/entities/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId })
    });
    if (!resp.ok) throw new Error('Failed to delete entity');

    lg('ok', 'Deleted entity: ' + (entityName || entityId));

    // If we deleted the active entity, reset the UI
    if (entityId === currentEntityId) {
      currentEntityId = null;
      document.getElementById('entityName').textContent = '';
      document.getElementById('entityTraits').textContent = 'No entity loaded';
      const display = document.getElementById('entityDisplay');
      if (display) {
        display.classList.remove('loaded');
        display.innerHTML = '<div style="color:var(--td);text-align:center;padding:2rem"><div>No entity loaded</div></div>';
      }
      const delBtn = document.getElementById('deleteEntityBtn');
      if (delBtn) delBtn.style.display = 'none';
      if (typeof resetUserSwitcher === 'function') resetUserSwitcher();
      if (typeof clearChat === 'function') clearChat();
      chatHistory = [];
      loadedArchives = [];
    }

    ensureEntityWindowContent(true);
    refreshSidebarEntities();
  } catch (e) {
    lg('err', 'Failed to delete entity: ' + e.message);
  }
}

async function loadEntityList() {
  if (!guardEntityOperation('Load Entity')) return;
  const listEl = document.getElementById('entityList');
  const itemsEl = document.getElementById('entityListItems');
  
  listEl.style.display = listEl.style.display === 'none' ? 'block' : 'none';
  if (listEl.style.display === 'none') return;
  
  itemsEl.innerHTML = 'Loading...';
  
  try {
    const resp = await fetch('/api/entities');
    if (!resp.ok) throw new Error('Failed to fetch entities');
    const data = await resp.json();
    
    if (!data.entities || data.entities.length === 0) {
      itemsEl.innerHTML = '<div style="color:var(--td);padding:1rem;text-align:center">No entities found</div>';
      return;
    }
    
    itemsEl.innerHTML = '';
    data.entities.forEach(entity => {
      const div = document.createElement('div');
      div.className = 'entity-list-item';
      div.innerHTML = `
        <div class="entity-list-item-name">${entity.name || 'Unnamed'}</div>
        <div class="entity-list-item-traits">${entity.gender || 'unknown'} • ${entity.memoryCount || 0} memories</div>
      `;
      div.onclick = () => selectEntity(entity.id);
      itemsEl.appendChild(div);
    });
  } catch (e) {
    itemsEl.innerHTML = '<div style="color:var(--dn);padding:1rem">' + e.message + '</div>';
    lg('err', 'Failed to load entities: ' + e.message);
  }
}

async function selectEntity(entityId) {
  // Route through the checkout system
  await checkoutEntity(entityId);
  // Hide the settings entity list
  const listEl = document.getElementById('entityList');
  if (listEl) listEl.style.display = 'none';
}

function updateEntityDisplay(entity) {
  const display = document.getElementById('entityDisplay');
  const traits = (entity.personality_traits || []).join(', ');
  const intro = entity.introduction || 'No introduction available';
  const avatar = deriveEntityAvatar(entity.gender, entity.personality_traits, entity.name);
  
  display.classList.add('loaded');
  display.innerHTML = `
    <div class="entity-card">
      <div class="entity-avatar">${avatar}</div>
      <div class="entity-info">
        <div class="entity-name">${entity.name}</div>
        <div class="entity-traits">${traits}</div>
        <div class="entity-meta">${entity.memory_count || 0} memories • Created ${new Date(entity.created).toLocaleDateString()}</div>
      </div>
    </div>
    <div style="margin-top:1rem;padding:.75rem;background:var(--sf3);border-radius:8px;font-size:.8rem;color:var(--tm);border-left:2px solid var(--em);line-height:1.6">
      ${intro}
    </div>
  `;
}

async function runStartupResumeRecap(entityName, memData) {
  const summary = String(memData?.summary || '').trim();
  const recentMessages = Array.isArray(memData?.memory?.messages)
    ? memData.memory.messages.filter(m => m && (m.role === 'user' || m.role === 'assistant')).slice(-6)
    : [];

  const compactTranscript = recentMessages
    .map(m => `${m.role === 'user' ? 'User' : (entityName || 'Entity')}: ${String(m.content || '').replace(/\s+/g, ' ').trim().slice(0, 220)}`)
    .join('\n');

  const resumePrompt = [
    '[INTERNAL-RESUME]',
    `Entity ${entityName || 'Entity'} has just been reloaded.`,
    'Write a natural re-entry message to the user that:',
    '1) warmly acknowledges they are back,',
    '2) briefly summarizes what was last being discussed,',
    '3) invites the user to continue from there.',
    'Keep it concise: 4-6 sentences unless absolutely necessary to exceed.',
    '',
    'Last-memory summary:',
    summary || '(none)',
    '',
    'Recent transcript excerpt:',
    compactTranscript || '(none)'
  ].join('\n');

  const typingBubble = addChatBubble('assistant', '');
  const typingContent = typingBubble.querySelector('.chat-content') || typingBubble;
  typingContent.innerHTML = '<span class="typing"></span><span class="typing" style="animation-delay:.2s;margin-left:4px"></span><span class="typing" style="animation-delay:.4s;margin-left:4px"></span>';

  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: resumePrompt,
        chatHistory: []
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error('Resume recap failed: ' + errText.slice(0, 180));
    }

    const data = await resp.json();
    const recap = String(data?.response || '').trim();
    typingContent.textContent = recap || 'You are back. I remember where we left off, and we can continue from there.';
    if (recap) {
      chatHistory.push({ role: 'assistant', content: recap });
    }
    lg('ok', 'Startup recap generated from last saved memory context');
  } catch (err) {
    typingContent.textContent = 'You are back. I remember where we left off, and we can continue from there.';
    lg('warn', 'Startup recap fallback: ' + err.message);
  }
}

function resetChatForEntitySwitch(entityName, introText, memoryCount) {
  // Full reset so previous entity context/archives are not reused.
  if (typeof clearChat === 'function') clearChat();
  chatHistory = [];
  loadedArchives = [];
  contextStreamActive = false;
  subconsciousBootstrapped = false;

  const emptyEl = document.querySelector('.chat-empty');
  if (emptyEl) emptyEl.remove();

  if (memoryCount && memoryCount > 0) {
    // Existing entity with memories — run a startup recap through the brain pipeline.
    addChatBubble('system', 'Loading ' + entityName + '\'s memory chain...');
    fetch('/api/entity-last-memory')
      .then(r => r.ok ? r.json() : Promise.reject('fetch failed'))
      .then(memData => {
        if (memData.ok && memData.summary) {
          fetch('/api/memories/prewarm-doc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'entity-switch' })
          }).catch(() => {});
          runStartupResumeRecap(entityName, memData);
        } else {
          addChatBubble('assistant', 'Memory chain loaded. Ready to continue.');
        }
      })
      .catch(() => {
        addChatBubble('assistant', 'Memory chain loaded. Ready to continue.');
      });
  } else if (introText) {
    // Brand new entity — show introduction
    addChatBubble('assistant', introText);
  } else if (entityName) {
    addChatBubble('system', 'Switched to ' + entityName + '. Starting a fresh chat context.');
  }

  // Reload entity system prompt so the new entity's identity is used
  loadSystemPrompt();

  // Only auto-load archives if entity has established history (memoryCount > 1)
  // Skip for brand-new entities to prevent contamination from misplaced archives.
  if (activeConfig && memoryCount && memoryCount > 1) {
    setTimeout(() => { loadServerMemories(); }, 500);
  } else if (memoryCount === 0 || !memoryCount) {
    lg('info', 'Fresh entity - skipping archive auto-load');
  }
}

// ====================================
// Entity Creation State
// ====================================
// ============================================================
// Entity Creation — moved to client/create.html + client/js/create.js
// The functions below are minimal stubs so any surviving references
// don't throw ReferenceErrors.
// ============================================================

function showNewEntityDialog() {
  switchMainTab('creator');
}
// ====================================
function closeNewEntityDialog() { /* no-op: modal removed */ }
function selectEntityMode() {}
function creatorContinueToModeSelection() {}
function backToModeSelection() {}
function executeEntityCreation() {}
async function createNewEntity() { showNewEntityDialog(); }
// User Name Collection
// ====================================

async function checkAndPromptUserName() {
  try {
    const knownAccountName = (typeof getDisplayName === 'function' && getDisplayName())
      || (typeof getUsername === 'function' && getUsername())
      || '';
    if (knownAccountName) {
      return false;
    }

    // If entity already has user profiles, the new user switcher handles identity — skip old modal
    if (currentEntityId) {
      const usersResp = await fetch('/api/users');
      if (usersResp.ok) {
        const usersData = await usersResp.json();
        if (usersData.ok && Array.isArray(usersData.users) && usersData.users.length > 0) {
          return false;
        }
      }
    }

    const resp = await fetch('/api/persona');
    if (!resp.ok) return;
    
    const data = await resp.json();
    const persona = data.persona;
    
    // If no persona or userName is still default 'User', prompt for name
    if (!persona || !persona.userName || persona.userName === 'User') {
      showUserNameModal();
      return true; // Indicates name prompt was shown
    }
    return false;
  } catch (err) {
    console.error('Failed to check user name:', err);
    return false;
  }
}

function showUserNameModal() {
  const modal = document.getElementById('userNameModal');
  modal.style.display = 'flex';
  modal.classList.add('open');
  
  // Focus on input
  setTimeout(() => {
    const input = document.getElementById('userNameInput');
    input.focus();
    
    // Allow Enter key to submit
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveUserName();
      }
    };
  }, 300);
}

function closeUserNameModal() {
  const modal = document.getElementById('userNameModal');
  modal.classList.remove('open');
  setTimeout(() => modal.style.display = 'none', 200);
  document.getElementById('userNameInput').value = '';
}

async function saveUserName() {
  const input = document.getElementById('userNameInput');
  const name = input.value.trim();
  
  if (!name) {
    lg('err', 'Please enter your name');
    return;
  }
  
  try {
    // Get current persona
    const getResp = await fetch('/api/persona');
    let persona = { userName: 'User' };
    if (getResp.ok) {
      const getData = await getResp.json();
      if (getData.persona) persona = getData.persona;
    }
    
    // Update userName
    persona.userName = name;
    persona.userIdentity = persona.userIdentity || `I am chatting with ${name}`;
    
    // Save persona
    const saveResp = await fetch('/api/persona', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(persona)
    });
    
    if (!saveResp.ok) throw new Error('Failed to save persona');
    
    closeUserNameModal();
    lg('ok', `Nice to meet you, ${name}!`);
    addChatBubble('system', `✨ Got it! I'll remember you as ${name} from now on.`);
  } catch (err) {
    lg('err', 'Failed to save name: ' + err.message);
  }
}

function skipUserName() {
  closeUserNameModal();
  lg('info', 'You can set your name later in settings');
}

async function deleteCurrentEntity() {
  const name = document.getElementById('entityName').textContent.replace(' — ', '').trim();
  if (!name || !confirm('Delete entity "' + name + '"? This cannot be undone.')) return;
  
  try {
    // Extract entity ID from the current loaded entity via API
    const currentResp = await fetch('/api/entities/current');
    const currentData = await currentResp.json();
    if (!currentData.loaded || !currentData.entity.id) throw new Error('No entity loaded');
    const entityId = currentData.entity.id;
    
    const resp = await fetch('/api/entities/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId })
    });
    
    if (!resp.ok) throw new Error('Failed to delete entity');
    
    // Reset display
    document.getElementById('entityDisplay').classList.remove('loaded');
    document.getElementById('entityDisplay').innerHTML = `
      <div style="color:var(--td);text-align:center;padding:2rem">
        <div>No entity loaded</div>
        <div style="font-size:.85rem;margin-top:.5rem">Create a new one or load an existing entity below</div>
      </div>
    `;
    document.getElementById('entityName').textContent = '';
    document.getElementById('entityTraits').textContent = 'No entity loaded';
    document.getElementById('deleteEntityBtn').style.display = 'none';
    document.getElementById('entityList').style.display = 'none';
    currentEntityId = null;

    // Fully reset chat state so deleted entity is not kept in memory.
    if (typeof clearChat === 'function') clearChat();
    chatHistory = [];
    loadedArchives = [];
    contextStreamActive = false;
    subconsciousBootstrapped = false;
    
    lg('ok', 'Deleted entity: ' + name);

    // Force a clean app state after deletion.
    setTimeout(() => window.location.reload(), 120);
  } catch (e) {
    lg('err', 'Failed to delete entity: ' + e.message);
  }
}

// ============================================================
// SUBCONSCIOUS & DREAM CONFIG
// ============================================================

async function saveSubconsciousConfig() {
  let endpoint = document.getElementById('subApiEndpoint').value.trim();
  let key = document.getElementById('subApiKey').value.trim();
  const model = document.getElementById('subModel').value.trim();

  // Inherit from Main Chat if endpoint/key are empty
  if (!endpoint) endpoint = document.getElementById('apikeyEndpoint-main')?.value?.trim() || '';
  if (!key)      key      = document.getElementById('apikeyKey-main')?.value?.trim() || '';

  if (!endpoint || !key || !model) {
    lg('err', 'Model is required (endpoint & key inherited from Main Chat if empty)');
    return;
  }
  
  try {
    const resp = await fetch('/api/entity-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'subconscious',
        config: {
          endpoint,
          key,
          model,
          ollamaUrl: document.getElementById('ollamaUrl-subconscious').value.trim(),
          ollamaModel: document.getElementById('ollamaModel-subconscious').value.trim()
        }
      })
    });
    if (!resp.ok) throw new Error('Failed to save config');
    await refreshSavedConfig();
    const statusEl = document.getElementById('subConfigStatus');
    statusEl.style.display = 'block';
    setTimeout(() => statusEl.style.display = 'none', 3000);
    lg('ok', 'Subconscious global config saved');
  } catch (e) {
    lg('err', 'Failed to save subconscious config: ' + e.message);
  }
}
async function saveDreamConfig() {
  let endpoint = document.getElementById('dreamApiEndpoint').value.trim();
  let key = document.getElementById('dreamApiKey').value.trim();
  const model = document.getElementById('dreamModel').value.trim();

  // Inherit from Main Chat if endpoint/key are empty
  if (!endpoint) endpoint = document.getElementById('apikeyEndpoint-main')?.value?.trim() || '';
  if (!key)      key      = document.getElementById('apikeyKey-main')?.value?.trim() || '';

  if (!endpoint || !key || !model) {
    lg('err', 'Model is required (endpoint & key inherited from Main Chat if empty)');
    return;
  }
  
  try {
    const resp = await fetch('/api/entity-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'dream',
        config: {
          endpoint,
          key,
          model,
          ollamaUrl: document.getElementById('ollamaUrl-dreams').value.trim(),
          ollamaModel: document.getElementById('ollamaModel-dreams').value.trim()
        }
      })
    });
    if (!resp.ok) throw new Error('Failed to save config');
    await refreshSavedConfig();
    const statusEl = document.getElementById('dreamConfigStatus');
    statusEl.style.display = 'block';
    setTimeout(() => statusEl.style.display = 'none', 3000);
    lg('ok', 'Dream engine global config saved');
  } catch (e) {
    lg('err', 'Failed to save dream config: ' + e.message);
  }
}

async function saveOrchestratorConfig() {
  let endpoint = document.getElementById('orchApiEndpoint').value.trim();
  let key = document.getElementById('orchApiKey').value.trim();
  const model = document.getElementById('orchModel').value.trim();

  // Inherit from Main Chat if endpoint/key are empty
  if (!endpoint) endpoint = document.getElementById('apikeyEndpoint-main')?.value?.trim() || '';
  if (!key)      key      = document.getElementById('apikeyKey-main')?.value?.trim() || '';

  if (!endpoint || !key || !model) {
    lg('err', 'Model is required (endpoint & key inherited from Main Chat if empty)');
    return;
  }

  try {
    const resp = await fetch('/api/entity-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'orchestrator',
        config: {
          endpoint,
          key,
          model,
          ollamaUrl: document.getElementById('ollamaUrl-orchestrator').value.trim(),
          ollamaModel: document.getElementById('ollamaModel-orchestrator').value.trim()
        }
      })
    });
    if (!resp.ok) throw new Error('Failed to save config');
    await refreshSavedConfig();
    const statusEl = document.getElementById('orchConfigStatus');
    statusEl.style.display = 'block';
    setTimeout(() => statusEl.style.display = 'none', 3000);
    lg('ok', 'Orchestrator global config saved');
  } catch (e) {
    lg('err', 'Failed to save orchestrator config: ' + e.message);
  }
}

// Save main provider config (example for API Key panel)
async function saveMainProviderConfig() {
  const endpoint = document.getElementById('apikeyEndpoint-main').value.trim();
  const key = document.getElementById('apikeyKey-main').value.trim();
  const model = document.getElementById('apikeyModel-main').value.trim();
  const ollamaUrl = document.getElementById('ollamaUrl-main').value.trim();
  const ollamaModel = document.getElementById('ollamaModel-main').value.trim();
  try {
    const resp = await fetch('/api/entity-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'main',
        config: { endpoint, key, model, ollamaUrl, ollamaModel }
      })
    });
    if (!resp.ok) throw new Error('Failed to save config');
    await refreshSavedConfig();
    lg('ok', 'Main provider global config saved');
  } catch (e) {
    lg('err', 'Failed to save main provider config: ' + e.message);
  }
}

/* ── Unified Save All LLM Config ── */
async function saveAllLLMConfig() {
  const mainKey      = document.getElementById('apikeyKey-main')?.value?.trim() || '';
  const mainEndpoint = document.getElementById('apikeyEndpoint-main')?.value?.trim() || '';

  // If sub/dream/orch key or endpoint is empty, inherit from main
  for (const [keyId, epId] of [
    ['subApiKey',   'subApiEndpoint'],
    ['dreamApiKey', 'dreamApiEndpoint'],
    ['orchApiKey',  'orchApiEndpoint']
  ]) {
    const kEl = document.getElementById(keyId);
    const eEl = document.getElementById(epId);
    if (kEl && !kEl.value.trim() && mainKey)      kEl.value = mainKey;
    if (eEl && !eEl.value.trim() && mainEndpoint)  eEl.value = mainEndpoint;
  }

  const statusEl = document.getElementById('allLlmConfigStatus');
  try {
    await saveMainProviderConfig();
    await saveSubconsciousConfig();
    await saveDreamConfig();
    await saveOrchestratorConfig();
    if (statusEl) { statusEl.style.display = 'inline'; setTimeout(() => statusEl.style.display = 'none', 4000); }
    lg('ok', 'All LLM configs saved');
  } catch (e) {
    lg('err', 'Error saving LLM configs: ' + e.message);
  }
}

// ============================================================
// SYSTEM HEALTH & MAINTENANCE
// ============================================================

async function repairMemoryLogs() {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Repairing...';
  
  const statusEl = document.getElementById('healStatus');
  statusEl.style.display = 'block';
  statusEl.textContent = 'Running self-heal...';
  
  try {
    const resp = await fetch('/api/entities/heal', { method: 'POST' });
    if (!resp.ok) throw new Error('Failed to run memory heal');
    
    const data = await resp.json();
    statusEl.innerHTML = `
      ✓ Repair complete<br>
      Repaired: ${data.repaired} files<br>
      Errors: ${data.errors}
    `;
    lg('ok', 'Memory self-heal: ' + data.repaired + ' repaired');
  } catch (e) {
    statusEl.innerHTML = '✗ ' + e.message;
    lg('err', 'Memory heal failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run Self-Heal';
  }
}

async function showMemoryStats() {
  try {
    const resp = await fetch('/api/memory-stats');
    if (!resp.ok) throw new Error('Failed to fetch stats');
    const stats = await resp.json();
    
    addChatBubble('system', 'Memory Statistics:\n\n' +
      '📊 Total memories: ' + stats.totalMemories + '\n' +
      '💾 Storage size: ' + formatBytes(stats.storageSize) + '\n' +
      '📂 Memory logs: ' + stats.memoryLogs + '\n' +
      '✓ Healthy logs: ' + stats.healthyLogs + '\n' +
      '⚠ Corrupted logs: ' + stats.corruptedLogs);
  } catch (e) {
    lg('err', 'Failed to fetch memory stats: ' + e.message);
  }
}

async function rebuildTraceGraph() {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Rebuilding...';
  
  try {
    const resp = await fetch('/api/trace-rebuild', { method: 'POST' });
    if (!resp.ok) throw new Error('Failed to rebuild');
    
    const data = await resp.json();
    addChatBubble('system', 'Trace graph rebuilt:\n' +
      '🔗 Connections: ' + data.connections + '\n' +
      '✓ Complete');
    lg('ok', 'Trace graph rebuilt with ' + data.connections + ' connections');
  } catch (e) {
    lg('err', 'Failed to rebuild trace graph: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Rebuild';
  }
}

async function runSystemBackup(buttonEl) {
  const statusEl = document.getElementById('backupStatus');
  const inputEl = document.getElementById('backupTargetFolder');
  const targetFolder = (inputEl?.value || '').trim();

  if (!targetFolder) {
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.textContent = 'Please enter a backup target folder path.';
    }
    return;
  }

  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.textContent = 'Creating Backup...';
  }
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.textContent = 'Creating backup...';
  }

  try {
    const resp = await fetch('/api/system/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetFolder })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) throw new Error(data.error || 'Backup failed');

    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.innerHTML = `✓ Backup created:<br>${data.backupDir}`;
    }
    lg('ok', 'Backup created at ' + data.backupDir);
  } catch (e) {
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.textContent = '✗ ' + e.message;
    }
    lg('err', 'Backup failed: ' + e.message);
  } finally {
    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.textContent = 'Create Backup';
    }
  }
}

async function runSystemRestore(buttonEl) {
  const statusEl = document.getElementById('restoreStatus');
  const inputEl = document.getElementById('restoreSourceFolder');
  const sourceFolder = (inputEl?.value || '').trim();

  if (!sourceFolder) {
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.textContent = 'Please enter a backup source folder path.';
    }
    return;
  }

  const ok = window.confirm('Restore will overwrite current runtime data (config, server data, entities, memories). Continue?');
  if (!ok) return;

  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.textContent = 'Restoring...';
  }
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.textContent = 'Restoring backup...';
  }

  try {
    const resp = await fetch('/api/system/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceFolder })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) throw new Error(data.error || 'Restore failed');

    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.innerHTML = `✓ Restore complete.<br>Safety snapshot: ${data.safetySnapshot}<br>Reload page now. Server restart recommended.`;
    }
    lg('ok', 'Restore completed from ' + data.restoredFrom);
  } catch (e) {
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.textContent = '✗ ' + e.message;
    }
    lg('err', 'Restore failed: ' + e.message);
  } finally {
    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.textContent = 'Restore Backup';
    }
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Entity display is handled by refreshSidebarEntities() on startup.
// No auto-load — user must preview and check out an entity first.

// Brain status polling (fallback — SSE handles real-time updates)
let brainPollHandle = null;
function startBrainPoll() {
  if (brainPollHandle) return;
  // Only poll infrequently as SSE provides real-time updates
  pollBrainStatus();
  brainPollHandle = setInterval(pollBrainStatus, 60000); // Every 60s as fallback
}
async function pollBrainStatus() {
  try {
    const resp = await fetch('/api/brain/status');
    if (!resp.ok) return;
    const data = await resp.json();
    runtimeTelemetry.brainRunning = !!data.running;
    runtimeTelemetry.brainCycleCount = Number(data.cycleCount || 0);
    const el = document.getElementById('brainStatus');
    const label = document.getElementById('brainLabel');
    if (data.running) {
      el.classList.add('active');
      label.textContent = 'Cycle ' + data.cycleCount;
    } else {
      el.classList.remove('active');
      label.textContent = 'Idle';
    }
    if (typeof updateDeepSleepBadge === 'function') {
      updateDeepSleepBadge(data.cyclesUntilDeepSleep);
    }
  } catch (e) { /* ignore */ }
}

// Startup is triggered from DOMContentLoaded handler above.

// ============================================================
// USER SWITCHER — Multi-user management per entity
// ============================================================

let _userPanelOpen = false;
let _userPanelOutsideHandler = null;

function toggleUserPanel() {
  if (_userPanelOpen) closeUserPanel();
  else openUserPanel();
}

async function openUserPanel() {
  const panel = document.getElementById('userPanel');
  const btn = document.getElementById('userSwitcherBtn');
  if (!panel || !btn) return;
  // Portal: move panel to document.body so it escapes overflow:hidden ancestors
  if (panel.parentElement !== document.body) {
    document.body.appendChild(panel);
  }
  const rect = btn.getBoundingClientRect();
  panel.style.position = 'fixed';
  panel.style.top = (rect.bottom + 6) + 'px';
  panel.style.right = (window.innerWidth - rect.right) + 'px';
  panel.style.left = 'auto';
  panel.style.display = 'block';
  _userPanelOpen = true;
  await renderUserPanelList();
  if (_userPanelOutsideHandler) document.removeEventListener('mousedown', _userPanelOutsideHandler);
  _userPanelOutsideHandler = (e) => {
    const p = document.getElementById('userPanel');
    const b = document.getElementById('userSwitcherBtn');
    if (p && !p.contains(e.target) && b && !b.contains(e.target)) closeUserPanel();
  };
  setTimeout(() => document.addEventListener('mousedown', _userPanelOutsideHandler), 50);
}

function closeUserPanel() {
  const panel = document.getElementById('userPanel');
  if (panel) panel.style.display = 'none';
  _userPanelOpen = false;
  if (_userPanelOutsideHandler) {
    document.removeEventListener('mousedown', _userPanelOutsideHandler);
    _userPanelOutsideHandler = null;
  }
}

const _FEELING_EMOJI = {
  loathing:'😤', hate:'😡', dislike:'😒', cold:'🧊', wary:'😑',
  neutral:'😶', indifferent:'🫥', warm:'🙂', like:'😊', fond:'🥰',
  care:'💚', trust:'🤝', love:'❤️', devoted:'💜'
};

function _trustBar(trust) {
  const filled = Math.round((trust || 0) * 5);
  const bar = '█'.repeat(filled) + '░'.repeat(5 - filled);
  const pct = Math.round((trust || 0) * 100);
  const col = trust < 0.3 ? '#ef4444' : trust < 0.6 ? '#f59e0b' : '#10b981';
  return '<span title="Trust ' + pct + '%" style="font-family:monospace;font-size:.6rem;color:' + col + ';letter-spacing:-.5px">' + bar + '</span>';
}

async function renderUserPanelList() {
  const list = document.getElementById('userPanelList');
  if (!list) return;
  try {
    const [usersResp, relResp] = await Promise.all([
      fetch('/api/users'),
      fetch('/api/relationships').catch(() => null)
    ]);
    if (!usersResp.ok) throw new Error('Failed to load users');
    const data = await usersResp.json();
    const users = data.users || [];
    const activeId = data.activeUserId;

    // Build relationship map userId -> rel
    const relMap = {};
    if (relResp && relResp.ok) {
      const relData = await relResp.json().catch(() => ({}));
      (relData.relationships || []).forEach(r => { relMap[r.userId] = r; });
    }

    if (users.length === 0) {
      list.innerHTML = '<div style="color:var(--text-tertiary);font-size:.75rem;text-align:center;padding:8px 0">No users yet — add one below</div>';
      return;
    }
    list.innerHTML = '';
    users.forEach(u => {
      const isActive = u.id === activeId;
      const rel = relMap[u.id];
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 4px;border-radius:5px;margin-bottom:2px;' + (isActive ? 'background:rgba(255,255,255,.05)' : '');
      const safeName = escapeHtmlInner(u.name || 'User');
      const safeInfo = u.info ? escapeHtmlInner(u.info) : '';

      // Relationship badge: only show if entity has met this user
      let relBadge = '';
      if (rel && rel.interactionCount > 0) {
        const emoji = _FEELING_EMOJI[rel.feeling] || '😶';
        relBadge =
          '<div title="Feeling: ' + escapeHtmlInner(rel.feeling || 'neutral') + '\nInteractions: ' + (rel.interactionCount || 0) + '" ' +
            'style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;gap:1px;cursor:default">' +
            '<span style="font-size:.85rem;line-height:1">' + emoji + '</span>' +
            _trustBar(rel.trust) +
          '</div>';
      }

      row.innerHTML =
        '<div style="width:26px;height:26px;border-radius:50%;background:#6d28d9;display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:600;flex-shrink:0;color:#fff">' +
          safeName[0].toUpperCase() +
        '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:.78rem;font-weight:' + (isActive ? '600' : '400') + ';color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
            safeName + (isActive ? ' <span style="color:#10b981;font-size:.6rem;font-weight:400">● active</span>' : '') +
          '</div>' +
          (safeInfo ? '<div style="font-size:.65rem;color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + safeInfo + '</div>' : '') +
        '</div>' +
        relBadge +
        (isActive
          ? '<button onclick="clearUserSwitch()" title="Clear active user" style="background:none;border:1px solid var(--border-default);color:var(--text-tertiary);font-size:.62rem;border-radius:3px;cursor:pointer;padding:2px 5px;flex-shrink:0">✕ clear</button>'
          : '<button onclick="switchToUser(\'' + u.id + '\')" style="background:#3b82f6;border:none;color:#fff;font-size:.65rem;border-radius:3px;cursor:pointer;padding:2px 6px;flex-shrink:0">Switch</button>');
      list.appendChild(row);
    });
  } catch (err) {
    list.innerHTML = '<div style="color:var(--dn);font-size:.75rem;padding:4px">' + err.message + '</div>';
  }
}

async function switchToUser(userId) {
  try {
    const resp = await fetch('/api/users/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    if (!resp.ok) throw new Error('Failed to switch user');
    const data = await resp.json();
    const name = data.user ? data.user.name : userId;
    const label = document.getElementById('activeUserLabel');
    if (label) label.textContent = name;
    await renderUserPanelList();
    lg('ok', 'Switched to: ' + name);
  } catch (err) {
    lg('err', 'Switch failed: ' + err.message);
  }
}

async function clearUserSwitch() {
  try {
    await fetch('/api/users/active', { method: 'DELETE' });
    const label = document.getElementById('activeUserLabel');
    if (label) label.textContent = (typeof getUsername === 'function' && getUsername()) || 'User';
    await renderUserPanelList();
    lg('info', 'Active user cleared');
  } catch (err) {
    lg('err', 'Clear failed: ' + err.message);
  }
}

async function addAndSwitchUser() {
  const nameEl = document.getElementById('newUserName');
  const infoEl = document.getElementById('newUserInfo');
  const name = nameEl ? nameEl.value.trim() : '';
  if (!name) { lg('err', 'Enter a name for the new user'); return; }
  const info = infoEl ? infoEl.value.trim() : '';
  try {
    const createResp = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, info })
    });
    if (!createResp.ok) throw new Error('Failed to create user');
    const created = await createResp.json();
    const userId = created.user && created.user.id;
    if (!userId) throw new Error('No user id returned');

    const switchResp = await fetch('/api/users/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    if (!switchResp.ok) throw new Error('Failed to set active user');

    if (nameEl) nameEl.value = '';
    if (infoEl) infoEl.value = '';
    const label = document.getElementById('activeUserLabel');
    if (label) label.textContent = name;
    await renderUserPanelList();
    lg('ok', 'Added and switched to: ' + name);
    if (typeof addChatBubble === 'function') addChatBubble('system', '\u{1F464} Chatting as ' + name);
  } catch (err) {
    lg('err', 'Add user failed: ' + err.message);
  }
}

async function initUserSwitcher() {
  const btn = document.getElementById('userSwitcherBtn');
  if (!btn) return;
  try {
    // If no user profiles exist yet and we have a registered display name, auto-create one
    const listResp = await fetch('/api/users');
    if (listResp.ok) {
      const listData = await listResp.json();
      const displayName = (typeof getDisplayName === 'function' && getDisplayName()) || '';
      if (listData.users && listData.users.length === 0 && displayName) {
        const info = (typeof getAccountInfo === 'function' && getAccountInfo()) || '';
        const createResp = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: displayName, info })
        });
        if (createResp.ok) {
          const created = await createResp.json();
          if (created.ok && created.user) {
            await fetch('/api/users/active', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: created.user.id })
            });
          }
        }
      }
    }

    const resp = await fetch('/api/users/active');
    if (resp.ok) {
      const data = await resp.json();
      const label = document.getElementById('activeUserLabel');
      if (data.user && data.user.name) {
        if (label) label.textContent = data.user.name;
      } else {
        if (label) label.textContent = (typeof getDisplayName === 'function' && getDisplayName()) || (typeof getUsername === 'function' && getUsername()) || 'User';
      }
    }
  } catch (_) {}
  btn.style.display = 'inline-flex';
  await usersAppRefresh();
}

function resetUserSwitcher() {
  const btn = document.getElementById('userSwitcherBtn');
  if (btn) btn.style.display = 'none';
  const label = document.getElementById('activeUserLabel');
  if (label) label.textContent = 'User';
  closeUserPanel();
}

// ============================================================
// USERS APP — Windowed user profile management
// ============================================================

function _usersAppSetStatus(text, type) {
  const el = document.getElementById('usersAppStatus');
  if (!el) return;
  el.textContent = text;
  el.style.color = type === 'err' ? 'var(--dn)' : (type === 'ok' ? 'var(--em)' : 'var(--text-secondary)');
}

async function usersAppRefresh() {
  const listEl = document.getElementById('usersAppList');
  if (!listEl) return;

  if (!currentEntityId) {
    listEl.innerHTML = '<div class="text-secondary-c text-sm-c">No active entity loaded. Check out an entity first.</div>';
    _usersAppSetStatus('No active entity', 'info');
    return;
  }

  try {
    const [usersResp, activeResp] = await Promise.all([
      fetch('/api/users'),
      fetch('/api/users/active')
    ]);
    if (!usersResp.ok) throw new Error('Failed to load users');

    const usersData = await usersResp.json();
    const activeData = activeResp.ok ? await activeResp.json() : {};
    const users = usersData.users || [];
    const activeId = usersData.activeUserId || activeData.user?.id || null;

    if (!users.length) {
      listEl.innerHTML = '<div class="text-secondary-c text-sm-c">No users yet. Add one above.</div>';
      _usersAppSetStatus('No users found', 'info');
      return;
    }

    listEl.innerHTML = users.map((u) => {
      const isActive = u.id === activeId;
      const safeName = escapeHtmlInner(u.name || 'User');
      const safeInfo = escapeHtmlInner(u.info || '');
      return ''
        + '<div class="config-card" style="padding:10px;display:flex;align-items:center;gap:10px">'
        +   '<div style="width:30px;height:30px;border-radius:50%;background:#6d28d9;display:flex;align-items:center;justify-content:center;font-weight:600;color:#fff">' + safeName.charAt(0).toUpperCase() + '</div>'
        +   '<div style="flex:1;min-width:0">'
        +     '<div style="font-size:.82rem;font-weight:600">' + safeName + (isActive ? ' <span style="color:var(--em);font-weight:400">● active</span>' : '') + '</div>'
        +     '<div class="text-xs-c text-secondary-c" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (safeInfo || 'No details') + '</div>'
        +   '</div>'
        +   (isActive
              ? '<button class="btn bg text-xs-c" onclick="usersAppClearActive()">Clear</button>'
              : '<button class="btn bp text-xs-c" onclick="usersAppSetActive(\'' + u.id.replace(/'/g, "\\'") + '\')">Set Active</button>')
        +   '<button class="btn br text-xs-c" onclick="usersAppDelete(\'' + u.id.replace(/'/g, "\\'") + '\', \'' + safeName.replace(/'/g, "\\'") + '\')">Delete</button>'
        + '</div>';
    }).join('');

    _usersAppSetStatus('Loaded ' + users.length + ' user profile' + (users.length === 1 ? '' : 's'), 'ok');
  } catch (err) {
    listEl.innerHTML = '<div class="text-sm-c" style="color:var(--dn)">' + err.message + '</div>';
    _usersAppSetStatus('Failed to load users', 'err');
  }
}

async function usersAppCreateUser() {
  if (!currentEntityId) {
    _usersAppSetStatus('Load an entity first', 'err');
    return;
  }
  const nameEl = document.getElementById('usersAppNewName');
  const infoEl = document.getElementById('usersAppNewInfo');
  const name = (nameEl?.value || '').trim();
  const info = (infoEl?.value || '').trim();
  if (!name) {
    _usersAppSetStatus('User name is required', 'err');
    return;
  }

  try {
    const resp = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, info })
    });
    if (!resp.ok) throw new Error('Failed to create user');
    const data = await resp.json();
    if (!data.ok || !data.user?.id) throw new Error(data.error || 'Invalid create response');

    if (nameEl) nameEl.value = '';
    if (infoEl) infoEl.value = '';
    _usersAppSetStatus('User created: ' + name, 'ok');
    await usersAppSetActive(data.user.id);
    await renderUserPanelList();
  } catch (err) {
    _usersAppSetStatus(err.message, 'err');
  }
}

async function usersAppSetActive(userId) {
  try {
    const resp = await fetch('/api/users/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    if (!resp.ok) throw new Error('Failed to set active user');
    const data = await resp.json();
    const name = data.user?.name || 'User';
    const label = document.getElementById('activeUserLabel');
    if (label) label.textContent = name;
    _usersAppSetStatus('Active user: ' + name, 'ok');
    await usersAppRefresh();
    await renderUserPanelList();
  } catch (err) {
    _usersAppSetStatus(err.message, 'err');
  }
}

async function usersAppClearActive() {
  try {
    const resp = await fetch('/api/users/active', { method: 'DELETE' });
    if (!resp.ok) throw new Error('Failed to clear active user');
    const label = document.getElementById('activeUserLabel');
    if (label) label.textContent = (typeof getDisplayName === 'function' && getDisplayName()) || 'User';
    _usersAppSetStatus('Active user cleared', 'ok');
    await usersAppRefresh();
    await renderUserPanelList();
  } catch (err) {
    _usersAppSetStatus(err.message, 'err');
  }
}

async function usersAppDelete(userId, name) {
  if (!confirm('Delete user "' + (name || userId) + '"?')) return;
  try {
    const resp = await fetch('/api/users/' + encodeURIComponent(userId), { method: 'DELETE' });
    if (!resp.ok) throw new Error('Failed to delete user');
    _usersAppSetStatus('Deleted user: ' + (name || userId), 'ok');
    await usersAppRefresh();
    await renderUserPanelList();
  } catch (err) {
    _usersAppSetStatus(err.message, 'err');
  }
}

/* ╔══════════════════════════════════════════════════════════════╗
   ║  CONTEXT MENU SYSTEM                                       ║
   ║  Custom right-click menus replacing browser default         ║
   ╚══════════════════════════════════════════════════════════════╝ */

const ctxMenu = (function() {
  const el = document.getElementById('ctxMenu');
  if (!el) return { show() {}, hide() {} };

  function hide() {
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '';
  }

  function show(x, y, items) {
    el.innerHTML = '';
    items.forEach(function(item) {
      if (item === '---') {
        const sep = document.createElement('div');
        sep.className = 'ctx-menu-sep';
        el.appendChild(sep);
        return;
      }
      const btn = document.createElement('button');
      btn.className = 'ctx-menu-item' + (item.danger ? ' danger' : '');
      btn.setAttribute('role', 'menuitem');
      btn.innerHTML = (item.icon ? '<span class="ctx-icon">' + item.icon + '</span>' : '') + item.label;
      btn.onclick = function(e) {
        e.stopPropagation();
        hide();
        if (item.action) item.action();
      };
      el.appendChild(btn);
    });

    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');

    // Position — keep within viewport
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const menuW = el.offsetWidth;
    const menuH = el.offsetHeight;
    const finalX = x + menuW > vw ? Math.max(4, vw - menuW - 4) : x;
    const finalY = y + menuH > vh ? Math.max(4, vh - menuH - 4) : y;
    el.style.left = finalX + 'px';
    el.style.top = finalY + 'px';
  }

  // Close on any click outside
  document.addEventListener('click', function() { hide(); });
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') hide(); });

  return { show: show, hide: hide };
})();

// Block browser context menu everywhere inside the app shell
document.addEventListener('contextmenu', function(e) {
  const target = e.target;

  // Allow context menu on actual <input> and <textarea> for text editing
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

  e.preventDefault();

  // ── Pinned app on taskbar ──
  const pinnedBtn = target.closest('.os-pinned-app, .os-dash-app, .os-overflow-app');
  if (pinnedBtn) {
    const tab = pinnedBtn.getAttribute('data-tab');
    const app = getWindowApp(tab);
    if (!app) return;
    ctxMenu.show(e.clientX, e.clientY, [
      { icon: '📌', label: 'Unpin from Taskbar', action: function() { togglePinnedApp(tab); } },
      { icon: app.icon, label: 'Open ' + app.label, action: function() { switchMainTab(tab); } },
      '---',
      { icon: '📄', label: 'Create Shortcut on Desktop', action: function() { vfs.createDesktopShortcut(tab); } }
    ]);
    return;
  }

  // ── Desktop shortcut (static) ──
  const shortcut = target.closest('.os-shortcut');
  if (shortcut) {
    const tab = shortcut.getAttribute('data-tab');
    ctxMenu.show(e.clientX, e.clientY, [
      { icon: '🚀', label: 'Open', action: function() { switchMainTab(tab); } },
      { icon: '📌', label: isPinnedApp(tab) ? 'Unpin from Taskbar' : 'Pin to Taskbar', action: function() { togglePinnedApp(tab); } }
    ]);
    return;
  }

  // ── Desktop file / folder ──
  const desktopFile = target.closest('.desktop-file');
  if (desktopFile) {
    const path = desktopFile.getAttribute('data-path');
    const entry = vfs.stat(path);
    if (!entry) return;
    const items = [];
    if (entry.type === 'folder') {
      items.push({ icon: '📂', label: 'Open Folder', action: function() { vfs.openFolder(path); } });
    } else if (entry.type === 'shortcut' && entry.launchTab) {
      items.push({ icon: '🚀', label: 'Open', action: function() { switchMainTab(entry.launchTab); } });
    } else {
      items.push({ icon: '📄', label: 'Open', action: function() { vfs.openFile(path); } });
    }
    items.push('---');
    items.push({ icon: '✏️', label: 'Rename', action: function() { vfs.beginRename(desktopFile); } });
    items.push({ icon: '🗑️', label: 'Delete', danger: true, action: function() { vfs.remove(path); } });
    ctxMenu.show(e.clientX, e.clientY, items);
    return;
  }

  // ── Empty desktop area ──
  const desktopArea = target.closest('.os-desktop-files, .os-home');
  if (desktopArea) {
    ctxMenu.show(e.clientX, e.clientY, [
      { icon: '📄', label: 'New Document', action: function() { vfs.createOnDesktop('document'); } },
      { icon: '📁', label: 'New Folder', action: function() { vfs.createOnDesktop('folder'); } },
      { icon: '📝', label: 'New Note', action: function() { vfs.createOnDesktop('note'); } },
      '---',
      { icon: '🔄', label: 'Refresh Desktop', action: function() { vfs.renderDesktop(); } }
    ]);
    return;
  }

  // ── Start menu app items ──
  const startAppItem = target.closest('.os-start-app-item, .os-start-pinned-app');
  if (startAppItem) {
    const tab = startAppItem.getAttribute('data-tab');
    const app = getWindowApp(tab);
    if (!app) return;
    ctxMenu.show(e.clientX, e.clientY, [
      { icon: app.icon, label: 'Open ' + app.label, action: function() { switchMainTab(tab); } },
      { icon: '📌', label: isPinnedApp(tab) ? 'Unpin from Taskbar' : 'Pin to Taskbar', action: function() { togglePinnedApp(tab); } },
      { icon: '📄', label: 'Create Desktop Shortcut', action: function() { vfs.createDesktopShortcut(tab); } }
    ]);
    return;
  }

  // ── Window titlebar ──
  const titlebar = target.closest('.wm-titlebar');
  if (titlebar) {
    const appEl = titlebar.closest('.app');
    if (!appEl) return;
    const tab = appEl.getAttribute('data-tab');
    const app = getWindowApp(tab);
    if (!app) return;
    ctxMenu.show(e.clientX, e.clientY, [
      { icon: '📌', label: isPinnedApp(tab) ? 'Unpin from Taskbar' : 'Pin to Taskbar', action: function() { togglePinnedApp(tab); } },
      { icon: '📄', label: 'Create Desktop Shortcut', action: function() { vfs.createDesktopShortcut(tab); } },
      '---',
      { icon: '✕', label: 'Close Window', danger: true, action: function() { closeWindow(tab); } }
    ]);
    return;
  }

  // ── Fallback: Desktop background (body, empty areas) ──
  ctxMenu.show(e.clientX, e.clientY, [
    { icon: '📄', label: 'New Document', action: function() { vfs.createOnDesktop('document'); } },
    { icon: '📁', label: 'New Folder', action: function() { vfs.createOnDesktop('folder'); } },
    { icon: '📝', label: 'New Note', action: function() { vfs.createOnDesktop('note'); } },
    '---',
    { icon: '🔄', label: 'Refresh Desktop', action: function() { vfs.renderDesktop(); } }
  ]);
});


/* ╔══════════════════════════════════════════════════════════════╗
   ║  VIRTUAL FILE SYSTEM (VFS)                                 ║
   ║  localStorage-backed file/folder tree with desktop surface  ║
   ╚══════════════════════════════════════════════════════════════╝ */

const vfs = (function() {
  const BASE = '/api/vfs';

  // Local stat cache — populated after each renderDesktop() so sync stat() works
  // for context-menu handlers that fire on already-rendered icons.
  let _cache = {};

  function apiPost(endpoint, body) {
    return fetch(BASE + '/' + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function(r) { return r.json(); });
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  // Synchronous stat from local cache (populated by renderDesktop)
  function stat(virtualPath) {
    return _cache[virtualPath] || null;
  }

  async function list(folderPath) {
    const r = await fetch(BASE + '/list?' + new URLSearchParams({ path: folderPath }));
    const data = await r.json();
    if (!data.ok) return [];
    return data.entries || [];
  }

  async function createEntry(parentPath, name, type, extra) {
    const safeName = name.replace(/[<>:"/\\|?*]/g, '_').substring(0, 64);
    const virtPath = parentPath === '/' ? '/' + safeName : parentPath + '/' + safeName;
    try {
      let result;
      if (type === 'folder') {
        result = await apiPost('mkdir', {
          path: virtPath,
          meta: Object.assign({ type: 'folder' }, extra || {}),
          dedup: true
        });
      } else {
        result = await apiPost('write', {
          path: virtPath,
          content: (extra && extra.content) || '',
          meta: Object.assign({ type: type }, extra || {}),
          dedup: true
        });
      }
      await renderDesktop();
      return result.path;
    } catch (e) {
      console.error('[VFS] createEntry failed:', e);
      return null;
    }
  }

  async function remove(virtualPath) {
    if (virtualPath === '/desktop' || virtualPath === '/') return;
    try {
      await apiPost('delete', { path: virtualPath });
      await renderDesktop();
    } catch (e) {
      console.error('[VFS] remove failed:', e);
    }
  }

  async function rename(virtualPath, newName) {
    const safeName = newName.replace(/[<>:"/\\|?*]/g, '_').substring(0, 64);
    if (!safeName) return virtualPath;
    const parts = virtualPath.split('/');
    parts.pop();
    const parentPath = parts.join('/') || '/desktop';
    const newPath = parentPath + '/' + safeName;
    if (newPath === virtualPath) return virtualPath;
    try {
      const result = await apiPost('move', { from: virtualPath, to: newPath });
      await renderDesktop();
      return result.path || newPath;
    } catch (e) {
      console.error('[VFS] rename failed:', e);
      return virtualPath;
    }
  }

  async function getContent(virtualPath) {
    try {
      const r = await fetch(BASE + '/read?' + new URLSearchParams({ path: virtualPath }));
      if (!r.ok) return '';
      return r.text();
    } catch (_) { return ''; }
  }

  async function setContent(virtualPath, content) {
    try { await apiPost('write', { path: virtualPath, content }); } catch (_) {}
  }

  async function saveMeta(virtualPath, metaPatch) {
    try { await apiPost('meta', { path: virtualPath, meta: metaPatch }); } catch (_) {}
  }

  // ── Desktop rendering ──────────────────────────────────────────────────────

  function fileAccent(entry) {
    if (entry.type === 'shortcut') {
      var app = getWindowApp(entry.launchTab);
      return app ? app.accent : 'green';
    }
    if (entry.type === 'folder') return 'gold';
    if (entry.fileExt === 'note' || entry.fileExt === 'txt') return 'cyan';
    return 'indigo';
  }

  function fileIcon(entry) {
    if (entry.type === 'shortcut') {
      var app = getWindowApp(entry.launchTab);
      return app ? app.icon : '🔗';
    }
    if (entry.type === 'folder') return '📁';
    if (entry.fileExt === 'note') return '📝';
    return '📄';
  }

  var desktopSelection = null;
  var ICON_W = 96, ICON_H = 112, ICON_GAP = 8, SNAP = 8;

  function snap(v) { return Math.round(v / SNAP) * SNAP; }

  // Delete key removes selected desktop file
  document.addEventListener('keydown', function(e) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && desktopSelection) {
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement && document.activeElement.isContentEditable)) return;
      var p = desktopSelection.getAttribute('data-path');
      if (p) { desktopSelection = null; remove(p); }
    }
  });

  function autoPos(index, hostW, hostH) {
    var cols = Math.max(1, Math.floor((hostW - 48) / (ICON_W + ICON_GAP)));
    var col = index % cols;
    var row = Math.floor(index / cols);
    // anchor from bottom-left
    return {
      x: 24 + col * (ICON_W + ICON_GAP),
      y: Math.max(0, hostH - ICON_H - 8 - row * (ICON_H + ICON_GAP))
    };
  }

  async function renderDesktop() {
    var host = document.getElementById('desktopFilesArea');
    if (!host) return;

    var items;
    try { items = await list('/desktop'); } catch (_) { items = []; }

    // Refresh sync stat cache
    _cache = {};
    items.forEach(function(item) { _cache[item.path] = item; });

    host.innerHTML = '';

    // One-time host listeners
    if (!host._bound) {
      host._bound = true;
      host.addEventListener('click', function(e) {
        if (e.target === host) {
          if (desktopSelection) desktopSelection.classList.remove('selected');
          desktopSelection = null;
        }
      });
    }

    var hostRect = host.getBoundingClientRect();
    var hostW = hostRect.width || window.innerWidth;
    var hostH = hostRect.height || (window.innerHeight - 72);

    items.forEach(function(item, index) {
      var pos = item.pos || autoPos(index, hostW, hostH);

      var el = document.createElement('div');
      el.className = 'desktop-file';
      el.setAttribute('data-path', item.path);
      el.setAttribute('data-type', item.type);
      el.style.left = pos.x + 'px';
      el.style.top  = pos.y + 'px';
      var accent = fileAccent(item);
      el.innerHTML =
        '<div class="desktop-file-icon" data-accent="' + accent + '">' + fileIcon(item) + '</div>' +
        '<div class="desktop-file-name">' + item.name + '</div>';

      // Double-click to open
      el.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        if (item.type === 'shortcut' && item.launchTab) {
          switchMainTab(item.launchTab);
        } else if (item.type === 'folder') {
          openFolder(item.path);
        } else {
          openFile(item.path);
        }
      });

      // Pointer drag for free-position move
      el.addEventListener('pointerdown', function(e) {
        if (e.button !== 0) return;
        e.stopPropagation();

        // Select
        if (desktopSelection) desktopSelection.classList.remove('selected');
        el.classList.add('selected');
        desktopSelection = el;

        var startCX = e.clientX, startCY = e.clientY;
        var startL  = pos.x,     startT  = pos.y;
        var dragging = false;
        var THRESHOLD = 6;
        var dropTarget = null;

        el.setPointerCapture(e.pointerId);

        function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

        function findFolderAt(cx, cy) {
          // Temporarily remove pointer-events so el doesn't block hit testing
          el.style.pointerEvents = 'none';
          var elems = document.elementsFromPoint(cx, cy);
          el.style.pointerEvents = '';
          for (var i = 0; i < elems.length; i++) {
            var cand = elems[i].closest('.desktop-file');
            if (cand && cand !== el && cand.getAttribute('data-type') === 'folder') return cand;
          }
          return null;
        }

        function onMove(ev) {
          var dx = ev.clientX - startCX;
          var dy = ev.clientY - startCY;
          if (!dragging) {
            if (Math.hypot(dx, dy) < THRESHOLD) return;
            dragging = true;
            el.classList.add('dragging');
          }
          var nx = clamp(snap(startL + dx), 0, hostW - ICON_W);
          var ny = clamp(snap(startT + dy), 0, hostH - ICON_H);
          el.style.left = nx + 'px';
          el.style.top  = ny + 'px';

          // Drop-target highlight
          var folderEl = findFolderAt(ev.clientX, ev.clientY);
          if (dropTarget && dropTarget !== folderEl) {
            dropTarget.classList.remove('drop-over');
          }
          dropTarget = folderEl;
          if (dropTarget) dropTarget.classList.add('drop-over');
        }

        function onUp(ev) {
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerup',   onUp);
          el.classList.remove('dragging');
          if (dropTarget) dropTarget.classList.remove('drop-over');

          if (dragging && dropTarget) {
            // Move item into the folder
            var targetPath = dropTarget.getAttribute('data-path');
            var itemName = item.path.split('/').pop();
            var newPath = targetPath + '/' + itemName;
            apiPost('move', { from: item.path, to: newPath })
              .then(function() { renderDesktop(); })
              .catch(function() { renderDesktop(); });
            return;
          }

          if (!dragging) return;
          var nx = clamp(snap(startL + (ev.clientX - startCX)), 0, hostW - ICON_W);
          var ny = clamp(snap(startT + (ev.clientY - startCY)), 0, hostH - ICON_H);
          pos = { x: nx, y: ny };
          saveMeta(item.path, { pos: pos });
        }

        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup',   onUp);
      });

      host.appendChild(el);
    });
  }

  // ── Create helpers ──────────────────────────────────────────────────────────

  function createOnDesktop(kind) {
    if (kind === 'folder') {
      createEntry('/desktop', 'New Folder', 'folder');
    } else if (kind === 'note') {
      createEntry('/desktop', 'New Note.note', 'file', { fileExt: 'note' });
    } else {
      createEntry('/desktop', 'New Document.doc', 'file', { fileExt: 'doc' });
    }
  }

  function createDesktopShortcut(tabName) {
    var app = getWindowApp(tabName);
    if (!app) return;
    createEntry('/desktop', app.label, 'shortcut', { type: 'shortcut', launchTab: tabName });
  }

  // ── Inline rename ──────────────────────────────────────────────────────────

  function beginRename(el) {
    var nameEl = el.querySelector('.desktop-file-name');
    if (!nameEl) return;
    var virtPath = el.getAttribute('data-path');
    nameEl.setAttribute('contenteditable', 'true');
    nameEl.focus();
    // Select all text
    var range = document.createRange();
    range.selectNodeContents(nameEl);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    function commit() {
      nameEl.removeAttribute('contenteditable');
      var newName = nameEl.textContent.trim();
      if (newName && newName !== virtPath.split('/').pop()) {
        rename(virtPath, newName);
      } else {
        renderDesktop();
      }
    }
    nameEl.addEventListener('blur', commit, { once: true });
    nameEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
      if (e.key === 'Escape') { nameEl.textContent = virtPath.split('/').pop(); nameEl.blur(); }
    });
  }

  // ── Open file in a simple editor modal ────────────────────────────────────

  async function openFile(virtPath) {
    var content = await getContent(virtPath);
    var name = virtPath.split('/').pop();

    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:180;background:rgba(0,0,0,0.5);display:grid;place-items:center;';
    var card = document.createElement('div');
    card.style.cssText = 'width:600px;max-width:90vw;max-height:80vh;background:var(--window-bg);border:1px solid var(--border-emphasis);border-radius:18px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,0.4);';

    var header = document.createElement('div');
    header.style.cssText = 'padding:12px 16px;border-bottom:1px solid var(--border-default);display:flex;justify-content:space-between;align-items:center;';
    header.innerHTML = '<span style="font-weight:700;font-size:14px;">' + name + '</span>';
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:none;border:none;color:var(--text-secondary);font-size:16px;cursor:pointer;padding:4px 8px;';
    closeBtn.onclick = function() {
      setContent(virtPath, textarea.value);
      overlay.remove();
    };
    header.appendChild(closeBtn);

    var textarea = document.createElement('textarea');
    textarea.value = content;
    textarea.style.cssText = 'flex:1;padding:16px;border:none;background:transparent;color:var(--text-primary);font-family:JetBrains Mono,monospace;font-size:13px;resize:none;outline:none;min-height:300px;';

    card.appendChild(header);
    card.appendChild(textarea);
    overlay.appendChild(card);
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) { setContent(virtPath, textarea.value); overlay.remove(); }
    });
    document.body.appendChild(overlay);
    textarea.focus();
  }

  async function openFolder(virtPath) {
    var items;
    try { items = await list(virtPath); } catch (_) { items = []; }
    var name = virtPath.split('/').pop();
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:180;background:rgba(0,0,0,0.5);display:grid;place-items:center;';
    var card = document.createElement('div');
    card.style.cssText = 'width:500px;max-width:90vw;max-height:60vh;background:var(--window-bg);border:1px solid var(--border-emphasis);border-radius:18px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,0.4);';

    var header = document.createElement('div');
    header.style.cssText = 'padding:12px 16px;border-bottom:1px solid var(--border-default);display:flex;justify-content:space-between;align-items:center;';
    header.innerHTML = '<span style="font-weight:700;font-size:14px;">📁 ' + name + '</span>';
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:none;border:none;color:var(--text-secondary);font-size:16px;cursor:pointer;padding:4px 8px;';
    closeBtn.onclick = function() { overlay.remove(); };
    header.appendChild(closeBtn);

    var body = document.createElement('div');
    body.style.cssText = 'padding:16px;display:grid;grid-template-columns:repeat(auto-fill,80px);gap:8px;overflow-y:auto;';
    if (items.length === 0) {
      body.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-tertiary);padding:24px;font-size:13px;">Empty folder</div>';
    } else {
      items.forEach(function(item) {
        var el = document.createElement('div');
        el.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px;border-radius:10px;cursor:pointer;text-align:center;';
        el.innerHTML = '<div style="font-size:28px;">' + fileIcon(item) + '</div><div style="font-size:11px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:72px;">' + item.name + '</div>';
        el.addEventListener('dblclick', function() {
          overlay.remove();
          if (item.type === 'folder') openFolder(item.path);
          else if (item.type === 'shortcut' && item.launchTab) switchMainTab(item.launchTab);
          else openFile(item.path);
        });
        el.addEventListener('mouseenter', function() { el.style.background = 'color-mix(in srgb, var(--accent) 14%, transparent)'; });
        el.addEventListener('mouseleave', function() { el.style.background = ''; });
        body.appendChild(el);
      });
    }

    card.appendChild(header);
    card.appendChild(body);
    overlay.appendChild(card);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  return {
    stat: stat,
    list: list,
    createEntry: createEntry,
    remove: remove,
    rename: rename,
    getContent: getContent,
    setContent: setContent,
    saveMeta: saveMeta,
    renderDesktop: renderDesktop,
    createOnDesktop: createOnDesktop,
    createDesktopShortcut: createDesktopShortcut,
    beginRename: beginRename,
    openFile: openFile,
    openFolder: openFolder
  };
})();

// Render desktop files on load
document.addEventListener('DOMContentLoaded', function() { vfs.renderDesktop(); });


