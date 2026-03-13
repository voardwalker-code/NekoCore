// GET /api/entity-last-memory — get summary of the last memory for the current entity
// Returns { ok: true, summary: string, memory: object|null }
// NOTE: Expects `currentEntityId` and `currentEntityName` to be passed in via closure/bind from server.js
const fs = require('fs');
const path = require('path');
const entityPaths = require('./entities/entityPaths');

module.exports = function createEntityLastMemoryHandler(getEntityContext) {
  return async function entityLastMemoryHandler(req, res) {
    const apiHeaders = { 'Content-Type': 'application/json' };
    try {
      const { entityId, entityName } = getEntityContext();
      if (!entityId) {
        res.writeHead(200, apiHeaders);
        res.end(JSON.stringify({ ok: false, error: 'No entity loaded' }));
        return;
      }

      // 1. Try to find the most recent archive (actual conversation)
      const archivesDir = path.join(entityPaths.getMemoryRoot(entityId), 'archives');
      if (fs.existsSync(archivesDir)) {
        const archiveFiles = fs.readdirSync(archivesDir)
          .filter(f => f.endsWith('.json'))
          .sort()
          .reverse();

        for (const file of archiveFiles) {
          try {
            const archive = JSON.parse(fs.readFileSync(path.join(archivesDir, file), 'utf8'));
            const msgs = archive.messages || [];
            if (msgs.length === 0) continue;

            // Build a concise summary from the last few user/assistant messages
            const conversationMsgs = msgs.filter(m => m.role === 'user' || m.role === 'assistant');
            const recent = conversationMsgs.slice(-6); // last 3 exchanges max
            const lines = [];
            for (const m of recent) {
              const role = m.role === 'user' ? 'You' : (entityName || 'Entity');
              let text = (m.content || '').trim();
              if (text.length > 200) text = text.substring(0, 200) + '...';
              lines.push(`**${role}:** ${text}`);
            }
            const summary = lines.join('\n\n');
            const created = archive.created || file.replace('archive_', '').replace('.json', '');
            res.writeHead(200, apiHeaders);
            res.end(JSON.stringify({ ok: true, summary, memory: { source: 'archive', file, created, messages: conversationMsgs } }));
            return;
          } catch (_) { continue; }
        }
      }

      // 2. Fallback: most recent episodic memory semantic summary
      const episodicDir = entityPaths.getEpisodicMemoryPath(entityId);
      if (fs.existsSync(episodicDir)) {
        const memFolders = fs.readdirSync(episodicDir)
          .filter(f => f.startsWith('mem_'))
          .sort()
          .reverse();

        for (const memId of memFolders) {
          const semPath = path.join(episodicDir, memId, 'semantic.txt');
          if (fs.existsSync(semPath)) {
            const semantic = fs.readFileSync(semPath, 'utf8').trim();
            if (semantic) {
              res.writeHead(200, apiHeaders);
              res.end(JSON.stringify({ ok: true, summary: semantic, memory: { source: 'episodic', id: memId } }));
              return;
            }
          }
        }
      }

      res.writeHead(200, apiHeaders);
      res.end(JSON.stringify({ ok: true, summary: 'No previous memories found.', memory: null }));
    } catch (e) {
      res.writeHead(500, apiHeaders);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  };
};
