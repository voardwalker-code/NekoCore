const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildOpenCommand,
  tryAutoOpenBrowser
} = require('../../server/services/auto-open-browser');

test('buildOpenCommand uses platform-specific launcher', () => {
  assert.equal(buildOpenCommand('http://localhost:3847', 'win32'), 'start "" "http://localhost:3847"');
  assert.equal(buildOpenCommand('http://localhost:3847', 'darwin'), 'open "http://localhost:3847"');
  assert.equal(buildOpenCommand('http://localhost:3847', 'linux'), 'xdg-open "http://localhost:3847"');
});

test('tryAutoOpenBrowser opens on first call', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rem-auto-open-'));
  const lockPath = path.join(tmp, 'lock.json');
  const calls = [];

  const result = tryAutoOpenBrowser('http://localhost:3847', {
    lockPath,
    now: 1000,
    platform: 'linux',
    fsModule: fs,
    execFn: (cmd, cb) => { calls.push(cmd); cb && cb(null); }
  });

  assert.equal(result.opened, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0], 'xdg-open "http://localhost:3847"');
});

test('tryAutoOpenBrowser does not reopen when lock is still fresh', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rem-auto-open-'));
  const lockPath = path.join(tmp, 'lock.json');
  const calls = [];

  const first = tryAutoOpenBrowser('http://localhost:3847', {
    lockPath,
    now: 1000,
    guardMs: 10_000,
    platform: 'linux',
    fsModule: fs,
    execFn: (cmd, cb) => { calls.push(cmd); cb && cb(null); }
  });
  const second = tryAutoOpenBrowser('http://localhost:3847', {
    lockPath,
    now: 1500,
    guardMs: 10_000,
    platform: 'linux',
    fsModule: fs,
    execFn: (cmd, cb) => { calls.push(cmd); cb && cb(null); }
  });

  assert.equal(first.opened, true);
  assert.equal(second.opened, false);
  assert.equal(second.reason, 'already-open-recently');
  assert.equal(calls.length, 1);
});

test('tryAutoOpenBrowser reopens when lock is stale', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rem-auto-open-'));
  const lockPath = path.join(tmp, 'lock.json');
  const calls = [];

  tryAutoOpenBrowser('http://localhost:3847', {
    lockPath,
    now: 1000,
    guardMs: 500,
    platform: 'linux',
    fsModule: fs,
    execFn: (cmd, cb) => { calls.push(cmd); cb && cb(null); }
  });
  const second = tryAutoOpenBrowser('http://localhost:3847', {
    lockPath,
    now: 2000,
    guardMs: 500,
    platform: 'linux',
    fsModule: fs,
    execFn: (cmd, cb) => { calls.push(cmd); cb && cb(null); }
  });

  assert.equal(second.opened, true);
  assert.equal(calls.length, 2);
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
