// ============================================================
// REM System — Entity Manager
// Manages entity loading, creation, deletion, and switching
// ============================================================

const fs = require('fs');
const path = require('path');
const entityPaths = require('../../entities/entityPaths');

class EntityManager {
    /**
     * Get the memories directory for a specific entity
     */
    getEntityMemoriesDir(entityId) {
      return entityPaths.getMemoryRoot(entityId);
    }
  constructor(options = {}) {
    this.entitiesDir = path.join(__dirname, '../../../entities');
    this.currentEntity = null;
    this.currentEntityPath = null;

    // Ensure entities directory exists
    if (!fs.existsSync(this.entitiesDir)) {
      fs.mkdirSync(this.entitiesDir, { recursive: true });
      console.log('  ✓ Created entities directory');
    }
  }

  /**
   * List all available entities
   */
  listEntities() {
    try {
      const entitiesRaw = fs.readdirSync(this.entitiesDir)
        .filter(f => fs.statSync(path.join(this.entitiesDir, f)).isDirectory())
        .map(folder => {
          const entityPath = path.join(this.entitiesDir, folder);
          const entityFilePath = path.join(entityPath, 'entity.json');
          
          if (fs.existsSync(entityFilePath)) {
            try {
              const entity = JSON.parse(fs.readFileSync(entityFilePath, 'utf8'));
              const canonicalId = entityPaths.normalizeEntityId(folder);
              // Dynamically count episodic memories on disk
              let memCount = 0;
              try {
                const episodicDir = entityPaths.getEpisodicMemoryPath(canonicalId);
                if (fs.existsSync(episodicDir)) {
                  memCount = fs.readdirSync(episodicDir).filter(f => {
                    const fp = path.join(episodicDir, f);
                    return fs.statSync(fp).isDirectory() && (f.startsWith('mem_') || f.startsWith('ltm_'));
                  }).length;
                }
              } catch (_) { /* count stays 0 */ }
              return {
                id: canonicalId,
                sourceFolder: folder,
                name: entity.name,
                gender: entity.gender,
                traits: entity.personality_traits,
                configProfileRef: entity.configProfileRef || null,
                created: entity.created,
                memoryCount: memCount,
                introduction: entity.introduction,
                ownerId:  entity.ownerId  || null,
                isPublic: entity.isPublic === true
              };
            } catch (e) {
              return null;
            }
          }
          return null;
        })
        .filter(e => e !== null);

      // Deduplicate aliases that normalize to the same canonical id.
      const byId = new Map();
      for (const entity of entitiesRaw) {
        if (!byId.has(entity.id)) {
          byId.set(entity.id, entity);
          continue;
        }
        const existing = byId.get(entity.id);
        const existingTs = Date.parse(existing.created || '') || 0;
        const candidateTs = Date.parse(entity.created || '') || 0;
        if (candidateTs > existingTs) {
          byId.set(entity.id, entity);
        }
      }

      const entities = Array.from(byId.values()).map(({ sourceFolder, ...rest }) => rest);

      return entities;
    } catch (err) {
      console.error('  ⚠ Failed to list entities:', err.message);
      return [];
    }
  }

  /**
   * Load an entity by ID
   */
  loadEntity(entityId) {
    try {
      const canonicalId = entityPaths.normalizeEntityId(entityId);
      let entityPath = entityPaths.getEntityRoot(canonicalId);
      let entityFilePath = path.join(entityPath, 'entity.json');

      // Fallback for legacy duplicate folders (e.g., entity_entity_xxx)
      if (!fs.existsSync(entityFilePath)) {
        const candidates = fs.readdirSync(this.entitiesDir)
          .filter(f => fs.statSync(path.join(this.entitiesDir, f)).isDirectory())
          .filter(f => entityPaths.normalizeEntityId(f) === canonicalId)
          .map(folder => {
            const file = path.join(this.entitiesDir, folder, 'entity.json');
            if (!fs.existsSync(file)) return null;
            return { folder, file, mtime: fs.statSync(file).mtimeMs };
          })
          .filter(Boolean)
          .sort((a, b) => b.mtime - a.mtime);

        if (candidates.length > 0) {
          entityPath = path.join(this.entitiesDir, candidates[0].folder);
          entityFilePath = candidates[0].file;
        }
      }

      if (!fs.existsSync(entityFilePath)) {
        throw new Error(`Entity not found: ${entityId}`);
      }

      // Ensure entity folder structure exists (for legacy entities)
      this.createEntityFolder(canonicalId);

      const entity = JSON.parse(fs.readFileSync(entityFilePath, 'utf8'));
      entity.id = canonicalId; // Ensure entity has canonical id property
      this.currentEntity = entity;
      this.currentEntityPath = entityPath;

      console.log(`  ✓ Loaded entity: ${entity.name} (${canonicalId})`);
      return entity;
    } catch (err) {
      console.error('  ⚠ Failed to load entity:', err.message);
      throw err;
    }
  }

  /**
   * Get current active entity
   */
  getCurrentEntity() {
    return this.currentEntity;
  }

  /**
   * Get current entity path
   */
  getCurrentEntityPath() {
    return this.currentEntityPath;
  }

  /**
   * Get memories directory for current entity
   */
  getCurrentMemoriesDir() {
    if (!this.currentEntityPath || !this.currentEntity) {
      throw new Error('No entity loaded');
    }
    return entityPaths.getMemoryRoot(this.currentEntity.id);
  }

  /**
   * Create new entity folder structure
   */
  createEntityFolder(entityId) {
    try {
      const entityPath = entityPaths.getEntityRoot(entityId);
      const memoriesPath = entityPaths.getMemoryRoot(entityId);
      const episodicPath = entityPaths.getEpisodicMemoryPath(entityId);
      const dreamsPath = entityPaths.getDreamMemoryPath(entityId);
      const archivesPath = path.join(memoriesPath, 'archives');
      const goalsPath = path.join(memoriesPath, 'goals');
      const indexPath = entityPaths.getIndexPath(entityId);
      const beliefsPath = entityPaths.getBeliefsPath(entityId);

      // Paths are auto-created by entityPaths functions, but ensure archives/goals exist
      fs.mkdirSync(archivesPath, { recursive: true });
      fs.mkdirSync(goalsPath, { recursive: true });
      fs.mkdirSync(indexPath, { recursive: true });
      fs.mkdirSync(beliefsPath, { recursive: true });

      console.log(`  ✓ Created entity folder structure: ${entityId}`);
      return entityPath;
    } catch (err) {
      console.error('  ⚠ Failed to create entity folder:', err.message);
      throw err;
    }
  }

  /**
   * Delete entity completely
   */
  deleteEntity(entityId) {
    try {
      const canonicalId = entityPaths.normalizeEntityId(entityId);

      // Delete all folder aliases that normalize to this id.
      const matchingFolders = fs.readdirSync(this.entitiesDir)
        .filter(f => fs.statSync(path.join(this.entitiesDir, f)).isDirectory())
        .filter(f => entityPaths.normalizeEntityId(f) === canonicalId)
        .map(f => path.join(this.entitiesDir, f));

      if (matchingFolders.length === 0) {
        throw new Error(`Entity not found: ${entityId}`);
      }

      // Prevent deleting current entity
      if (entityPaths.normalizeEntityId(this.currentEntity?.id) === canonicalId) {
        this.currentEntity = null;
        this.currentEntityPath = null;
      }

      // Recursive delete
      const deleteRecursive = (dir) => {
        if (fs.existsSync(dir)) {
          fs.readdirSync(dir).forEach(file => {
            const filePath = path.join(dir, file);
            if (fs.statSync(filePath).isDirectory()) {
              deleteRecursive(filePath);
            } else {
              fs.unlinkSync(filePath);
            }
          });
          fs.rmdirSync(dir);
        }
      };

      for (const folderPath of matchingFolders) {
        deleteRecursive(folderPath);
      }
      console.log(`  ✓ Deleted entity: ${canonicalId} (${matchingFolders.length} folder(s) removed)`);
      return true;
    } catch (err) {
      console.error('  ⚠ Failed to delete entity:', err.message);
      throw err;
    }
  }

  /**
   * Rename entity
   */
  renameEntity(oldId, newId) {
    try {
      const oldPath = entityPaths.getEntityRoot(oldId);
      const newPath = entityPaths.getEntityRoot(newId);

      if (!fs.existsSync(oldPath)) {
        throw new Error(`Entity not found: ${oldId}`);
      }

      if (fs.existsSync(newPath)) {
        throw new Error(`Entity already exists: ${newId}`);
      }

      fs.renameSync(oldPath, newPath);
      
      // Update current entity reference if it's the one being renamed
      if (this.currentEntity?.id === oldId) {
        this.currentEntityPath = newPath;
      }

      console.log(`  ✓ Renamed entity: ${oldId} → ${newId}`);
      return true;
    } catch (err) {
      console.error('  ⚠ Failed to rename entity:', err.message);
      throw err;
    }
  }

  /**
   * Get entity state for display
   */
  getEntityState() {
    if (!this.currentEntity) {
      return {
        loaded: false,
        entity: null
      };
    }

    return {
      loaded: true,
      entity: {
        id: this.currentEntity.id,
        name: this.currentEntity.name,
        gender: this.currentEntity.gender,
        traits: this.currentEntity.personality_traits,
        emotionalBaseline: this.currentEntity.emotional_baseline,
        introduction: this.currentEntity.introduction,
        memoryCount: this.currentEntity.memory_count
      }
    };
  }
}

module.exports = EntityManager;
