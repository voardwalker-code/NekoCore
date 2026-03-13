// ============================================================
// REM System — Model Router Module
// Routes LLM calls to appropriate models based on cognitive role.
// ============================================================

const fs = require('fs');
const path = require('path');

class ModelRouter {
  constructor(options = {}) {
    this.configPath = path.join(
      __dirname, 
      options.configPath || '../../Config/models.json'
    );
    this.legacyConfigPath = path.join(__dirname, '../../config/models.json');
    
    this.models = {
      conscious: null,
      subconscious: null,
      persona: null
    };
    
    this.callRegistry = {}; // Track model usage
    this.load();
  }

  /**
   * Load model configuration from file
   */
  load() {
    try {
      this.migrateLegacyConfigIfNeeded();
      if (fs.existsSync(this.configPath)) {
        const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        this.models = config;
        console.log('  ✓ Model configuration loaded');
      } else {
        console.warn('  ⚠ Model config not found, using defaults');
        this.loadDefaults();
      }
    } catch (err) {
      console.warn('  ⚠ Could not load model config:', err.message);
      this.loadDefaults();
    }
  }

  /**
   * Migrate legacy model-router config from server/config/models.json
   * to the centralized root Config/models.json location.
   */
  migrateLegacyConfigIfNeeded() {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(this.configPath)) return;
      if (!fs.existsSync(this.legacyConfigPath)) return;
      fs.copyFileSync(this.legacyConfigPath, this.configPath);
      console.log('  ✓ Migrated model config to centralized Config folder');
    } catch (err) {
      console.warn('  ⚠ Could not migrate legacy model config:', err.message);
    }
  }

  /**
   * Load default model configuration
   */
  loadDefaults() {
    this.models = {
      conscious: 'openai:gpt-4o',    // Main conversation model
      subconscious: 'local:ollama',  // Local model for subconscious processing
      persona: 'openai:gpt-4o'       // Model for identity/personality
    };
  }

  /**
   * Save model configuration to file
   */
  save() {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.configPath, JSON.stringify(this.models, null, 2), 'utf8');
      console.log('  ✓ Model configuration saved');
    } catch (err) {
      console.error('  ⚠ Could not save model config:', err.message);
    }
  }

  /**
   * Route an LLM call based on cognitive role
   * Role: 'conscious' | 'subconscious' | 'persona'
   */
  async routeCall(prompt, role = 'conscious', externalCallLLM = null) {
    // Record the call
    this.recordCall(role);
    
    // Get the model for this role
    const modelSpec = this.models[role] || this.models.conscious;
    
    if (!modelSpec) {
      throw new Error(`No model configured for role: ${role}`);
    }
    
    // Parse model spec: "provider:model_name"
    const [provider, modelName] = modelSpec.split(':');
    
    console.log(`  ℹ Routing ${role} call to ${provider} / ${modelName}`);
    
    // Route to appropriate handler
    switch (provider) {
      case 'openai':
      case 'anthropic':
      case 'google':
      case 'groq':
      case 'mistral':
        return await this.callCloudModel(provider, modelName, prompt, externalCallLLM);
      
      case 'local':
        return await this.callLocalModel(modelName, prompt);
      
      case 'ollama':
        return await this.callOllamaModel(modelName, prompt);
      
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Call a cloud-based LLM (OpenAI, Anthropic, etc.)
   */
  async callCloudModel(provider, model, prompt, externalCallLLM) {
    if (!externalCallLLM) {
      throw new Error('No LLM client provided for cloud call');
    }

    // Delegate to external LLM handler
    // The external handler knows how to route to the right provider
    return await externalCallLLM(prompt, provider, model);
  }

  /**
   * Call a local LLM endpoint (Ollama, LocalAI, etc.)
   */
  async callLocalModel(modelType, prompt) {
    // TODO: Support for generic local LLM endpoints
    console.log('  ℹ TODO: Implement generic local model support');
    throw new Error('Generic local model support not yet implemented');
  }

  /**
   * Call Ollama (common local LLM)
   */
  async callOllamaModel(modelName, prompt) {
    try {
      const endpoint = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434';
      
      const response = await fetch(`${endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          prompt: prompt,
          stream: false,
          temperature: 0.3
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`);
      }

      const data = await response.json();
      return data.response || '';
    } catch (err) {
      console.error('  ⚠ Ollama call failed:', err.message);
      throw err;
    }
  }

  /**
   * Record a model call for analytics
   */
  recordCall(role) {
    const key = `${role}_calls`;
    this.callRegistry[key] = (this.callRegistry[key] || 0) + 1;
  }

  /**
   * Set a model for a specific role
   */
  setModel(role, modelSpec) {
    if (!['conscious', 'subconscious', 'persona'].includes(role)) {
      throw new Error('Invalid role');
    }

    this.models[role] = modelSpec;
    this.save();
    console.log(`  ✓ Set ${role} model to ${modelSpec}`);
  }

  /**
   * Get the current model for a role
   */
  getModel(role) {
    return this.models[role] || null;
  }

  /**
   * Get all configured models
   */
  getModels() {
    return { ...this.models };
  }

  /**
   * Get call statistics
   */
  getStats() {
    return {
      total_calls: Object.values(this.callRegistry).reduce((a, b) => a + b, 0),
      calls_by_role: {
        conscious: this.callRegistry['conscious_calls'] || 0,
        subconscious: this.callRegistry['subconscious_calls'] || 0,
        persona: this.callRegistry['persona_calls'] || 0
      }
    };
  }

  /**
   * Validate model configuration
   */
  validate() {
    const errors = [];
    
    for (const [role, spec] of Object.entries(this.models)) {
      if (!spec) {
        errors.push(`No model configured for role: ${role}`);
        continue;
      }

      const [provider, model] = spec.split(':');
      
      if (!provider || !model) {
        errors.push(`Invalid model spec for ${role}: ${spec}`);
      }

      const validProviders = ['openai', 'anthropic', 'google', 'groq', 'mistral', 'local', 'ollama'];
      if (!validProviders.includes(provider)) {
        errors.push(`Unknown provider for ${role}: ${provider}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Integration point: Check if Ollama is available
   */
  async checkOllamaAvailable() {
    try {
      const endpoint = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434';
      const response = await fetch(`${endpoint}/api/tags`, { timeout: 2000 });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get list of available Ollama models
   */
  async getOllamaModels() {
    try {
      const endpoint = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434';
      const response = await fetch(`${endpoint}/api/tags`);
      
      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return (data.models || []).map(m => m.name);
    } catch (err) {
      console.error('  ⚠ Could not fetch Ollama models:', err.message);
      return [];
    }
  }

  /**
   * TODO: Implement cost-aware routing
   * Route to cheaper models when economical
   */
  routeByValue(role) {
    // TODO: Track cost per token for each provider
    // TODO: Route to cheapest option when speed isn't critical
    // TODO: Use expensive models only for important tasks
    console.log('  ℹ TODO: Implement cost-aware routing');
  }

  /**
   * TODO: Implement fallback chains
   * If primary model fails, try secondary
   */
  setupFallbackChain() {
    // TODO: Define fallback routing chains
    // TODO: Implement graceful degradation
    // TODO: Log fallback events for analysis
    console.log('  ℹ TODO: Implement fallback chain routing');
  }
}

module.exports = ModelRouter;
