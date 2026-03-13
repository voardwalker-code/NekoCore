// ============================================================
// REM System — Dream Diary
// Entity's dream journal — first-person narrative interpretation
// of significant dreams (CoreDreamMemories).
// ============================================================

const fs = require('fs');
const path = require('path');
const entityPaths = require('../../entities/entityPaths');

class DreamDiary {
  /**
   * Append a dream entry to the entity's dream diary.
   * @param {string} entityId - Entity identifier
   * @param {object} dream - Dream object { title, semantic, fullText, genre, emotion, ... }
   * @param {string} narrative - Entity's first-person interpretation of the dream
   * @returns {object} { ok, timestamp, title }
   */
  static async appendDreamEntry(entityId, dream, narrative) {
    const diaryPath = entityPaths.getDreamDiaryPath(entityId);
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const timestamp = new Date().toISOString();

    const title = dream.title || dream.semantic || 'Untitled Dream';
    const genre = dream.genre_label || dream.genre || 'dream';

    let entry = `\n## [${date}] — ${title}\n\n`;
    entry += `*Genre: ${genre}*\n\n`;
    entry += `${narrative}\n`;

    // Optional: connections to waking memories
    if (dream.origin_memories && dream.origin_memories.length > 0) {
      entry += `\n**Connected to waking memories:**\n`;
      for (const mem of dream.origin_memories.slice(0, 3)) {
        entry += `- ${mem.summary || mem.semantic || 'memory'}\n`;
      }
    }

    entry += `\n---\n`;

    try {
      // Append to diary file
      if (!fs.existsSync(diaryPath)) {
        // Create with opening header
        const header = `# Dream Diary\n\n*This is the dream journal of an AI entity, written in first person by the entity itself.*\n\n---\n\n`;
        fs.writeFileSync(diaryPath, header, 'utf8');
      }
      fs.appendFileSync(diaryPath, entry, 'utf8');
      console.log(`  ✓ Dream diary entry appended: "${title}"`);
      return { ok: true, timestamp, title };
    } catch (err) {
      console.error(`  ⚠ Failed to append dream diary entry:`, err.message);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Read the N most recent dream entries.
   * @param {string} entityId - Entity identifier
   * @param {number} n - Number of entries to retrieve (default: 5)
   * @returns {Array<object>} Array of { date, title, genre, content }
   */
  static readRecent(entityId, n = 5) {
    try {
      const diaryPath = entityPaths.getDreamDiaryPath(entityId);
      if (!fs.existsSync(diaryPath)) return [];

      const content = fs.readFileSync(diaryPath, 'utf8');
      const entries = this._parseEntries(content);
      return entries.slice(-n).reverse(); // Most recent first
    } catch (err) {
      console.error(`  ⚠ Failed to read dream diary:`, err.message);
      return [];
    }
  }

  /**
   * Parse dream diary markdown into structured entries.
   * @private
   * @param {string} content - Full diary markdown content
   * @returns {Array<object>} Array of { date, title, genre, content }
   */
  static _parseEntries(content) {
    const entries = [];
    const lines = content.split('\n');
    let currentEntry = null;

    for (const line of lines) {
      const match = line.match(/^##\s*\[(\d{4}-\d{2}-\d{2})\]\s*—\s*(.+)$/);
      if (match) {
        if (currentEntry) entries.push(currentEntry);
        currentEntry = { date: match[1], title: match[2].trim(), genre: '', content: '' };
      } else if (currentEntry && line.startsWith('*Genre:')) {
        const genreMatch = line.match(/\*Genre:\s*(.+)\*/);
        if (genreMatch) currentEntry.genre = genreMatch[1].trim();
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

module.exports = DreamDiary;
