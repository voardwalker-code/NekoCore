// Phase: Boredom Check
// Triggers autonomous self-directed activity when the entity is idle.
// Runs every cycle if boredom engine is active.

const path = require('path');
const fs = require('fs').promises;

async function boredomPhase(loop) {
  if (!loop.boredomEngine || !loop.boredomEngine.isActive) return;

  const activeLLM = loop._callLLM;
  if (!activeLLM) return;

  const boredomRuntime = (loop._aspectConfigs &&
    (loop._aspectConfigs.subconscious || loop._aspectConfigs.main)) || null;
  if (!boredomRuntime) return;

  const boredomCallLLM = async (prompt) => activeLLM(boredomRuntime, [
    { role: 'system', content: 'You are an autonomous digital entity deciding what to do when bored. Be creative, authentic, and personality-driven. Keep responses concise.' },
    { role: 'user', content: prompt }
  ], { temperature: 0.9, maxTokens: loop._getTokenLimit('boredomAction') || 1500 });

  loop._emit('phase', { name: 'boredom', status: 'running', level: loop.boredomEngine.boredomLevel });
  const pulseContext = loop.cognitivePulse ? loop.cognitivePulse.getState() : null;
  const boredomResult = await loop.boredomEngine.tick(boredomCallLLM, pulseContext);

  if (boredomResult && boredomResult.action) {
    console.log(`  ✨ Boredom action: ${boredomResult.action.label} (level was ${boredomResult.level.toFixed(2)})`);
    if (boredomResult.action.toolFile && boredomResult.action.message) {
      await _writeBoredomFile(loop, boredomResult.action.toolFile, boredomResult.action.message);
    }
    await _storeBoredomMemory(loop, boredomResult.action, boredomResult.level);
  }

  loop._emit('phase', {
    name: 'boredom',
    status: 'done',
    level: loop.boredomEngine.boredomLevel,
    action: boredomResult?.action?.activity || null
  });
}

async function _writeBoredomFile(loop, filePath, content) {
  try {
    const entityDir = loop.memoryStorage?.entityDir;
    if (!entityDir) return;
    const fullPath = path.join(entityDir, 'boredom-outputs', filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
    console.log(`    📝 Boredom file written: ${filePath}`);
  } catch (err) {
    console.warn('  ⚠ Error writing boredom file:', err.message);
  }
}

async function _storeBoredomMemory(loop, action, boredomLevel) {
  if (!loop.memoryStorage || !action || !action.message) return;
  try {
    const activityToType = {
      creative_writing: 'creation', make_something: 'creation',
      workspace_organize: 'reflection', self_reflection: 'reflection',
      reach_out: 'interaction', goal_review: 'reflection', explore_curiosity: 'learning'
    };
    const memType = activityToType[action.activity] || 'reflection';
    const memId = `boredom_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const memory = {
      id: memId,
      semantic: `[Self-directed: ${action.label}] ${(action.message || '').slice(0, 300)}`,
      summary: (action.message || '').slice(0, 500),
      content: { activity: action.activity, label: action.label, message: action.message, toolFile: action.toolFile || null, boredomLevel, is_autonomous: true },
      type: memType,
      importance: 0.45, decay: 0.9,
      topics: ['self-directed', 'boredom', action.activity.replace(/_/g, ' ')],
      emotionalTag: action.activity === 'reach_out' ? 'social' : 'introspective',
      created: new Date().toISOString()
    };
    await loop.memoryStorage.storeMemory(memory);
    console.log(`  ✓ Stored boredom memory: ${memId} (${memType})`);
    loop._emit('memory_created', { memory_id: memId, type: memType, activity: action.activity });
  } catch (err) {
    console.warn('  ⚠ Failed to store boredom memory:', err.message);
  }
}

module.exports = boredomPhase;
