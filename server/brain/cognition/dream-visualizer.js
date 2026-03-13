// ============================================================
// REM System — Dream Visualizer
//
// Generates animated GIFs from dream cycles by compositing
// pixel art frames. Each dream in a cycle becomes a frame,
// with smooth color transitions between them.
//
// Output: An animated GIF representing the entity's dream
// sequence — a visual "dream journal" entry.
// ============================================================

let _createCanvas = null;
let _GIFEncoder = null;

function requireCanvas() {
  if (!_createCanvas) {
    try { _createCanvas = require('@napi-rs/canvas').createCanvas; } catch (_) {}
  }
  if (!_createCanvas) throw new Error('MISSING_DEPS: @napi-rs/canvas is not installed. Run: npm install @napi-rs/canvas gif-encoder-2');
  return _createCanvas;
}

function requireGIF() {
  if (!_GIFEncoder) {
    try { _GIFEncoder = require('gif-encoder-2'); } catch (_) {}
  }
  if (!_GIFEncoder) throw new Error('MISSING_DEPS: gif-encoder-2 is not installed. Run: npm install @napi-rs/canvas gif-encoder-2');
  return _GIFEncoder;
}

const fs = require('fs');
const path = require('path');
const NekoPixelPro = require('../generation/pixel-art-engine');

class DreamVisualizer {
  constructor(options = {}) {
    this.pixelEngine = options.pixelEngine || new NekoPixelPro(options);
    this.gridSize = options.gridSize || 64;
    this.scale = options.scale || 4;  // 64*4 = 256px output
    this.frameDelay = options.frameDelay || 800; // ms per frame
    this.transitionFrames = options.transitionFrames || 4; // interpolation frames between dreams
    // Image generation mode: 'pixel' (built-in), 'api' (external), 'off' (disabled — default)
    this.imageGenMode = options.imageGenMode || 'off';
    this.imageApiEndpoint = options.imageApiEndpoint || '';
    this.imageApiKey = options.imageApiKey || '';
    this.imageApiModel = options.imageApiModel || '';
  }

  /**
   * Update image generation settings at runtime.
   */
  setImageGenConfig(config) {
    if (config.imageGenMode) this.imageGenMode = config.imageGenMode;
    if (config.imageApiEndpoint !== undefined) this.imageApiEndpoint = config.imageApiEndpoint;
    if (config.imageApiKey !== undefined) this.imageApiKey = config.imageApiKey;
    if (config.imageApiModel !== undefined) this.imageApiModel = config.imageApiModel;
  }

  /**
   * Generate an image via an external image generation API (OpenAI DALL-E compatible).
   * Returns { png: Buffer, metadata: object } or null on failure.
   */
  async generateImageFromAPI(narrative, emotion, genre) {
    if (!this.imageApiEndpoint || !this.imageApiKey) {
      console.warn('  ⚠ Image API not configured — falling back to pixel art');
      return null;
    }

    const prompt = `Pixel art style, 256x256, dreamlike ${emotion} scene: ${narrative.slice(0, 800)}`;
    const endpoint = this.imageApiEndpoint.trim();
    const apiKey = this.imageApiKey.trim();
    const model = this.imageApiModel.trim() || undefined;

    try {
      console.log(`  ✦ Calling image API: ${endpoint.replace(/\/+$/, '').split('/').pop()}`);
      const bodyObj = {
        prompt,
        n: 1,
        size: '256x256',
        response_format: 'b64_json'
      };
      if (model) bodyObj.model = model;

      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 60000);
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        signal: ac.signal,
        body: JSON.stringify(bodyObj)
      });
      clearTimeout(timer);

      if (!resp.ok) {
        const errText = await resp.text();
        console.warn(`  ⚠ Image API returned ${resp.status}: ${errText.slice(0, 200)}`);
        return null;
      }

      const data = await resp.json();
      const b64 = data?.data?.[0]?.b64_json;
      if (!b64) {
        console.warn('  ⚠ Image API returned no image data');
        return null;
      }

      const pngBuffer = Buffer.from(b64, 'base64');
      console.log(`  ✓ Image API returned ${Math.round(pngBuffer.length / 1024)}KB image`);

      return {
        png: pngBuffer,
        colorGrid: null,
        metadata: {
          engine: 'external-api',
          model: model || 'default',
          emotion,
          genre,
          generated: new Date().toISOString(),
          outputSize: 256,
          promptUsed: prompt.slice(0, 200)
        }
      };
    } catch (err) {
      if (err.name === 'AbortError') {
        console.warn('  ⚠ Image API timed out after 60s');
      } else {
        console.warn('  ⚠ Image API call failed:', err.message);
      }
      return null;
    }
  }

  /**
   * Generate pixel art for a single dream.
   * Returns { png, colorGrid, metadata }
   */
  async generateDreamFrame(dream, callLLM) {
    const narrative = dream.fullText || dream.content?.generated_content || dream.semantic || '';
    const emotion = dream.emotion || 'neutral';
    const genre = dream.genre || 'abstract_vision';

    return await this.pixelEngine.generateFromNarrative(narrative, {
      emotion,
      genre,
      scale: this.scale,
      callLLM
    });
  }

  /**
   * Interpolate between two color grids for smooth transitions.
   * @param {string[]} gridA — starting color grid
   * @param {string[]} gridB — ending color grid
   * @param {number} t — interpolation factor 0.0 to 1.0
   * @returns {string[]} — interpolated color grid
   */
  _interpolateGrids(gridA, gridB, t) {
    const result = new Array(gridA.length);
    for (let i = 0; i < gridA.length; i++) {
      const a = this._hexToRGB(gridA[i] || '#000000');
      const b = this._hexToRGB(gridB[i] || '#000000');
      const r = Math.round(a.r + (b.r - a.r) * t);
      const g = Math.round(a.g + (b.g - a.g) * t);
      const bl = Math.round(a.b + (b.b - a.b) * t);
      result[i] = this._rgbToHex(r, g, bl);
    }
    return result;
  }

  _hexToRGB(hex) {
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  _rgbToHex(r, g, b) {
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /**
   * Render a color grid to a canvas ImageData-compatible pixel array.
   * GIFEncoder expects raw RGBA pixel data via canvas context.
   */
  _renderGridToCanvas(ctx, colorGrid) {
    for (let y = 0; y < this.gridSize; y++) {
      for (let x = 0; x < this.gridSize; x++) {
        const color = colorGrid[y * this.gridSize + x] || '#000000';
        ctx.fillStyle = color;
        ctx.fillRect(x * this.scale, y * this.scale, this.scale, this.scale);
      }
    }
  }

  /**
   * Generate an animated GIF from a sequence of dream color grids.
   * @param {Array<{colorGrid: string[], metadata: object}>} frames
   * @returns {Buffer} — GIF buffer
   */
  async composeGIF(frames) {
    if (!frames || frames.length === 0) return null;

    const outputSize = this.gridSize * this.scale;
    const GIFEncoder = requireGIF();
    const encoder = new GIFEncoder(outputSize, outputSize, 'neuquant', true);

    encoder.setDelay(this.frameDelay);
    encoder.setRepeat(0); // Loop forever
    encoder.setQuality(10); // Lower = better quality but slower
    encoder.start();

    const canvas = requireCanvas()(outputSize, outputSize);
    const ctx = canvas.getContext('2d');

    for (let i = 0; i < frames.length; i++) {
      // Render the main dream frame (hold longer)
      this._renderGridToCanvas(ctx, frames[i].colorGrid);
      encoder.setDelay(this.frameDelay * 2); // Hold dream frames longer
      encoder.addFrame(ctx);

      // Add transition frames to next dream (if not last)
      if (i < frames.length - 1 && this.transitionFrames > 0) {
        encoder.setDelay(Math.floor(this.frameDelay / 2)); // Transitions are faster
        for (let t = 1; t <= this.transitionFrames; t++) {
          const factor = t / (this.transitionFrames + 1);
          const blended = this._interpolateGrids(
            frames[i].colorGrid,
            frames[i + 1].colorGrid,
            factor
          );
          this._renderGridToCanvas(ctx, blended);
          encoder.addFrame(ctx);
        }
      }
    }

    // Add a final transition back to first frame for seamless loop
    if (frames.length > 1 && this.transitionFrames > 0) {
      encoder.setDelay(Math.floor(this.frameDelay / 2));
      for (let t = 1; t <= this.transitionFrames; t++) {
        const factor = t / (this.transitionFrames + 1);
        const blended = this._interpolateGrids(
          frames[frames.length - 1].colorGrid,
          frames[0].colorGrid,
          factor
        );
        this._renderGridToCanvas(ctx, blended);
        encoder.addFrame(ctx);
      }
    }

    encoder.finish();
    return encoder.out.getData();
  }

  /**
   * Generate pixel art for all dreams in a cycle and compose a GIF.
   * This is the main entry point called after dream generation.
   *
   * @param {Array} dreams — array of dream objects from DreamEngine
   * @param {Function} callLLM — LLM caller function
   * @param {string} savePath — directory to save output files
   * @returns {{ gif: Buffer, frames: Array, savedFiles: object }}
   */
  async visualizeDreamCycle(dreams, callLLM, savePath) {
    if (!dreams || dreams.length === 0) {
      console.log('  ⚠ No dreams to visualize');
      return null;
    }

    // Check if image generation is disabled
    if (this.imageGenMode === 'off') {
      console.log('  ℹ Image generation is disabled — skipping visualization');
      return null;
    }

    const useApi = this.imageGenMode === 'api' && this.imageApiEndpoint && this.imageApiKey;
    console.log(`  ✦ Visualizing dream cycle: ${dreams.length} dream(s) → ${useApi ? 'API images' : 'pixel art + GIF'}`);

    const frames = [];

    // Generate art for each dream
    for (let i = 0; i < dreams.length; i++) {
      const dream = dreams[i];
      const narrative = dream.fullText || dream.content?.generated_content || dream.semantic || '';
      const emotion = dream.emotion || 'neutral';
      const genre = dream.genre || 'abstract_vision';
      console.log(`  ✦ Rendering dream ${i + 1}/${dreams.length}: ${genre}`);

      if (useApi) {
        const apiResult = await this.generateImageFromAPI(narrative, emotion, genre);
        if (apiResult) {
          frames.push(apiResult);
          continue;
        }
        // Fall through to pixel art if API fails
        console.log('  ℹ Falling back to built-in pixel art');
      }

      const frame = await this.generateDreamFrame(dream, callLLM);
      frames.push(frame);
    }

    // Compose animated GIF from pixel art frames (only if all frames have colorGrids)
    const allHaveGrids = frames.every(f => f.colorGrid);
    const gifBuffer = allHaveGrids ? await this.composeGIF(frames) : null;

    // Save files if path provided
    let savedFiles = {};
    if (savePath) {
      savedFiles = await this._saveArtifacts(frames, gifBuffer, dreams, savePath);
    }

    console.log(`  ✓ Dream visualization complete: ${frames.length} frames, GIF ${gifBuffer ? Math.round(gifBuffer.length / 1024) + 'KB' : 'none'}`);

    return {
      gif: gifBuffer,
      frames,
      savedFiles
    };
  }

  /**
   * Generate pixel art for a single memory (non-dream).
   * @param {object} memory — memory object with semantic/content
   * @param {Function} callLLM — LLM caller
   * @param {string} savePath — optional directory to save files
   * @returns {{ png: Buffer, colorGrid: string[], metadata: object }}
   */
  async visualizeMemory(memory, callLLM, savePath) {
    const narrative = memory.semantic || memory.content || '';
    const emotion = memory.emotionalTag || memory.emotion || 'neutral';

    console.log(`  ✦ Visualizing memory: ${(memory.id || 'unknown').slice(0, 30)}...`);

    const result = await this.pixelEngine.generateFromNarrative(narrative, {
      emotion,
      genre: 'memory_remix',
      scale: this.scale,
      callLLM
    });

    if (savePath) {
      if (!fs.existsSync(savePath)) {
        fs.mkdirSync(savePath, { recursive: true });
      }
      const pngPath = path.join(savePath, 'pixel-art.png');
      fs.writeFileSync(pngPath, result.png);
      console.log(`  ✓ Saved memory pixel art: ${pngPath}`);
    }

    return result;
  }

  /**
   * Save all visual artifacts for a dream cycle.
   */
  async _saveArtifacts(frames, gifBuffer, dreams, savePath) {
    if (!fs.existsSync(savePath)) {
      fs.mkdirSync(savePath, { recursive: true });
    }

    const saved = { frames: [], gif: null };

    // Save individual dream PNGs
    for (let i = 0; i < frames.length; i++) {
      const frameName = `dream-${i + 1}-${(dreams[i]?.genre || 'unknown')}.png`;
      const framePath = path.join(savePath, frameName);
      fs.writeFileSync(framePath, frames[i].png);
      saved.frames.push(framePath);
    }

    // Save the dream cycle GIF
    if (gifBuffer) {
      const gifPath = path.join(savePath, 'dream-cycle.gif');
      fs.writeFileSync(gifPath, gifBuffer);
      saved.gif = gifPath;
    }

    // Save metadata
    const metaPath = path.join(savePath, 'visualization-meta.json');
    const meta = {
      generated: new Date().toISOString(),
      frameCount: frames.length,
      gridSize: this.gridSize,
      scale: this.scale,
      outputSize: this.gridSize * this.scale,
      frameDelay: this.frameDelay,
      transitionFrames: this.transitionFrames,
      dreams: dreams.map((d, i) => ({
        index: i,
        genre: d.genre,
        emotion: d.emotion,
        file: `dream-${i + 1}-${(d.genre || 'unknown')}.png`
      }))
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

    console.log(`  ✓ Saved ${saved.frames.length} frame(s) + GIF to ${savePath}`);
    return saved;
  }
}

/**
 * Check whether optional pixel art / GIF dependencies are installed.
 */
DreamVisualizer.depsInstalled = function () {
  try {
    require.resolve('@napi-rs/canvas');
    require.resolve('gif-encoder-2');
    return true;
  } catch (_) {
    return false;
  }
};

module.exports = DreamVisualizer;
