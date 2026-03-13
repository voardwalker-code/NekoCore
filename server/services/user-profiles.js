// ============================================================
// REM System — User Profiles Service
//
// Manages per-entity user profiles. Each entity can have
// multiple users. The active user is tracked per session and
// injected into the chat pipeline so the entity always knows
// who it is talking to.
//
// Storage: entities/<entityId>/users/<userId>.json
// Active:  entities/<entityId>/users/_active.json
// ============================================================

'use strict';

const fs   = require('fs');
const path = require('path');

const USER_ID_PREFIX = 'user_';

/**
 * Generate a simple unique user ID.
 */
function generateUserId() {
  return USER_ID_PREFIX + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

/**
 * Get the users directory for an entity, creating it if needed.
 */
function getUsersDir(entityId, entityPaths) {
  const memRoot = entityPaths.getMemoryRoot(entityId);
  const dir = path.join(memRoot, 'users');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * List all user profiles for an entity.
 * @returns {Array<{id, name, info, created, lastSeen}>}
 */
function listUsers(entityId, entityPaths) {
  const dir = getUsersDir(entityId, entityPaths);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  const users = [];
  for (const file of files) {
    try {
      const profile = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      users.push(profile);
    } catch (_) {}
  }
  users.sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));
  return users;
}

/**
 * Get a single user profile by ID.
 * @returns {Object|null}
 */
function getUser(entityId, userId, entityPaths) {
  const dir = getUsersDir(entityId, entityPaths);
  const filePath = path.join(dir, userId + '.json');
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

/**
 * Create a new user profile.
 * @param {string} entityId
 * @param {{ name: string, info?: string }} data
 * @returns {{ ok: boolean, user?: Object, error?: string }}
 */
function createUser(entityId, data, entityPaths) {
  const name = String(data.name || '').trim();
  if (!name) return { ok: false, error: 'Name is required' };

  const id = generateUserId();
  const profile = {
    id,
    name,
    info: String(data.info || '').trim(),
    created: new Date().toISOString(),
    lastSeen: null
  };

  const dir = getUsersDir(entityId, entityPaths);
  fs.writeFileSync(path.join(dir, id + '.json'), JSON.stringify(profile, null, 2), 'utf8');
  console.log(`  ✓ User profile created: ${name} (${id}) for entity ${entityId}`);
  return { ok: true, user: profile };
}

/**
 * Update an existing user profile.
 * @param {string} entityId
 * @param {string} userId
 * @param {{ name?: string, info?: string }} updates
 * @returns {{ ok: boolean, user?: Object, error?: string }}
 */
function updateUser(entityId, userId, updates, entityPaths) {
  const existing = getUser(entityId, userId, entityPaths);
  if (!existing) return { ok: false, error: 'User not found' };

  if (updates.name !== undefined) existing.name = String(updates.name || '').trim() || existing.name;
  if (updates.info !== undefined) existing.info = String(updates.info || '').trim();

  const dir = getUsersDir(entityId, entityPaths);
  fs.writeFileSync(path.join(dir, userId + '.json'), JSON.stringify(existing, null, 2), 'utf8');
  return { ok: true, user: existing };
}

/**
 * Delete a user profile.
 */
function deleteUser(entityId, userId, entityPaths) {
  const dir = getUsersDir(entityId, entityPaths);
  const filePath = path.join(dir, userId + '.json');
  if (!fs.existsSync(filePath)) return { ok: false, error: 'User not found' };
  fs.unlinkSync(filePath);

  // If this was the active user, clear it
  const active = getActiveUser(entityId, entityPaths);
  if (active?.id === userId) setActiveUser(entityId, null, entityPaths);

  return { ok: true };
}

/**
 * Get the currently active (selected) user for an entity.
 * Returns null if none set.
 */
function getActiveUser(entityId, entityPaths) {
  const dir = getUsersDir(entityId, entityPaths);
  const activePath = path.join(dir, '_active.json');
  if (!fs.existsSync(activePath)) return null;
  try {
    const ref = JSON.parse(fs.readFileSync(activePath, 'utf8'));
    if (!ref.userId) return null;
    return getUser(entityId, ref.userId, entityPaths);
  } catch (_) {
    return null;
  }
}

/**
 * Set the active user for this entity. Pass null userId to clear.
 */
function setActiveUser(entityId, userId, entityPaths) {
  const dir = getUsersDir(entityId, entityPaths);
  const activePath = path.join(dir, '_active.json');

  if (!userId) {
    if (fs.existsSync(activePath)) fs.unlinkSync(activePath);
    return { ok: true, user: null };
  }

  const user = getUser(entityId, userId, entityPaths);
  if (!user) return { ok: false, error: 'User not found' };

  // Stamp lastSeen
  user.lastSeen = new Date().toISOString();
  fs.writeFileSync(path.join(dir, userId + '.json'), JSON.stringify(user, null, 2), 'utf8');
  fs.writeFileSync(activePath, JSON.stringify({ userId, name: user.name, setAt: new Date().toISOString() }, null, 2), 'utf8');

  console.log(`  ✓ Active user set: ${user.name} (${userId}) for entity ${entityId}`);
  return { ok: true, user };
}

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  getActiveUser,
  setActiveUser
};
