const fs = require('fs');
const path = require('path');
const entityPaths = require('../../entityPaths');

class ImageGenerator {
  constructor(options = {}) {
    this.entityId = options.entityId;
    this.config = options.config || {};
  }

  _isEnabled() {
    return !!(this.config && this.config.enabled);
  }

  _buildPrompt(memory) {
    const summary = String(memory.semantic || memory.summary || '').trim();
    const narrative = String(memory.narrative || '').trim();
    const topics = Array.isArray(memory.topics) ? memory.topics.join(', ') : '';
    const emotion = memory.emotion || memory.emotionalTag || 'neutral';

    return [
      'Create a vivid, symbolic memory snapshot illustration.',
      summary ? `Summary: ${summary}` : '',
      narrative ? `Narrative: ${narrative.slice(0, 400)}` : '',
      topics ? `Topics: ${topics}` : '',
      `Emotion: ${emotion}`,
      'Style: cinematic digital art, high detail, coherent composition, no text overlays.'
    ].filter(Boolean).join('\n');
  }

  async _fetchImage(prompt) {
    const endpoint = (this.config.endpoint || '').trim();
    const apiKey = (this.config.apiKey || '').trim();
    if (!endpoint) return null;

    const payload = {
      prompt,
      model: this.config.model || undefined,
      size: this.config.size || '1024x1024'
    };

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Image API error ${resp.status}: ${text.slice(0, 200)}`);
    }

    const data = await resp.json();

    // Supports common response shapes:
    // { data:[{ b64_json }] } or { data:[{ url }] } or { imageBase64 } or { imageUrl }
    const b64 = data?.data?.[0]?.b64_json || data?.imageBase64 || null;
    if (b64) {
      return Buffer.from(b64, 'base64');
    }

    const url = data?.data?.[0]?.url || data?.imageUrl || null;
    if (url) {
      const imgResp = await fetch(url);
      if (!imgResp.ok) throw new Error(`Image download failed: ${imgResp.status}`);
      const arr = await imgResp.arrayBuffer();
      return Buffer.from(arr);
    }

    return null;
  }

  async generateForMemory(memory) {
    try {
      if (!this._isEnabled()) return null;
      if (!this.entityId) return null;

      const memoryId = memory.id || memory.memory_id;
      if (!memoryId) return null;

      const prompt = this._buildPrompt(memory);
      const bytes = await this._fetchImage(prompt);
      if (!bytes) return null;

      const imagesDir = entityPaths.getMemoryImagesPath(this.entityId);
      const outPath = path.join(imagesDir, `${memoryId}.png`);
      fs.writeFileSync(outPath, bytes);

      return {
        imagePath: outPath,
        prompt,
        backend: this.config.backend || 'custom'
      };
    } catch (err) {
      console.warn(`  ⚠ Image generation failed: ${err.message}`);
      return null;
    }
  }
}

module.exports = ImageGenerator;
