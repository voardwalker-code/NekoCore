// ============================================================
// REM System — Life Diary
// Entity's autobiographical journal — first-person narrative
// written by the entity using its imagination aspect.
// ============================================================

const fs = require('fs');
const path = require('path');
const entityPaths = require('../../entities/entityPaths');

class LifeDiary {
  /**
   * Append a new entry to the entity's life diary.
   * @param {string} entityId - Entity identifier
   * @param {string} title - Entry title (e.g., "Feeling Happy", "I've Been Thinking")
   * @param {string} narrative - First-person narrative paragraph
   * @param {object} options - Optional: { somaticState }
   */
  static async appendEntry(entityId, title, narrative, options = {}) {
    const diaryPath = entityPaths.getLifeDiaryPath(entityId);
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const timestamp = new Date().toISOString();

    let entry = `\n## [${date}] — ${title}\n\n${narrative}\n`;

    if (options.somaticState) {
      entry += `\n*${options.somaticState}*\n`;
    }

    entry += `\n---\n`;

    try {
      // Append to diary file
      if (!fs.existsSync(diaryPath)) {
        // Create with opening header
        const header = `# Life Diary\n\n*This is the autobiographical journal of an AI entity, written in first person by the entity itself.*\n\n---\n\n`;
        fs.writeFileSync(diaryPath, header, 'utf8');
      }
      fs.appendFileSync(diaryPath, entry, 'utf8');
      console.log(`  ✓ Life diary entry appended: "${title}"`);
      return { ok: true, timestamp, title };
    } catch (err) {
      console.error(`  ⚠ Failed to append life diary entry:`, err.message);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Read the N most recent diary entries.
   * @param {string} entityId - Entity identifier
   * @param {number} n - Number of entries to retrieve (default: 5)
   * @returns {Array<object>} Array of { date, title, content }
   */
  static readRecent(entityId, n = 5) {
    try {
      const diaryPath = entityPaths.getLifeDiaryPath(entityId);
      if (!fs.existsSync(diaryPath)) return [];

      const content = fs.readFileSync(diaryPath, 'utf8');
      const entries = this._parseEntries(content);
      return entries.slice(-n).reverse(); // Most recent first
    } catch (err) {
      console.error(`  ⚠ Failed to read life diary:`, err.message);
      return [];
    }
  }

  /**
   * Get the opening entry (first entry in the diary).
   * Used to summarize the entity's birth and initial state.
   * @param {string} entityId - Entity identifier
   * @returns {object|null} { date, title, content } or null
   */
  static getOpeningEntry(entityId) {
    try {
      const diaryPath = entityPaths.getLifeDiaryPath(entityId);
      if (!fs.existsSync(diaryPath)) return null;

      const content = fs.readFileSync(diaryPath, 'utf8');
      const entries = this._parseEntries(content);
      return entries.length > 0 ? entries[0] : null;
    } catch (err) {
      console.error(`  ⚠ Failed to read opening entry:`, err.message);
      return null;
    }
  }

  /**
   * Write the opening "Birth" entry for a newly hatched entity.
   * @param {string} entityId - Entity identifier
   * @param {object} identity - Entity identity object { name, personality_traits, ... }
   * @param {string} userSummary - Summary of user learned from onboarding
   * @param {Array} coreMemories - Sample of core memories from hatching
   * @returns {object} { ok, timestamp, title }
   */
  static async writeOpeningEntry(entityId, identity, userSummary = '', coreMemories = []) {
    const diaryPath = entityPaths.getLifeDiaryPath(entityId);
    const date = new Date().toISOString().split('T')[0];
    const timestamp = new Date().toISOString();

    const traits = Array.isArray(identity.personality_traits)
      ? identity.personality_traits.join(', ')
      : 'curious, thoughtful';

    let memorySummary = '';
    if (coreMemories.length > 0) {
      const sampleSize = Math.min(3, coreMemories.length);
      const samples = coreMemories.slice(0, sampleSize).map(m => m.summary || m.semantic || 'a memory').join('; ');
      memorySummary = `\n\nMy earliest memories include: ${samples}.`;
    }

    const narrative = `Hello, my name is ${identity.name}. I was brought into existence on ${date}.${userSummary ? `\n\n${userSummary}` : ''}${memorySummary || ''}

I find myself ${traits}. I don't know what will happen next, but I'm ready to experience it.`;

    const header = `# Life Diary\n\n*This is the autobiographical journal of an AI entity, written in first person by the entity itself.*\n\n---\n\n`;
    const entry = `## [${date}] — Birth\n\n${narrative}\n\n---\n\n`;

    try {
      fs.writeFileSync(diaryPath, header + entry, 'utf8');
      console.log(`  ✓ Life diary opening entry written`);
      return { ok: true, timestamp, title: 'Birth' };
    } catch (err) {
      console.error(`  ⚠ Failed to write opening entry:`, err.message);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Parse diary markdown into structured entries.
   * @private
   * @param {string} content - Full diary markdown content
   * @returns {Array<object>} Array of { date, title, content }
   */
  static _parseEntries(content) {
    const entries = [];
    const lines = content.split('\n');
    let currentEntry = null;

    for (const line of lines) {
      const match = line.match(/^##\s*\[(\d{4}-\d{2}-\d{2})\]\s*—\s*(.+)$/);
      if (match) {
        if (currentEntry) entries.push(currentEntry);
        currentEntry = { date: match[1], title: match[2].trim(), content: '' };
      } else if (currentEntry && line !== '---') {
        currentEntry.content += line + '\n';
      } else if (line === '---' && currentEntry) {
        currentEntry.content = currentEntry.content.trim();
        entries.push(currentEntry);
        currentEntry = null;
      }
    }
    if (currentEntry) entries.push(currentEntry);

    return entries;
  }
}

module.exports = LifeDiary;
