// ============================================================
// REM System — Archive Manager Module
// Manages conversation archives, storage, and retrieval.
// ============================================================

const fs = require('fs');
const path = require('path');

class ArchiveManager {
  constructor(options = {}) {
    this.memDir = options.memDir || path.join(__dirname, '../../../memories');
    this.archiveDir = path.join(this.memDir, 'archives');
    this.maxArchives = options.maxArchives || 500;
    
    // Ensure archive directory exists
    if (!fs.existsSync(this.archiveDir)) {
      fs.mkdirSync(this.archiveDir, { recursive: true });
    }
  }

  /**
   * Redirect to a new memory directory (e.g. per-entity).
   */
  setMemDir(memDir) {
    this.memDir = memDir;
    this.archiveDir = path.join(this.memDir, 'archives');
    if (!fs.existsSync(this.archiveDir)) {
      fs.mkdirSync(this.archiveDir, { recursive: true });
    }
  }

  /**
   * Create and save a new archive from chat messages
   */
  saveArchive(conversationData) {
    try {
      const archiveName = `archive_${Date.now()}.json`;
      const archivePath = path.join(this.archiveDir, archiveName);
      
      // Add metadata
      const archiveWithMeta = {
        ...conversationData,
        archived_at: new Date().toISOString(),
        processed: false,
        id: archiveName.replace('.json', '')
      };
      
      fs.writeFileSync(
        archivePath,
        JSON.stringify(archiveWithMeta, null, 2),
        'utf8'
      );
      
      console.log(`  ✓ Saved archive: ${archiveName}`);
      
      // Clean up old archives if exceeded max
      this.trimOldArchives();
      
      return archivePath;
    } catch (err) {
      console.error('  ⚠ Archive save failed:', err.message);
      throw err;
    }
  }

  /**
   * Retrieve an archive by ID or filename
   */
  getArchive(archiveId) {
    try {
      const archivePath = path.join(
        this.archiveDir,
        archiveId.endsWith('.json') ? archiveId : `${archiveId}.json`
      );
      
      if (!fs.existsSync(archivePath)) {
        console.warn(`  ⚠ Archive not found: ${archiveId}`);
        return null;
      }
      
      const data = fs.readFileSync(archivePath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      console.error('  ⚠ Archive read failed:', err.message);
      return null;
    }
  }

  /**
   * Get all unprocessed archives
   */
  getUnprocessedArchives() {
    try {
      if (!fs.existsSync(this.archiveDir)) {
        return [];
      }
      
      return fs.readdirSync(this.archiveDir)
        .filter(f => f.endsWith('.json') && !f.includes('_processed'))
        .map(f => ({
          id: f.replace('.json', ''),
          filename: f,
          path: path.join(this.archiveDir, f)
        }));
    } catch (err) {
      console.error('  ⚠ Error reading archives:', err.message);
      return [];
    }
  }

  /**
   * Mark an archive as processed
   */
  markAsProcessed(archiveId) {
    try {
      const archivePath = path.join(
        this.archiveDir,
        archiveId.endsWith('.json') ? archiveId : `${archiveId}.json`
      );
      
      if (!fs.existsSync(archivePath)) {
        console.warn(`  ⚠ Archive not found: ${archiveId}`);
        return false;
      }
      
      // Read, update, and rewrite
      const data = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
      data.processed = true;
      data.processed_at = new Date().toISOString();
      
      fs.writeFileSync(archivePath, JSON.stringify(data, null, 2), 'utf8');
      
      console.log(`  ✓ Marked archive as processed: ${archiveId}`);
      return true;
    } catch (err) {
      console.error('  ⚠ Error marking archive as processed:', err.message);
      return false;
    }
  }

  /**
   * List all archives with metadata
   */
  listArchives(limit = 20, offset = 0) {
    try {
      if (!fs.existsSync(this.archiveDir)) {
        return [];
      }
      
      const files = fs.readdirSync(this.archiveDir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse(); // Most recent first
      
      return files.slice(offset, offset + limit).map(f => {
        const fullPath = path.join(this.archiveDir, f);
        const stat = fs.statSync(fullPath);
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        
        return {
          id: f.replace('.json', ''),
          filename: f,
          size: stat.size,
          created: stat.birthtime,
          modified: stat.mtime,
          processed: data.processed || false,
          messageCount: (data.messages || []).length
        };
      });
    } catch (err) {
      console.error('  ⚠ Error listing archives:', err.message);
      return [];
    }
  }

  /**
   * Delete old archives to maintain max count
   */
  trimOldArchives() {
    try {
      if (!fs.existsSync(this.archiveDir)) {
        return;
      }
      
      const files = fs.readdirSync(this.archiveDir)
        .filter(f => f.endsWith('.json'))
        .sort(); // Oldest first
      
      if (files.length > this.maxArchives) {
        const toDelete = files.slice(0, files.length - this.maxArchives);
        toDelete.forEach(f => {
          try {
            fs.unlinkSync(path.join(this.archiveDir, f));
            console.log(`  ✓ Deleted old archive: ${f}`);
          } catch (err) {
            console.warn(`  ⚠ Could not delete ${f}:`, err.message);
          }
        });
      }
    } catch (err) {
      console.error('  ⚠ Error trimming archives:', err.message);
    }
  }

  /**
   * Export archive in different formats
   */
  exportArchive(archiveId, format = 'json') {
    const archive = this.getArchive(archiveId);
    if (!archive) return null;
    
    switch (format) {
      case 'json':
        return JSON.stringify(archive, null, 2);
      
      case 'txt':
        // Convert to readable text
        let txt = `Archive: ${archiveId}\nCreated: ${archive.archived_at}\n\n`;
        if (archive.messages) {
          archive.messages.forEach(msg => {
            txt += `[${msg.role.toUpperCase()}] ${msg.content}\n\n`;
          });
        }
        return txt;
      
      case 'csv':
        // Convert to CSV
        let csv = 'timestamp,role,content\n';
        if (archive.messages) {
          archive.messages.forEach(msg => {
            const content = (msg.content || '').replace(/"/g, '""');
            csv += `"${msg.timestamp}","${msg.role}","${content}"\n`;
          });
        }
        return csv;
      
      default:
        return JSON.stringify(archive, null, 2);
    }
  }

  /**
   * Get archive statistics
   */
  getStats() {
    try {
      const archives = this.listArchives(this.maxArchives);
      const total = archives.length;
      const processed = archives.filter(a => a.processed).length;
      const totalMessages = archives.reduce((sum, a) => sum + (a.messageCount || 0), 0);
      const totalSize = archives.reduce((sum, a) => sum + (a.size || 0), 0);
      
      return {
        total,
        processed,
        unprocessed: total - processed,
        totalMessages,
        totalSize,
        avgMessagesPerArchive: total > 0 ? totalMessages / total : 0,
        avgSize: total > 0 ? totalSize / total : 0
      };
    } catch (err) {
      console.error('  ⚠ Error getting stats:', err.message);
      return {};
    }
  }

  /**
   * Clear all archives (use with caution)
   */
  clearAllArchives() {
    try {
      if (!fs.existsSync(this.archiveDir)) {
        return true;
      }
      
      const files = fs.readdirSync(this.archiveDir);
      files.forEach(f => {
        try {
          fs.unlinkSync(path.join(this.archiveDir, f));
        } catch (err) {
          console.warn(`  ⚠ Could not delete ${f}:`, err.message);
        }
      });
      
      console.log('  ✓ Cleared all archives');
      return true;
    } catch (err) {
      console.error('  ⚠ Error clearing archives:', err.message);
      return false;
    }
  }
}

module.exports = ArchiveManager;
