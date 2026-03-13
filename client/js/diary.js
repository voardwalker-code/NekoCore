// ============================================================
// REM System — Life Diary & Dream Diary UI
// Fetches, renders, and displays diary markdown with images.
// ============================================================

let _lifeDiaryLoaded = false;
let _dreamDiaryLoaded = false;

/**
 * Simple markdown-to-HTML renderer (handles headers, bold, italic, images, lists, hr).
 */
function renderDiaryMarkdown(md) {
  if (!md || !md.trim()) return '';
  const lines = md.split('\n');
  let html = '';
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Horizontal rule
    if (/^---+\s*$/.test(line)) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<hr class="diary-hr">';
      continue;
    }

    // Headers
    if (line.startsWith('# ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<h1 class="diary-h1">' + escDiary(line.slice(2)) + '</h1>';
      continue;
    }
    if (line.startsWith('## ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<h2 class="diary-h2">' + formatInline(line.slice(3)) + '</h2>';
      continue;
    }
    if (line.startsWith('### ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<h3 class="diary-h3">' + formatInline(line.slice(4)) + '</h3>';
      continue;
    }

    // Images: ![alt](src)
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (imgMatch) {
      if (inList) { html += '</ul>'; inList = false; }
      const alt = escDiary(imgMatch[1]);
      const src = imgMatch[2];
      html += '<div class="diary-image-wrap"><img src="' + src + '" alt="' + alt + '" class="diary-image" loading="lazy" onclick="showPixelArtModal(\'' + src + '\', \'' + alt + '\')"></div>';
      continue;
    }

    // List items
    if (/^[-*]\s/.test(line)) {
      if (!inList) { html += '<ul class="diary-list">'; inList = true; }
      html += '<li>' + formatInline(line.replace(/^[-*]\s/, '')) + '</li>';
      continue;
    }

    // Close list if needed
    if (inList && line.trim() === '') {
      html += '</ul>';
      inList = false;
    }

    // Empty line = paragraph break
    if (line.trim() === '') {
      html += '<div class="diary-spacer"></div>';
      continue;
    }

    // Regular paragraph
    html += '<p class="diary-p">' + formatInline(line) + '</p>';
  }

  if (inList) html += '</ul>';
  return html;
}

function escDiary(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

function formatInline(text) {
  let s = escDiary(text);
  // Bold **text**
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic *text*
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline images ![alt](src)
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="diary-image-inline" loading="lazy">');
  return s;
}

/**
 * Load and render the Life Diary.
 */
async function loadLifeDiary() {
  const container = document.getElementById('lifeDiaryContent');
  if (!container) return;

  container.innerHTML = '<div class="text-tertiary-c text-center" style="padding:var(--space-4)">Loading life diary...</div>';

  try {
    const resp = await fetch('/api/diary/life');
    const data = await resp.json();

    if (!data.ok || !data.text || data.text.trim().length < 20) {
      container.innerHTML = '<div class="text-tertiary-c text-center" style="padding:var(--space-8)"><div style="font-size:3rem;opacity:0.3;margin-bottom:var(--space-3)">&#128214;</div><p>No life diary entries yet.</p></div>';
      return;
    }

    container.innerHTML = renderDiaryMarkdown(data.text);
    _lifeDiaryLoaded = true;

    // Enable download link
    const dl = document.getElementById('lifeDiaryDownload');
    if (dl) {
      const blob = new Blob([data.text], { type: 'text/markdown' });
      dl.href = URL.createObjectURL(blob);
      dl.download = 'life-diary.md';
      dl.style.display = 'inline-flex';
    }
  } catch (err) {
    container.innerHTML = '<div class="text-tertiary-c text-center" style="padding:var(--space-4)">Failed to load: ' + err.message + '</div>';
  }
}

/**
 * Load and render the Dream Diary.
 */
async function loadDreamDiary() {
  const container = document.getElementById('dreamDiaryContent');
  if (!container) return;

  container.innerHTML = '<div class="text-tertiary-c text-center" style="padding:var(--space-4)">Loading dream diary...</div>';

  try {
    const resp = await fetch('/api/diary/dream');
    const data = await resp.json();

    if (!data.ok || !data.text || data.text.trim().length < 20) {
      container.innerHTML = '<div class="text-tertiary-c text-center" style="padding:var(--space-8)"><div style="font-size:3rem;opacity:0.3;margin-bottom:var(--space-3)">&#127769;</div><p>No dream diary entries yet.</p><p class="text-xs-c mt-2">Dream diary entries are created during sleep cycles.</p></div>';
      return;
    }

    container.innerHTML = renderDiaryMarkdown(data.text);
    _dreamDiaryLoaded = true;

    // Enable download link
    const dl = document.getElementById('dreamDiaryDownload');
    if (dl) {
      const blob = new Blob([data.text], { type: 'text/markdown' });
      dl.href = URL.createObjectURL(blob);
      dl.download = 'dream-diary.md';
      dl.style.display = 'inline-flex';
    }
  } catch (err) {
    container.innerHTML = '<div class="text-tertiary-c text-center" style="padding:var(--space-4)">Failed to load: ' + err.message + '</div>';
  }
}
