// ============================================================
// REM System — Entity Paths
// Canonical path resolver for all per-entity file/directory
// locations. Every module that needs a path into an entity's
// folder tree should go through here — never build paths ad-hoc.
//
// Entity folder layout (under <project_root>/entities/):
//
//   entity_<id>/
//     entity.json
//     index/              ← memoryIndex / topicIndex / recencyIndex
//     beliefs/            ← belief graph persistence
//     skills/             ← per-entity skills (SKILL.md files)
//     quarantine/         ← quarantined skill proposals
//     memories/
//       persona.json
//       system-prompt.txt
//       neurochemistry.json
//       life-diary.md
//       dream-diary.md
//       episodic/         ← mem_* and ltm_* folders
//       semantic/         ← semantic knowledge folders
//       ltm/              ← long-term memory archives
//       dreams/
//         episodic/
//         semantic/
//         core/
//         index/
//       archives/
//       conscious/
//       images/
//       pixel-art/
//       relationships/
//       goals/
//       logs/
//       users/
// ============================================================

'use strict';

const path = require('path');

// Absolute path to the top-level entities/ data directory
// (two levels up from server/entities/ → project root → entities/)
const ENTITIES_DIR = path.join(__dirname, '..', '..', 'entities');

// ── Normalisation ───────────────────────────────────────────

/**
 * Strip any leading "entity_" prefix(es) and whitespace from an
 * entityId so callers can pass either form interchangeably.
 *
 * @param {*} entityId
 * @returns {string}  canonical id (no prefix), or '' for null/empty
 */
function normalizeEntityId(entityId) {
  if (entityId === null || entityId === undefined) return '';
  let id = String(entityId).trim();
  while (id.startsWith('entity_')) {
    id = id.slice('entity_'.length);
  }
  return id;
}

// ── Core helpers ────────────────────────────────────────────

/**
 * Absolute path to the entity root folder.
 * Throws if entityId normalises to empty.
 */
function getEntityRoot(entityId) {
  const id = normalizeEntityId(entityId);
  if (!id) throw new Error(`Invalid entityId: ${JSON.stringify(entityId)}`);
  return path.join(ENTITIES_DIR, `entity_${id}`);
}

/**
 * Absolute path to the entity's memories/ directory.
 */
function getMemoryRoot(entityId) {
  return path.join(getEntityRoot(entityId), 'memories');
}

// ── Memory sub-directories ──────────────────────────────────

function getEpisodicMemoryPath(entityId) {
  return path.join(getMemoryRoot(entityId), 'episodic');
}

function getSemanticMemoryPath(entityId) {
  return path.join(getMemoryRoot(entityId), 'semantic');
}

function getLtmPath(entityId) {
  return path.join(getMemoryRoot(entityId), 'ltm');
}

function getDreamMemoryPath(entityId) {
  return path.join(getMemoryRoot(entityId), 'dreams');
}

function getConsciousMemoryPath(entityId) {
  return path.join(getMemoryRoot(entityId), 'conscious');
}

// ── Dream sub-directories ───────────────────────────────────

function getDreamEpisodicPath(entityId) {
  return path.join(getDreamMemoryPath(entityId), 'episodic');
}

function getDreamSemanticPath(entityId) {
  return path.join(getDreamMemoryPath(entityId), 'semantic');
}

function getDreamCorePath(entityId) {
  return path.join(getDreamMemoryPath(entityId), 'core');
}

function getDreamIndexPath(entityId) {
  return path.join(getDreamMemoryPath(entityId), 'index');
}

// ── Entity-root sub-directories ────────────────────────────

function getIndexPath(entityId) {
  return path.join(getEntityRoot(entityId), 'index');
}

function getBeliefsPath(entityId) {
  return path.join(getEntityRoot(entityId), 'beliefs');
}

function getSkillsPath(entityId) {
  return path.join(getEntityRoot(entityId), 'skills');
}

function getQuarantinePath(entityId) {
  return path.join(getEntityRoot(entityId), 'quarantine');
}

// ── Named files ─────────────────────────────────────────────

function getNeurochemistryPath(entityId) {
  return path.join(getMemoryRoot(entityId), 'neurochemistry.json');
}

function getLifeDiaryPath(entityId) {
  return path.join(getMemoryRoot(entityId), 'life-diary.md');
}

function getDreamDiaryPath(entityId) {
  return path.join(getMemoryRoot(entityId), 'dream-diary.md');
}

// ── Media directories ───────────────────────────────────────

function getPixelArtPath(entityId) {
  return path.join(getMemoryRoot(entityId), 'pixel-art');
}

function getMemoryImagesPath(entityId) {
  return path.join(getMemoryRoot(entityId), 'images');
}

// ── Exports ─────────────────────────────────────────────────

module.exports = {
  ENTITIES_DIR,

  normalizeEntityId,

  getEntityRoot,
  getMemoryRoot,

  getEpisodicMemoryPath,
  getSemanticMemoryPath,
  getLtmPath,
  getDreamMemoryPath,
  getConsciousMemoryPath,

  getDreamEpisodicPath,
  getDreamSemanticPath,
  getDreamCorePath,
  getDreamIndexPath,

  getIndexPath,
  getBeliefsPath,
  getSkillsPath,
  getQuarantinePath,

  getNeurochemistryPath,
  getLifeDiaryPath,
  getDreamDiaryPath,

  getPixelArtPath,
  getMemoryImagesPath,
};
