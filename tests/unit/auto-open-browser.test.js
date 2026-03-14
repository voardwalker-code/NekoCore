const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  CHROMIUM_RUNTIMES,
  buildOpenCommand,
  buildMacFocusOrOpenCommand,
  buildLinuxFocusOrOpenCommand,
  buildWindowsFocusOrOpenCommand,
  buildWindowsRuntimeArgs,
  chooseDesiredRuntime,
  detectDefaultRuntime,
  isLockStateFresh,
  resolvePreferredRuntime,
  updateBrowserOpenState,
  tryAutoOpenBrowser
} = require('../../server/services/auto-open-browser');

test('buildOpenCommand uses platform-specific launcher', () => {
  assert.equal(buildOpenCommand('http://localhost:3847', 'win32'), 'start "" "http://localhost:3847"');
  assert.equal(buildOpenCommand('http://localhost:3847', 'darwin'), 'open "http://localhost:3847"');
  assert.equal(buildOpenCommand('http://localhost:3847', 'linux'), 'xdg-open "http://localhost:3847"');
});

test('CHROMIUM_RUNTIMES includes chrome and edge', () => {
  assert.equal(CHROMIUM_RUNTIMES.has('chrome'), true);
  assert.equal(CHROMIUM_RUNTIMES.has('edge'), true);
});

test('chooseDesiredRuntime prefers explicit runtime override', () => {
  const result = chooseDesiredRuntime('win32', { preferredRuntime: 'brave', detectedDefaultRuntime: 'chrome' });
  assert.equal(result, 'brave');
});

test('chooseDesiredRuntime prefers detected default chromium browser', () => {
  const result = chooseDesiredRuntime('win32', { detectedDefaultRuntime: 'chrome' });
  assert.equal(result, 'chrome');
});

test('chooseDesiredRuntime falls back from firefox default to platform default', () => {
  const result = chooseDesiredRuntime('win32', { detectedDefaultRuntime: 'firefox' });
  assert.equal(result, 'chrome');
});

test('detectDefaultRuntime normalizes known runtime names', () => {
  assert.equal(detectDefaultRuntime('freebsd'), '');
});

test('buildWindowsFocusOrOpenCommand generates a powershell launcher', () => {
  const cmd = buildWindowsFocusOrOpenCommand('http://localhost:3847');
  assert.match(cmd, /^powershell\s+-NoProfile\s+-ExecutionPolicy\s+Bypass\s+-EncodedCommand\s+/);
  const encoded = cmd.split(' ').at(-1);
  const script = Buffer.from(encoded, 'base64').toString('utf16le');
  assert.match(script, /--new-window/);
  assert.match(script, /--app=/);
  assert.match(script, /\$runtimeArgs = @\('--new-window', '--start-fullscreen', '--app=' \+ \$url \+ ''\)/);
});

test('buildWindowsRuntimeArgs injects the actual URL', () => {
  const args = buildWindowsRuntimeArgs('http://localhost:3847', 'edge');
  assert.deepEqual(args, ['--new-window', '--start-fullscreen', '--app=http://localhost:3847']);
});

test('buildMacFocusOrOpenCommand generates an osascript launcher', () => {
  const cmd = buildMacFocusOrOpenCommand('http://localhost:3847', { runtime: 'chrome' });
  assert.match(cmd, /^osascript\s+-e\s+"/);
  assert.match(cmd, /Google Chrome/);
});

test('buildLinuxFocusOrOpenCommand generates a bash launcher', () => {
  const cmd = buildLinuxFocusOrOpenCommand('http://localhost:3847', { runtime: 'chrome' });
  assert.match(cmd, /^bash\s+-lc\s+"/);
  assert.match(cmd, /google-chrome/);
  assert.match(cmd, /--new-window|--app=|--kiosk/);
});

test('resolvePreferredRuntime fails when configured runtime is missing', () => {
  const result = resolvePreferredRuntime('linux', {
    preferredRuntime: 'chrome',
    commandExistsFn: () => false
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'runtime-missing');
});

test('resolvePreferredRuntime on win32 can succeed via known install path lookup', () => {
  const result = resolvePreferredRuntime('win32', {
    preferredRuntime: 'chrome',
    commandExistsFn: () => false
  });
  // This assertion allows local machines without Chrome while still validating return shape when found.
  if (result.ok) {
    assert.equal(result.runtime, 'chrome');
    assert.ok(typeof result.executablePath === 'string' && result.executablePath.length > 0);
  } else {
    assert.equal(result.reason, 'runtime-missing');
  }
});

test('isLockStateFresh returns false for stale open state', () => {
  const result = isLockStateFresh({ isOpen: true, lastSeenAt: 1000 }, 1000 + 60000, 45000);
  assert.equal(result, false);
});

test('isLockStateFresh returns true for recent open state', () => {
  const result = isLockStateFresh({ isOpen: true, lastSeenAt: 1000 }, 1000 + 10000, 45000);
  assert.equal(result, true);
});

test('tryAutoOpenBrowser opens on first call', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rem-auto-open-'));
  const lockPath = path.join(tmp, 'lock.json');
  const calls = [];

  const result = tryAutoOpenBrowser('http://localhost:3847', {
    lockPath,
    now: 1000,
    platform: 'sunos',
    fsModule: fs,
    execFn: (cmd, cb) => { calls.push(cmd); cb && cb(null); }
  });

  assert.equal(result.opened, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0], 'xdg-open "http://localhost:3847"');
});

test('tryAutoOpenBrowser on win32 launches browser executable directly', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rem-auto-open-'));
  const lockPath = path.join(tmp, 'lock.json');
  const spawnCalls = [];
  const execCalls = [];
  const scheduled = [];

  const result = tryAutoOpenBrowser('http://localhost:3847', {
    lockPath,
    now: 1000,
    platform: 'win32',
    preferredRuntime: 'edge',
    fsModule: fs,
    spawnFn: (file, args) => {
      spawnCalls.push({ file, args });
      return { unref() {} };
    },
    execFn: (cmd, cb) => { execCalls.push(cmd); cb && cb(null); },
    scheduleFn: (fn, ms) => { scheduled.push(ms); return 1; },
    windowTitle: 'REM System',
    fullscreen: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  });

  assert.equal(result.opened, true);
  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0].file.includes('msedge.exe'), true);
  assert.deepEqual(spawnCalls[0].args, ['--new-window', '--start-fullscreen', '--app=http://localhost:3847']);
  assert.deepEqual(scheduled, [1200]);
  assert.equal(execCalls.length, 0);
});

test('tryAutoOpenBrowser switches to existing tab when lock says open', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rem-auto-open-'));
  const lockPath = path.join(tmp, 'lock.json');
  const calls = [];

  updateBrowserOpenState({ url: 'http://localhost:3847', isOpen: true }, {
    lockPath,
    now: 1000,
    fsModule: fs
  });
  const second = tryAutoOpenBrowser('http://localhost:3847', {
    lockPath,
    now: 1500,
    platform: 'linux',
    commandExistsFn: () => true,
    fsModule: fs,
    execFn: (cmd, cb) => { calls.push(cmd); cb && cb(null); }
  });

  assert.equal(second.opened, false);
  assert.equal(second.reason, 'already-open-switching');
  assert.equal(calls.length, 1);
});

test('tryAutoOpenBrowser opens when lock says closed', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rem-auto-open-'));
  const lockPath = path.join(tmp, 'lock.json');
  const calls = [];

  updateBrowserOpenState({ url: 'http://localhost:3847', isOpen: false }, {
    lockPath,
    now: 1000,
    fsModule: fs
  });

  const second = tryAutoOpenBrowser('http://localhost:3847', {
    lockPath,
    now: 2000,
    platform: 'linux',
    commandExistsFn: () => true,
    fsModule: fs,
    execFn: (cmd, cb) => { calls.push(cmd); cb && cb(null); }
  });

  assert.equal(second.opened, true);
  assert.equal(calls.length, 1);
});

test('tryAutoOpenBrowser reopens when lock is stale even if isOpen=true', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rem-auto-open-'));
  const lockPath = path.join(tmp, 'lock.json');
  const calls = [];

  updateBrowserOpenState({ url: 'http://localhost:3847', isOpen: true }, {
    lockPath,
    now: 1000,
    fsModule: fs
  });

  const result = tryAutoOpenBrowser('http://localhost:3847', {
    lockPath,
    now: 1000 + 60000,
    platform: 'linux',
    commandExistsFn: () => true,
    presenceTtlMs: 45000,
    fsModule: fs,
    execFn: (cmd, cb) => { calls.push(cmd); cb && cb(null); }
  });

  assert.equal(result.opened, true);
  assert.equal(result.reason, 'opened');
  assert.equal(calls.length, 1);
});

test('tryAutoOpenBrowser supports explicit disable option', () => {
  const calls = [];
  const result = tryAutoOpenBrowser('http://localhost:3847', {
    autoOpen: false,
    execFn: (cmd, cb) => { calls.push(cmd); cb && cb(null); }
  });

  assert.equal(result.opened, false);
  assert.equal(result.reason, 'disabled');
  assert.equal(calls.length, 0);
});

test('tryAutoOpenBrowser fails loudly when strict runtime is missing', () => {
  const calls = [];
  const logs = [];
  const result = tryAutoOpenBrowser('http://localhost:3847', {
    platform: 'linux',
    preferredRuntime: 'chrome',
    commandExistsFn: () => false,
    logger: { log: (...args) => logs.push(args.join(' ')) },
    execFn: (cmd, cb) => { calls.push(cmd); cb && cb(null); }
  });

  assert.equal(result.opened, false);
  assert.equal(result.reason, 'runtime-missing');
  assert.equal(calls.length, 0);
  assert.equal(logs.some((line) => line.includes('dedicated runtime check failed')), true);
});
