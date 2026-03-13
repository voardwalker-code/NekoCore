// ============================================================
// REM System — Document Digest
// Ingests large documents into entity conscious memory
// Chunks are stored as sequential knowledge memories with trace graph connections
// ============================================================

let digestState = {
  processing: false,
  currentDoc: null,
  chunks: [],
  currentChunk: 0,
  progressCallback: null
};

/**
 * Notification adapter for shared notify API.
 */
function showDigestNotice(message, type) {
  const notifyApi = window.notify;
  if (!notifyApi || typeof notifyApi.show !== 'function') {
    console.log(`[DocumentDigest:${type || 'info'}] ${message}`);
    return;
  }

  const map = {
    success: 'ok',
    warning: 'warn',
    warn: 'warn',
    error: 'error',
    info: 'info'
  };

  notifyApi.show(message, map[type] || 'info');
}

/**
 * Initialize document digest UI
 */
function initDocumentDigest() {
  const dropZone = document.getElementById('documentDropZone');
  const fileInput = document.getElementById('documentFileInput');
  const browseBtn = document.getElementById('documentBrowseBtn');

  if (!dropZone || !fileInput || !browseBtn) {
    console.warn('Document digest UI elements not found');
    return;
  }

  // Drag & drop handlers
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleDocumentFile(files[0]);
    }
  });

  // Browse button
  browseBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleDocumentFile(e.target.files[0]);
    }
  });
}

/**
 * Handle uploaded document file
 */
async function handleDocumentFile(file) {
  if (digestState.processing) {
    showDigestNotice('Document ingestion already in progress', 'warning');
    return;
  }

  // Validate file type
  const validTypes = ['text/plain', 'text/markdown', 'application/json'];
  const validExtensions = ['.txt', '.md', '.json'];
  const isValid = validTypes.includes(file.type) || 
                  validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

  if (!isValid) {
    showDigestNotice('Only .txt, .md, and .json files are supported', 'error');
    return;
  }

  showDigestNotice(`Processing document: ${file.name}...`, 'info');

  try {
    const text = await readFileAsText(file);
    const chunks = chunkDocument(text, file.name);
    
    if (chunks.length === 0) {
      showDigestNotice('Document is empty or could not be chunked', 'error');
      return;
    }

    digestState.currentDoc = file.name;
    digestState.chunks = chunks;
    digestState.currentChunk = 0;
    digestState.processing = true;

    updateDigestProgress(0, chunks.length);
    await ingestChunksSequentially();

  } catch (err) {
    console.error('Document processing error:', err);
    showDigestNotice('Failed to process document: ' + err.message, 'error');
    digestState.processing = false;
  }
}

/**
 * Read file as text
 */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(new Error('File read failed'));
    reader.readAsText(file);
  });
}

/**
 * Chunk document into bite-sized pieces
 * Uses paragraph boundaries and max token estimate
 */
function chunkDocument(text, filename) {
  const MAX_CHUNK_TOKENS = 1500; // Rough estimate: 1 token ≈ 4 chars
  const MAX_CHUNK_CHARS = MAX_CHUNK_TOKENS * 4;
  const MIN_CHUNK_CHARS = 200;

  // Normalize line endings
  text = text.replace(/\r\n/g, '\n');

  // Split by double newline (paragraphs) or section markers
  let sections = text.split(/\n\n+/);
  
  // If no clear paragraphs, split by single newlines
  if (sections.length === 1 && text.length > MAX_CHUNK_CHARS) {
    sections = text.split(/\n/);
  }

  const chunks = [];
  let currentChunk = '';
  let chunkIndex = 0;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim();
    if (!section) continue;

    // If adding this section would exceed max, finalize current chunk
    if (currentChunk && (currentChunk.length + section.length + 2) > MAX_CHUNK_CHARS) {
      if (currentChunk.length >= MIN_CHUNK_CHARS) {
        chunks.push({
          index: chunkIndex++,
          content: currentChunk.trim(),
          filename: filename,
          totalChunks: -1 // Will be set at the end
        });
        currentChunk = '';
      }
    }

    // Add section to current chunk
    if (currentChunk) {
      currentChunk += '\n\n' + section;
    } else {
      currentChunk = section;
    }

    // If this section alone is too large, split it further
    if (currentChunk.length > MAX_CHUNK_CHARS * 1.5) {
      // Split by sentences
      const sentences = currentChunk.match(/[^.!?]+[.!?]+/g) || [currentChunk];
      currentChunk = '';
      let sentenceBuffer = '';

      for (const sentence of sentences) {
        if (sentenceBuffer && (sentenceBuffer.length + sentence.length) > MAX_CHUNK_CHARS) {
          chunks.push({
            index: chunkIndex++,
            content: sentenceBuffer.trim(),
            filename: filename,
            totalChunks: -1
          });
          sentenceBuffer = sentence;
        } else {
          sentenceBuffer += sentence;
        }
      }
      currentChunk = sentenceBuffer;
    }
  }

  // Add final chunk
  if (currentChunk.length >= MIN_CHUNK_CHARS) {
    chunks.push({
      index: chunkIndex++,
      content: currentChunk.trim(),
      filename: filename,
      totalChunks: -1
    });
  }

  // Set totalChunks for all
  chunks.forEach(c => c.totalChunks = chunks.length);

  return chunks;
}

/**
 * Ingest chunks sequentially to server
 */
async function ingestChunksSequentially() {
  const chunks = digestState.chunks;
  
  for (let i = 0; i < chunks.length; i++) {
    digestState.currentChunk = i;
    updateDigestProgress(i + 1, chunks.length);

    try {
      await ingestChunk(chunks[i], i === 0 ? null : chunks[i - 1].chunkId);
      
      // Small delay to avoid overwhelming server
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (err) {
      console.error(`Failed to ingest chunk ${i + 1}:`, err);
      showDigestNotice(`Ingestion failed at chunk ${i + 1}/${chunks.length}`, 'error');
      digestState.processing = false;
      return;
    }
  }

  digestState.processing = false;
  showDigestNotice(`Document ingested: ${chunks.length} knowledge chunks stored`, 'success');
  clearDigestProgress();
}

/**
 * Send single chunk to server
 */
async function ingestChunk(chunk, previousChunkId) {
  const resp = await fetch('/api/document/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: chunk.content,
      filename: chunk.filename,
      chunkIndex: chunk.index,
      totalChunks: chunk.totalChunks,
      previousChunkId: previousChunkId
    })
  });

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`Server error: ${error}`);
  }

  const result = await resp.json();
  if (!result.ok) {
    throw new Error(result.error || 'Unknown error');
  }

  // Store chunkId for next iteration
  chunk.chunkId = result.chunkId;
  return result;
}

/**
 * Update progress UI
 */
function updateDigestProgress(current, total) {
  const progressEl = document.getElementById('documentDigestProgress');
  const progressBar = document.getElementById('documentDigestProgressBar');
  const progressText = document.getElementById('documentDigestProgressText');

  if (!progressEl || !progressBar || !progressText) return;

  progressEl.style.display = 'block';
  const percent = Math.round((current / total) * 100);
  progressBar.style.width = percent + '%';
  progressText.textContent = `${current} / ${total} chunks`;
}

/**
 * Clear progress UI
 */
function clearDigestProgress() {
  const progressEl = document.getElementById('documentDigestProgress');
  if (progressEl) {
    setTimeout(() => {
      progressEl.style.display = 'none';
    }, 2000);
  }
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDocumentDigest);
} else {
  initDocumentDigest();
}
