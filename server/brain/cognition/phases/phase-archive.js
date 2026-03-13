// Phase: Archive Processing
// Converts unprocessed archived conversations into permanent memories.
// Runs every brain loop cycle.

const fs = require('fs');

async function archivePhase(loop) {
  loop._emit('phase', { name: 'archive', status: 'running' });
  const archives = loop.getUnprocessedArchives();

  if (archives.length === 0) {
    loop._emit('phase', { name: 'archive', status: 'done' });
    return;
  }

  console.log(`  ✓ Archive phase: processing ${archives.length} archives`);

  for (const archivePath of archives) {
    try {
      const archiveData = JSON.parse(fs.readFileSync(archivePath, 'utf8'));

      let traceId = null;
      if (loop.traceGraph) {
        traceId = loop.traceGraph.createTrace('archive_processing', archivePath);
      }

      const episodic = loop._subconsciousAgent.createEpisodicMemory(archiveData);
      const semantic = loop._subconsciousAgent.createSemanticMemory(archiveData);

      if (loop.neurochemistry) {
        if (episodic) episodic.emotionalTag = loop.neurochemistry.createEmotionalTag();
        if (semantic) semantic.emotionalTag = loop.neurochemistry.createEmotionalTag();
      }

      if (loop.memoryStorage) {
        if (episodic) {
          const memId = await loop.memoryStorage.storeMemory(episodic);
          if (traceId) loop.traceGraph.addStep(archivePath, memId, 'archive_processing');
        }
        if (semantic) await loop.memoryStorage.storeMemory(semantic);
      }

      if (loop._memoryIndex) {
        if (episodic) loop._memoryIndex.addEpisodicMemory(episodic);
        if (semantic) loop._memoryIndex.addSemanticMemory(semantic);
      }

      if (loop._identityManager) loop._identityManager.updateFromArchive(archiveData);

      if (traceId && loop.traceGraph) loop.traceGraph.closeTrace();
      loop.markArchiveProcessed(archivePath);
    } catch (err) {
      console.error(`  ⚠ Error processing archive ${archivePath}:`, err.message);
    }
  }

  loop._emit('phase', { name: 'archive', status: 'done' });
}

module.exports = archivePhase;
