// ============================================================
// Integration Tests — brain-loop.js
// Tests BrainLoop construction, single tick execution with real
// phases (null-safe), phase error isolation, and cycleCount
// tracking. Uses a temp directory so no state file conflicts.
// ============================================================

const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const BrainLoop = require('../../server/brain/cognition/brain-loop');

function makeTempDir() {
  const dir = path.join(os.tmpdir(), `rem-brain-loop-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Construction ───────────────────────────────────────────

test('BrainLoop constructs without throwing', () => {
  const loop = new BrainLoop({ interval: 999999 });
  assert.ok(loop instanceof BrainLoop);
});

test('running is false before start', () => {
  const loop = new BrainLoop({ interval: 999999 });
  assert.equal(loop.running, false);
});

test('cycleCount starts at 0', () => {
  const loop = new BrainLoop({ interval: 999999 });
  assert.equal(loop.cycleCount, 0);
});

test('loopHandle is null before start', () => {
  const loop = new BrainLoop({ interval: 999999 });
  assert.equal(loop.loopHandle, null);
});

// ── tick ──────────────────────────────────────────────────

test('tick increments cycleCount', async () => {
  const tmpDir = makeTempDir();
  const loop = new BrainLoop({ interval: 999999, memDir: tmpDir });
  // tick() calls _saveState which needs _stateFile set
  loop._stateFile = path.join(tmpDir, 'brain-loop-state.json');
  await loop.tick();
  assert.equal(loop.cycleCount, 1);
});

test('tick increments cycleCount on successive calls', async () => {
  const tmpDir = makeTempDir();
  const loop = new BrainLoop({ interval: 999999, memDir: tmpDir });
  loop._stateFile = path.join(tmpDir, 'brain-loop-state.json');
  await loop.tick();
  await loop.tick();
  await loop.tick();
  assert.equal(loop.cycleCount, 3);
});

test('tick saves state to disk when _stateFile is set', async () => {
  const tmpDir = makeTempDir();
  const stateFile = path.join(tmpDir, 'brain-loop-state.json');
  const loop = new BrainLoop({ interval: 999999, memDir: tmpDir });
  loop._stateFile = stateFile;
  await loop.tick();
  assert.ok(fs.existsSync(stateFile), 'state file should be created after tick');
  const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(saved.cycleCount, 1);
});

test('tick completes without throwing even with no subsystems', async () => {
  const tmpDir = makeTempDir();
  const loop = new BrainLoop({ interval: 999999, memDir: tmpDir });
  loop._stateFile = path.join(tmpDir, 'brain-loop-state.json');
  // Should not throw; phases are null-safe and errors are caught internally
  await loop.tick();
  assert.equal(loop.cycleCount, 1);
});

test('tick isolates phase errors — does not throw to caller', async () => {
  const tmpDir = makeTempDir();
  const loop = new BrainLoop({ interval: 999999, memDir: tmpDir });
  loop._stateFile = path.join(tmpDir, 'brain-loop-state.json');
  await assert.doesNotReject(() => loop.tick());
});

// ── start / stop ──────────────────────────────────────────

test('start sets running to true', () => {
  const loop = new BrainLoop({ interval: 999999 });
  loop._stateFile = null; // no state persistence needed
  loop.start(null, null, null, null);
  assert.equal(loop.running, true);
  clearInterval(loop.loopHandle); // cleanup
});

test('stop sets running to false', () => {
  const loop = new BrainLoop({ interval: 999999 });
  loop._stateFile = null;
  loop.start(null, null, null, null);
  loop.stop();
  assert.equal(loop.running, false);
});

test('stop clears the interval handle', () => {
  const loop = new BrainLoop({ interval: 999999 });
  loop._stateFile = null;
  loop.start(null, null, null, null);
  loop.stop();
  assert.equal(loop.loopHandle, null);
});

test('calling start twice does not create a second interval', () => {
  const loop = new BrainLoop({ interval: 999999 });
  loop._stateFile = null;
  loop.start(null, null, null, null);
  const handle1 = loop.loopHandle;
  loop.start(null, null, null, null); // second call — should no-op
  const handle2 = loop.loopHandle;
  assert.equal(handle1, handle2, 'loopHandle should not change on second start call');
  loop.stop();
});

// ── _loadState ────────────────────────────────────────────

test('_loadState restores cycleCount from disk', () => {
  const tmpDir = makeTempDir();
  const stateFile = path.join(tmpDir, 'brain-loop-state.json');
  fs.writeFileSync(stateFile, JSON.stringify({ cycleCount: 42 }), 'utf8');
  const loop = new BrainLoop({ interval: 999999, memDir: tmpDir });
  loop._stateFile = stateFile;
  loop._loadState();
  assert.equal(loop.cycleCount, 42);
});

test('_loadState handles missing file gracefully', () => {
  const loop = new BrainLoop({ interval: 999999 });
  loop._stateFile = path.join(os.tmpdir(), 'nonexistent-brain-state-xyz.json');
  assert.doesNotThrow(() => loop._loadState());
});

test('getHealthDiagnostics returns counters and thresholds', async () => {
  const tmpDir = makeTempDir();
  const loop = new BrainLoop({ interval: 999999, memDir: tmpDir });
  loop._stateFile = path.join(tmpDir, 'brain-loop-state.json');
  await loop.tick();
  const health = loop.getHealthDiagnostics();
  assert.equal(typeof health.totalTicks, 'number');
  assert.equal(typeof health.successfulTicks, 'number');
  assert.ok(health.thresholds);
  assert.equal(typeof health.thresholds.maxConsecutiveTickFailures, 'number');
});

test('circuit breaker opens after consecutive tick failures', async () => {
  const tmpDir = makeTempDir();
  const loop = new BrainLoop({
    interval: 999999,
    memDir: tmpDir,
    maxConsecutiveTickFailures: 2,
    circuitBreakerCooldownMs: 60000
  });
  loop._stateFile = path.join(tmpDir, 'brain-loop-state.json');
  loop._saveState = () => { throw new Error('forced tick failure'); };

  await loop.tick();
  await loop.tick();
  const health = loop.getHealthDiagnostics();
  assert.equal(health.circuitBreakerOpen, true);
  assert.ok(String(health.circuitBreakerReason || '').includes('consecutive_tick_failures'));
});
