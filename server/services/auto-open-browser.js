const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');

const DEFAULT_GUARD_MS = 10 * 60 * 1000;

function getBrowserOpenLockPath() {
  return path.join(os.tmpdir(), 'rem-system-browser-open.lock.json');
}

function buildOpenCommand(url, platform = process.platform) {
  if (platform === 'win32') return `start "" "${url}"`;
  if (platform === 'darwin') return `open "${url}"`;
  return `xdg-open "${url}"`;
}

function tryAutoOpenBrowser(url, options = {}) {
  const fsModule = options.fsModule || fs;
  const execFn = options.execFn || exec;
  const logger = options.logger || console;
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const guardMs = Number.isFinite(options.guardMs) ? options.guardMs : DEFAULT_GUARD_MS;
  const lockPath = options.lockPath || getBrowserOpenLockPath();

  // Allow operators to fully disable auto-open in headless/server scenarios.
  const envValue = String(process.env.REM_AUTO_OPEN_BROWSER || '').toLowerCase();
  if (options.autoOpen === false || envValue === '0' || envValue === 'false' || envValue === 'off') {
    return { opened: false, reason: 'disabled' };
  }

  try {
    if (fsModule.existsSync(lockPath)) {
      const raw = fsModule.readFileSync(lockPath, 'utf8');
      const data = JSON.parse(raw);
      const lastOpenedAt = Number(data && data.lastOpenedAt) || 0;
      if (lastOpenedAt > 0 && now - lastOpenedAt < guardMs) {
        return { opened: false, reason: 'already-open-recently' };
      }
    }
  } catch {
    // Ignore malformed lock files and continue with open.
  }

  const cmd = buildOpenCommand(url, options.platform || process.platform);
  try {
    fsModule.writeFileSync(lockPath, JSON.stringify({ url, lastOpenedAt: now, pid: process.pid }, null, 2), 'utf8');
  } catch {
    // Non-fatal: we can still attempt to open the browser.
  }

  execFn(cmd, (err) => {
    if (err && logger && typeof logger.log === 'function') {
      logger.log('  ⚠ Could not auto-open browser:', err.message);
    }
  });

  return { opened: true, reason: 'opened', command: cmd };
}

module.exports = {
  DEFAULT_GUARD_MS,
  getBrowserOpenLockPath,
  buildOpenCommand,
  tryAutoOpenBrowser
};
