// ============================================================
// REM System — Dream Gallery UI
// Client-side code for displaying pixel art dream visualizations.
// ============================================================

/**
 * Load and display all dream visualization cycles.
 */
async function loadDreamGallery() {
  const grid = document.getElementById('dreamGalleryGrid');
  if (!grid) return;

  grid.innerHTML = '<div class="text-tertiary-c text-center" style="grid-column:1/-1;padding:var(--space-4)">Loading dream art...</div>';

  try {
    const resp = await fetch('/api/brain/pixel-art');
    const data = await resp.json();

    if (!data.ok || !data.cycles || data.cycles.length === 0) {
      grid.innerHTML = `
        <div class="text-tertiary-c text-center" style="grid-column:1/-1;padding:var(--space-8)">
          <div style="font-size:3rem;opacity:0.3;margin-bottom:var(--space-3)">&#127912;</div>
          <p>No dream visualizations yet.</p>
          <p class="text-xs-c mt-2">Dream art is generated automatically during sleep cycles,<br>or you can generate art manually using the button above.</p>
        </div>`;
      return;
    }

    grid.innerHTML = '';

    for (const cycle of data.cycles) {
      const card = document.createElement('div');
      card.className = 'config-card';
      card.style.cssText = 'padding:0;overflow:hidden;';

      // Determine the main display image
      const mainImage = cycle.hasGif
        ? `/api/brain/pixel-art/${cycle.id}/dream-cycle.gif`
        : cycle.frames.length > 0
          ? `/api/brain/pixel-art/${cycle.id}/${cycle.frames[0]}`
          : null;

      const meta = cycle.meta || {};
      const dreamCount = meta.frameCount || cycle.frames.length;
      const dateStr = meta.generated ? new Date(meta.generated).toLocaleDateString() : 'Unknown';
      const timeStr = meta.generated ? new Date(meta.generated).toLocaleTimeString() : '';

      // Build dream info list
      let dreamInfo = '';
      if (meta.dreams && meta.dreams.length > 0) {
        dreamInfo = meta.dreams.map(d =>
          `<span class="dream-tag" style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:0.7rem;background:var(--surface-secondary);color:var(--text-secondary);margin:2px">${d.emotion || 'neutral'} / ${d.genre || 'unknown'}</span>`
        ).join('');
      }

      card.innerHTML = `
        <div style="position:relative;background:#0a0a0a;display:flex;align-items:center;justify-content:center;min-height:200px">
          ${mainImage
            ? `<img src="${mainImage}" alt="Dream visualization" style="width:100%;image-rendering:pixelated;display:block" loading="lazy">`
            : '<div style="padding:var(--space-6);color:var(--text-tertiary)">No image</div>'
          }
          ${cycle.hasGif ? '<div style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.7);color:#fff;padding:2px 8px;border-radius:12px;font-size:0.65rem;letter-spacing:0.05em">GIF</div>' : ''}
        </div>
        <div style="padding:var(--space-3)">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm-c font-semibold">${dreamCount} Dream${dreamCount !== 1 ? 's' : ''}</span>
            <span class="text-xs-c text-tertiary-c">${dateStr} ${timeStr}</span>
          </div>
          ${dreamInfo ? `<div style="margin-bottom:var(--space-2)">${dreamInfo}</div>` : ''}
          <div class="text-xs-c text-tertiary-c">${meta.outputSize || 256}px &middot; ${meta.gridSize || 64}x${meta.gridSize || 64} grid</div>
          ${cycle.frames.length > 1 ? `
            <div class="flex gap-2 mt-2" style="flex-wrap:wrap">
              ${cycle.frames.map(f => `
                <img src="/api/brain/pixel-art/${cycle.id}/${f}" 
                     alt="${f}" 
                     style="width:48px;height:48px;image-rendering:pixelated;border-radius:4px;cursor:pointer;border:1px solid var(--border-default)"
                     onclick="showPixelArtModal('/api/brain/pixel-art/${cycle.id}/${f}', '${f}')"
                     title="${f}">
              `).join('')}
            </div>
          ` : ''}
        </div>`;

      grid.appendChild(card);
    }
  } catch (err) {
    grid.innerHTML = `<div class="text-tertiary-c text-center" style="grid-column:1/-1;padding:var(--space-4)">Failed to load: ${err.message}</div>`;
  }
}

/**
 * Show the generate art panel.
 */
function generateMemoryArt() {
  const panel = document.getElementById('generateArtPanel');
  if (panel) {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  }
}

/**
 * Submit a manual pixel art generation request.
 */
async function submitGenerateArt() {
  const narrative = document.getElementById('artNarrativeInput')?.value?.trim();
  const emotion = document.getElementById('artEmotionSelect')?.value || 'neutral';
  const genre = document.getElementById('artGenreSelect')?.value || 'abstract_vision';
  const statusEl = document.getElementById('artGenerateStatus');

  if (!narrative) {
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.textContent = 'Please enter some text to visualize.';
      statusEl.style.color = 'var(--warning)';
    }
    return;
  }

  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.textContent = 'Generating pixel art... this may take a moment.';
    statusEl.style.color = 'var(--info)';
  }

  try {
    const resp = await fetch('/api/brain/pixel-art/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ narrative, emotion, genre })
    });

    const data = await resp.json();

    if (data.ok) {
      if (statusEl) {
        statusEl.textContent = 'Pixel art generated!';
        statusEl.style.color = 'var(--accent-green)';
      }
      // Refresh the gallery to show the new art
      setTimeout(() => loadDreamGallery(), 500);
      // Hide the generate panel
      setTimeout(() => {
        document.getElementById('generateArtPanel').style.display = 'none';
        if (statusEl) statusEl.style.display = 'none';
      }, 2000);
    } else {
      if (statusEl) {
        statusEl.textContent = 'Error: ' + (data.error || 'Unknown error');
        statusEl.style.color = 'var(--danger)';
      }
    }
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = 'Request failed: ' + err.message;
      statusEl.style.color = 'var(--danger)';
    }
  }
}

/**
 * Show a pixel art image in a modal overlay for full-size viewing.
 */
function showPixelArtModal(src, title) {
  // Remove existing modal if any
  const existing = document.getElementById('pixelArtModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'pixelArtModal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-direction:column;gap:16px';
  modal.onclick = () => modal.remove();

  modal.innerHTML = `
    <img src="${src}" style="max-width:90vw;max-height:80vh;image-rendering:pixelated;border:2px solid var(--border-default);border-radius:8px" alt="${title}">
    <div style="color:#888;font-size:0.8rem">${title} &middot; Click anywhere to close</div>
  `;

  document.body.appendChild(modal);
}

// Auto-load the gallery when switching to the dream gallery tab
const _origSwitchMainTab = typeof switchMainTab === 'function' ? switchMainTab : null;
if (_origSwitchMainTab) {
  const _wrappedSwitch = switchMainTab;
  // We can't easily override, so we'll use a MutationObserver instead
}

// Use a simple observer to detect when the gallery tab becomes visible
const _dreamGalleryObserver = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.type === 'attributes' && m.attributeName === 'class') {
      const el = m.target;
      if (el.id === 'tab-dreamgallery' && el.classList.contains('on')) {
        loadDreamGallery();
      }
    }
  }
});

const _dreamGalleryTab = document.getElementById('tab-dreamgallery');
if (_dreamGalleryTab) {
  _dreamGalleryObserver.observe(_dreamGalleryTab, { attributes: true });
}

// ============================================================
// IMAGE GENERATION SETTINGS
// ============================================================

function toggleImageGenSettings() {
  const panel = document.getElementById('imageGenSettingsPanel');
  if (!panel) return;
  const visible = panel.style.display !== 'none';
  panel.style.display = visible ? 'none' : 'block';
  if (!visible) loadImageGenSettings();
}

async function onImageGenModeChange() {
  const mode = document.getElementById('imageGenMode')?.value || 'off';
  const apiSection = document.getElementById('imageApiConfigSection');
  const hint = document.getElementById('imageGenModeHint');
  const depPrompt = document.getElementById('pixelDepInstallPrompt');

  if (apiSection) apiSection.style.display = mode === 'api' ? 'block' : 'none';
  if (depPrompt) depPrompt.style.display = 'none';

  if (hint) {
    if (mode === 'pixel') hint.textContent = 'Uses the built-in 64\u00d764 pixel art engine. No API key needed.';
    else if (mode === 'api') hint.textContent = 'Uses an external image generation API (e.g. OpenAI DALL-E). Requires an API key.';
    else hint.textContent = 'No images will be generated during sleep cycles or manual generation.';
  }

  // When pixel mode selected, check if dependencies are installed
  if (mode === 'pixel') {
    try {
      const resp = await fetch('/api/brain/pixel-art/deps');
      const data = await resp.json();
      if (!data.installed) {
        if (depPrompt) depPrompt.style.display = 'block';
        if (hint) hint.textContent = 'Dependencies not installed \u2014 see instructions below.';
      }
    } catch (_) {}
  }
}

async function loadImageGenSettings() {
  try {
    const resp = await fetch('/api/sleep/config');
    const data = await resp.json();
    if (!data.ok) return;

    const cfg = data.config || {};
    const modeEl = document.getElementById('imageGenMode');
    const endpointEl = document.getElementById('imageApiEndpoint');
    const keyEl = document.getElementById('imageApiKey');
    const modelEl = document.getElementById('imageApiModel');

    if (modeEl) modeEl.value = cfg.imageGenMode || 'off';
    if (endpointEl) endpointEl.value = cfg.imageApiEndpoint || '';
    if (keyEl) keyEl.value = '';  // Never pre-fill passwords
    if (keyEl && cfg.imageApiKey) keyEl.placeholder = '\u2022\u2022\u2022\u2022\u2022\u2022 (saved)';
    if (modelEl) modelEl.value = cfg.imageApiModel || '';

    onImageGenModeChange();
  } catch (e) {
    console.warn('Failed to load image gen settings:', e);
  }
}

async function saveImageGenSettings() {
  const statusEl = document.getElementById('imageGenSaveStatus');
  const mode = document.getElementById('imageGenMode')?.value || 'off';
  const endpoint = (document.getElementById('imageApiEndpoint')?.value || '').trim();
  const key = (document.getElementById('imageApiKey')?.value || '').trim();
  const model = (document.getElementById('imageApiModel')?.value || '').trim();

  // Block saving pixel mode if deps are missing
  if (mode === 'pixel') {
    try {
      const depResp = await fetch('/api/brain/pixel-art/deps');
      const depData = await depResp.json();
      if (!depData.installed) {
        if (statusEl) {
          statusEl.style.display = 'block';
          statusEl.textContent = 'Install dependencies first: npm install @napi-rs/canvas gif-encoder-2';
          statusEl.style.color = 'var(--warning)';
        }
        return;
      }
    } catch (_) {}
  }

  const payload = { imageGenMode: mode };
  if (mode === 'api') {
    payload.imageApiEndpoint = endpoint;
    if (key) payload.imageApiKey = key;  // Only send if user typed a new key
    payload.imageApiModel = model;
  }

  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.textContent = 'Saving...';
    statusEl.style.color = 'var(--info)';
  }

  try {
    const resp = await fetch('/api/sleep/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();

    if (data.ok) {
      if (statusEl) {
        statusEl.textContent = 'Settings saved!';
        statusEl.style.color = 'var(--accent-green)';
      }
      setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 2000);
    } else {
      if (statusEl) {
        statusEl.textContent = 'Error: ' + (data.error || 'Unknown');
        statusEl.style.color = 'var(--danger)';
      }
    }
  } catch (e) {
    if (statusEl) {
      statusEl.textContent = 'Save failed: ' + e.message;
      statusEl.style.color = 'var(--danger)';
    }
  }
}
