// ============================================================
// REM System v0.6.0 — Memory UI Module
// Handles: Loading and displaying memory archives from the server
// ============================================================

// Load all memory archives from the server and stream them into chat
async function loadServerMemories() {
  try {
    const resp = await fetch('/api/memories');
    if (!resp.ok) throw new Error('Unable to reach server');
    const data = await resp.json();
    if (data.ok && Array.isArray(data.archives) && data.archives.length > 0) {
      // Server already filters out system/meta files — these are pure archives
      const archives = data.archives
        .map(a => a.content || '')
        .filter(c => c.length > 0);

      if (archives.length > 0) {
        lg('info', 'Loading ' + archives.length + ' memory archive(s) from server');
        loadArchivesIntoChat(archives);
      } else {
        lg('info', 'No memory archives found on server');
      }
    }
  } catch (e) {
    lg('warn', 'Could not load server memories: ' + e.message);
  }

}


