const fs = require('fs');
const path = require('path');
const entityPaths = require('../../entities/entityPaths');

class MemoryImages {
  constructor(options = {}) {
    this.entityId = options.entityId;
    if (!this.entityId) throw new Error('MemoryImages requires entityId');

    this.imagesDir = entityPaths.getMemoryImagesPath(this.entityId);
    this.indexPath = path.join(this.imagesDir, 'index.json');
    this._index = this._loadIndex();
  }

  _loadIndex() {
    try {
      if (!fs.existsSync(this.indexPath)) return {};
      const raw = fs.readFileSync(this.indexPath, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  _saveIndex() {
    fs.writeFileSync(this.indexPath, JSON.stringify(this._index, null, 2), 'utf8');
  }

  setImagePath(memoryId, imagePath, metadata = {}) {
    if (!memoryId || !imagePath) return;
    this._index[memoryId] = {
      path: imagePath,
      prompt: metadata.prompt || '',
      backend: metadata.backend || 'unknown',
      createdAt: new Date().toISOString()
    };
    this._saveIndex();
  }

  getImagePath(memoryId) {
    if (!memoryId) return null;
    const rec = this._index[memoryId];
    if (!rec || !rec.path) return null;
    if (!fs.existsSync(rec.path)) return null;
    return rec.path;
  }

  getMetadata(memoryId) {
    if (!memoryId) return null;
    const rec = this._index[memoryId];
    if (!rec) return null;
    if (!rec.path || !fs.existsSync(rec.path)) return null;
    return rec;
  }

  hasImage(memoryId) {
    return !!this.getImagePath(memoryId);
  }
}

module.exports = MemoryImages;
