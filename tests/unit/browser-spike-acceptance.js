'use strict';

/**
 * NekoCore Browser — Spike Acceptance Test (NB-2-6)
 *
 * Validates NB-1-0 acceptance criteria against the NB-2 POC modules.
 * Run with: node tests/unit/browser-spike-acceptance.js
 *
 * Criteria from NB-1-0:
 *   ✓ Navigation: navigate to URL, back, forward, refresh all fire events
 *   ✓ Tab model: create/switch/close with deterministic active-tab
 *   ✓ Lifecycle: host_starting → host_ready, host_closing states
 *   ✓ Download: start/complete/failure with correlatable IDs
 *   ✓ Event shape: all events carry { timestamp, channel }
 */

const assert = require('assert');

const eventBus        = require('../../browser-host/event-bus');
const tabModel        = require('../../browser-host/tab-model');
const navigation      = require('../../browser-host/navigation');
const lifecycleMod    = require('../../browser-host/lifecycle');
const downloadManager = require('../../browser-host/download-manager');

const eventLog = [];
eventBus.on('*', (ev) => eventLog.push(ev));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

function resetAll() {
  tabModel.reset();
  navigation.reset();
  lifecycleMod.reset();
  downloadManager.reset();
  eventLog.length = 0;
}

console.log('\n=== NB-2-6 Spike Acceptance Run ===\n');
console.log(`Started: ${new Date().toISOString()}\n`);

// ── 1. Host Lifecycle ──────────────────────────────────────────────────────
console.log('1. Host Lifecycle');
resetAll();

test('startup emits host_starting then host_ready', () => {
  lifecycleMod.startup();
  const states = eventLog.filter(e => e.channel === 'browser.host.lifecycle').map(e => e.state);
  assert.deepStrictEqual(states, ['host_starting', 'host_ready']);
});

test('getHostState returns host_ready after startup', () => {
  assert.strictEqual(lifecycleMod.getHostState(), 'host_ready');
});

test('shutdown emits host_closing', () => {
  eventLog.length = 0;
  lifecycleMod.shutdown();
  const states = eventLog.filter(e => e.channel === 'browser.host.lifecycle').map(e => e.state);
  assert.deepStrictEqual(states, ['host_closing']);
});

// ── 2. Tab Model ───────────────────────────────────────────────────────────
console.log('\n2. Tab Model');
resetAll();

test('createTab returns tab with tabId', () => {
  const tab = tabModel.createTab();
  assert.ok(tab.tabId.startsWith('tab_'));
  assert.strictEqual(tab.url, 'about:blank');
});

test('first tab becomes active automatically', () => {
  assert.ok(tabModel.getActiveTab());
  assert.strictEqual(tabModel.getActiveTabId(), tabModel.getAllTabs()[0].tabId);
});

test('create second tab, it becomes active', () => {
  const tab2 = tabModel.createTab();
  assert.strictEqual(tabModel.getActiveTabId(), tab2.tabId);
});

test('close active tab → deterministic fallback to next/prev', () => {
  const tabs = tabModel.getAllTabs();
  const closedId = tabs[1].tabId;
  tabModel.closeTab(closedId);
  // Should fall back (only 1 tab left)
  assert.strictEqual(tabModel.getTabCount(), 1);
  assert.strictEqual(tabModel.getActiveTabId(), tabs[0].tabId);
});

test('close last tab → activeTabId is null', () => {
  const remaining = tabModel.getAllTabs()[0];
  tabModel.closeTab(remaining.tabId);
  assert.strictEqual(tabModel.getActiveTabId(), null);
  assert.strictEqual(tabModel.getTabCount(), 0);
});

test('tab lifecycle events emitted correctly', () => {
  const tabEvents = eventLog.filter(e => e.channel === 'browser.tab.lifecycle');
  const states = tabEvents.map(e => e.state);
  assert.ok(states.includes('tab_created'));
  assert.ok(states.includes('tab_closed'));
});

// ── 3. Navigation ──────────────────────────────────────────────────────────
console.log('\n3. Navigation');
resetAll();

test('navigate to valid URL succeeds', () => {
  const tab = tabModel.createTab();
  const result = navigation.navigate(tab.tabId, 'https://example.com');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.url, 'https://example.com');
});

test('navigation emits browser.navigation.state event', () => {
  const navEvents = eventLog.filter(e => e.channel === 'browser.navigation.state');
  assert.ok(navEvents.length > 0);
  const last = navEvents[navEvents.length - 1];
  assert.strictEqual(last.url, 'https://example.com');
  assert.strictEqual(last.loading, false);
});

test('navigate to second URL enables back', () => {
  const tabId = tabModel.getActiveTabId();
  navigation.navigate(tabId, 'https://example.com/page2');
  const tab = tabModel.getTab(tabId);
  assert.strictEqual(tab.canGoBack, true);
});

test('goBack returns to previous URL', () => {
  const tabId = tabModel.getActiveTabId();
  const result = navigation.goBack(tabId);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.url, 'https://example.com');
});

test('goForward returns to page2', () => {
  const tabId = tabModel.getActiveTabId();
  const result = navigation.goForward(tabId);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.url, 'https://example.com/page2');
});

test('reload succeeds on active tab', () => {
  const tabId = tabModel.getActiveTabId();
  const result = navigation.reload(tabId);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.url, 'https://example.com/page2');
});

test('navigate to invalid URL returns error envelope', () => {
  const tabId = tabModel.getActiveTabId();
  const result = navigation.navigate(tabId, 'not-a-url');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 'INVALID_URL');
});

test('navigate to unsupported protocol returns error', () => {
  const tabId = tabModel.getActiveTabId();
  const result = navigation.navigate(tabId, 'ftp://files.example.com');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 'INVALID_PROTOCOL');
});

// ── 4. Downloads ───────────────────────────────────────────────────────────
console.log('\n4. Downloads');
resetAll();

test('startDownload returns correlatable downloadId', () => {
  const dl = downloadManager.startDownload({ url: 'https://example.com/file.zip', filename: 'file.zip' });
  assert.ok(dl.downloadId.startsWith('dl_'));
  assert.strictEqual(dl.state, 'started');
});

test('completeDownload transitions to completed', () => {
  const dl = downloadManager.getAllDownloads()[0];
  const completed = downloadManager.completeDownload(dl.downloadId, { totalBytes: 1024 });
  assert.strictEqual(completed.state, 'completed');
  assert.strictEqual(completed.totalBytes, 1024);
});

test('failDownload transitions to failed with error', () => {
  const dl2 = downloadManager.startDownload({ url: 'https://example.com/broken.zip' });
  downloadManager.failDownload(dl2.downloadId, 'Network error');
  const failed2 = downloadManager.getDownload(dl2.downloadId);
  assert.strictEqual(failed2.state, 'failed');
  assert.strictEqual(failed2.error, 'Network error');
});

test('download state events emitted', () => {
  const dlEvents = eventLog.filter(e => e.channel === 'browser.download.state');
  const states = dlEvents.map(e => e.state);
  assert.ok(states.includes('started'));
  assert.ok(states.includes('completed'));
  assert.ok(states.includes('failed'));
});

// ── 5. Event Shape ─────────────────────────────────────────────────────────
console.log('\n5. Event Shape');

test('all events have timestamp', () => {
  const missing = eventLog.filter(e => !e.timestamp);
  assert.strictEqual(missing.length, 0, `${missing.length} events missing timestamp`);
});

test('all events have channel', () => {
  const missing = eventLog.filter(e => !e.channel);
  assert.strictEqual(missing.length, 0, `${missing.length} events missing channel`);
});

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
console.log(`Finished: ${new Date().toISOString()}`);

if (failed > 0) {
  console.log('\n⚠ SPIKE ACCEPTANCE: FAIL');
  process.exit(1);
} else {
  console.log('\n✓ SPIKE ACCEPTANCE: PASS — all NB-1-0 criteria met');
  process.exit(0);
}
