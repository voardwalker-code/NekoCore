// ============================================================
// REM System — Telegram Integration
// 
// Connects the REM System brain to Telegram via Bot API.
// Uses long polling (no webhook/public URL required).
// Zero external dependencies — pure Node.js https module.
//
// Features:
//   - Full orchestrator pipeline for every message
//   - Voice messages via OpenAI TTS
//   - Web content fetching when URLs detected
//   - Web search when entity needs to look something up
//
// Setup:
//   1. Create a bot via @BotFather on Telegram
//   2. Add the bot token to Config/ma-config.json under "telegram.botToken"
//   3. Optionally restrict to specific chat IDs via "telegram.allowedChatIds"
//   4. For voice: add "telegram.tts" config with OpenAI API key
//   5. Restart the server — the bot will start polling automatically
// ============================================================

const https = require('https');
const crypto = require('crypto');

const TELEGRAM_API = 'api.telegram.org';
const POLL_TIMEOUT = 30;   // Long-poll timeout in seconds
const MAX_TG_MESSAGE = 4096; // Telegram message length limit
const MAX_TTS_LENGTH = 4096; // OpenAI TTS max input length

class TelegramBot {
  /**
   * @param {Object} opts
   * @param {string} opts.botToken - Telegram Bot API token from @BotFather
   * @param {number[]} [opts.allowedChatIds] - If set, only these chat IDs can interact
   * @param {Function} opts.onMessage - async (chatId, text, userName, history) => responseText
   * @param {Object} [opts.tts] - TTS config: { apiKey, model, voice }
   * @param {Function} [opts.onWebContent] - async (text) => webContextString or null
   * @param {Function} [opts.onWebSearch] - async (query) => searchResultsString
   */
  constructor(opts = {}) {
    this.botToken = opts.botToken;
    this.allowedChatIds = opts.allowedChatIds || null;
    this.onMessage = opts.onMessage;
    this.onWebContent = opts.onWebContent || null;
    this.onWebSearch = opts.onWebSearch || null;
    this.offset = 0;
    this.running = false;
    this.botInfo = null;

    // TTS configuration
    this.tts = opts.tts || null;

    // Per-chat conversation history for orchestrator context
    this.chatHistories = new Map();
    this.maxHistoryLength = 40; // Keep last N exchanges per chat
  }

  // ── Telegram Bot API call (pure https) ──────────────────────
  _apiCall(method, body = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: TELEGRAM_API,
        path: `/bot${this.botToken}/${method}`,
        method: body ? 'POST' : 'GET',
        headers: {}
      };

      let postData = null;
      if (body) {
        postData = JSON.stringify(body);
        options.headers['Content-Type'] = 'application/json';
        options.headers['Content-Length'] = Buffer.byteLength(postData);
      }

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.ok) {
              resolve(parsed.result);
            } else {
              reject(new Error(`Telegram API error: ${parsed.description || 'Unknown'}`));
            }
          } catch (e) {
            reject(new Error(`Invalid Telegram response: ${data.slice(0, 200)}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(((body?.timeout || 0) + 10) * 1000, () => {
        req.destroy(new Error('Telegram API timeout'));
      });

      if (postData) req.write(postData);
      req.end();
    });
  }

  // ── Send a text message, splitting if too long ──────────────
  async sendMessage(chatId, text, parseMode = 'Markdown') {
    // Split long messages into chunks respecting Telegram's limit
    const chunks = this._splitMessage(text, MAX_TG_MESSAGE);
    for (const chunk of chunks) {
      try {
        await this._apiCall('sendMessage', {
          chat_id: chatId,
          text: chunk,
          parse_mode: parseMode
        });
      } catch (err) {
        // If Markdown parsing fails, retry without formatting
        if (parseMode && err.message.includes("can't parse")) {
          await this._apiCall('sendMessage', {
            chat_id: chatId,
            text: chunk
          });
        } else {
          throw err;
        }
      }
    }
  }

  // ── Send typing indicator ───────────────────────────────────
  async sendTyping(chatId) {
    try {
      await this._apiCall('sendChatAction', {
        chat_id: chatId,
        action: 'typing'
      });
    } catch {
      // Non-critical, ignore
    }
  }

  // ── Chat history management ─────────────────────────────────
  getChatHistory(chatId) {
    return this.chatHistories.get(chatId) || [];
  }

  addToHistory(chatId, role, content) {
    if (!this.chatHistories.has(chatId)) {
      this.chatHistories.set(chatId, []);
    }
    const history = this.chatHistories.get(chatId);
    history.push({ role, content });
    // Trim to max length
    while (history.length > this.maxHistoryLength) {
      history.shift();
    }
  }

  clearHistory(chatId) {
    this.chatHistories.delete(chatId);
  }

  // ── Start the bot ───────────────────────────────────────────
  async start() {
    if (!this.botToken) {
      throw new Error('Telegram bot token not configured');
    }

    // Verify the token by fetching bot info
    try {
      this.botInfo = await this._apiCall('getMe');
      console.log(`  ✓ Telegram bot connected: @${this.botInfo.username}`);
    } catch (err) {
      throw new Error(`Telegram bot auth failed: ${err.message}`);
    }

    this.running = true;
    this._pollLoop();
    return this.botInfo;
  }

  // ── Stop the bot ────────────────────────────────────────────
  stop() {
    this.running = false;
    console.log('  ✓ Telegram bot stopped');
  }

  // ── Long-polling loop ───────────────────────────────────────
  async _pollLoop() {
    while (this.running) {
      try {
        const updates = await this._apiCall('getUpdates', {
          offset: this.offset,
          timeout: POLL_TIMEOUT,
          allowed_updates: ['message']
        });

        if (updates && updates.length > 0) {
          for (const update of updates) {
            this.offset = update.update_id + 1;
            await this._handleUpdate(update);
          }
        }
      } catch (err) {
        if (this.running) {
          console.warn(`  ⚠ Telegram poll error: ${err.message}`);
          // Back off on error
          await this._sleep(5000);
        }
      }
    }
  }

  // ── Handle a single update ──────────────────────────────────
  async _handleUpdate(update) {
    const msg = update.message;
    if (!msg || !msg.text) return;

    const chatId = msg.chat.id;
    const text = msg.text.trim();
    const userName = msg.from?.first_name || msg.from?.username || 'Unknown';

    // Access control
    if (this.allowedChatIds && this.allowedChatIds.length > 0) {
      if (!this.allowedChatIds.includes(chatId)) {
        console.log(`  ⚠ Telegram: rejected message from unauthorized chat ${chatId}`);
        await this.sendMessage(chatId, '⛔ Not authorized. Your chat ID is not in the allowed list.');
        return;
      }
    }

    // Built-in commands
    if (text === '/start') {
      await this.sendMessage(chatId,
        '🧠 *REM System* connected.\n\nSend me a message and I\'ll respond through the full cognitive pipeline — subconscious memory retrieval, conscious thought, dream association, and orchestrated synthesis.\n\nCommands:\n/clear — Reset conversation history\n/status — Show bot status\n/chatid — Show your chat ID\n/voice — Toggle voice replies on/off',
        'Markdown'
      );
      return;
    }

    if (text === '/clear') {
      this.clearHistory(chatId);
      await this.sendMessage(chatId, '🔄 Conversation history cleared.', 'Markdown');
      return;
    }

    if (text === '/status') {
      const historyLen = this.getChatHistory(chatId).length;
      const voiceStatus = this.tts?.apiKey ? (this._voiceEnabled(chatId) ? 'on' : 'off') : 'not configured';
      await this.sendMessage(chatId,
        `📊 *Status*\nBot: @${this.botInfo?.username || '?'}\nHistory: ${historyLen} messages\nChats tracked: ${this.chatHistories.size}\nVoice: ${voiceStatus}\nWeb browsing: enabled`,
        'Markdown'
      );
      return;
    }

    if (text === '/chatid') {
      await this.sendMessage(chatId, `Your chat ID: \`${chatId}\``, 'Markdown');
      return;
    }

    if (text === '/voice') {
      if (!this.tts?.apiKey) {
        await this.sendMessage(chatId, '⚠ Voice not configured. Add TTS settings to Config/ma-config.json', null);
        return;
      }
      const current = this._voiceEnabled(chatId);
      this._setVoiceEnabled(chatId, !current);
      await this.sendMessage(chatId, `🔊 Voice replies: ${!current ? 'ON' : 'OFF'}`, null);
      return;
    }

    // Regular message — route through the brain
    if (!this.onMessage) {
      await this.sendMessage(chatId, '⚠ Brain not connected yet. Please wait for server to finish startup.');
      return;
    }

    try {
      // Show typing indicator
      await this.sendTyping(chatId);

      // Get chat history for context
      const history = this.getChatHistory(chatId);

      console.log(`  💬 Telegram [${userName}/${chatId}]: ${text.slice(0, 80)}${text.length > 80 ? '...' : ''}`);

      // Fetch any URLs found in the message
      let webContext = '';
      if (this.onWebContent) {
        try {
          const fetched = await this.onWebContent(text);
          if (fetched) {
            webContext = fetched;
            console.log(`  🌐 Web content injected (${webContext.length} chars)`);
          }
        } catch (err) {
          console.warn(`  ⚠ Web fetch failed: ${err.message}`);
        }
      }

      // Build the enriched message with web context
      let enrichedMessage = text;
      if (webContext) {
        enrichedMessage = text + '\n' + webContext;
      }

      // Add web capability hint so the entity knows it can search
      if (this.onWebSearch) {
        enrichedMessage += '\n\n[SYSTEM NOTE: You have web browsing capability in this conversation. If the user asks you to look something up, search for information, or you need current data to answer well, include [SEARCH: your search query] in your response and the system will fetch results and let you synthesize them. URLs shared by the user have already been fetched and included above if present.]';
      }

      // Route through the orchestrator
      const response = await this.onMessage(chatId, enrichedMessage, userName, history);

      // Check if the response contains a web search request from the entity
      let finalResponse = response;
      const searchMatch = response.match(/\[SEARCH:\s*(.+?)\s*\]/i);
      if (searchMatch && this.onWebSearch) {
        try {
          await this.sendTyping(chatId);
          const searchQuery = searchMatch[1];
          console.log(`  🔍 Entity requested search: "${searchQuery}"`);
          const searchResults = await this.onWebSearch(searchQuery);

          // Send the search results back through the orchestrator for synthesis
          const searchMessage = `The entity searched the web for "${searchQuery}". Here are the results:\n${searchResults}\n\nPlease synthesize these results into a helpful response based on the original question: ${text}`;
          finalResponse = await this.onMessage(chatId, searchMessage, userName, history);
        } catch (err) {
          console.warn(`  ⚠ Web search failed: ${err.message}`);
          // Keep the original response if search fails
        }
      }

      // Store in history
      this.addToHistory(chatId, 'user', text);
      this.addToHistory(chatId, 'assistant', finalResponse);

      // Send text response
      await this.sendMessage(chatId, finalResponse);

      console.log(`  ✓ Telegram reply sent to ${userName}/${chatId} (${finalResponse.length} chars)`);

      // Send voice message if TTS is enabled for this chat
      if (this.tts?.apiKey && this._voiceEnabled(chatId)) {
        try {
          await this.sendRecording(chatId);
          const audioBuffer = await this.generateSpeech(finalResponse);
          if (audioBuffer) {
            await this.sendVoice(chatId, audioBuffer);
            console.log(`  🔊 Voice message sent to ${chatId}`);
          }
        } catch (err) {
          console.warn(`  ⚠ Voice message failed: ${err.message}`);
          // Don't fail the whole message if TTS fails
        }
      }
    } catch (err) {
      console.error(`  ⚠ Telegram message handling error: ${err.message}`);
      await this.sendMessage(chatId,
        '⚠ Something went wrong processing your message. Please try again.',
        null
      );
    }
  }

  // ── Utilities ───────────────────────────────────────────────

  // ── Send a voice message (OGG Opus) via multipart upload ──
  async sendVoice(chatId, audioBuffer) {
    const boundary = '----MemArch' + crypto.randomBytes(8).toString('hex');

    // Build multipart body
    const parts = [];

    // chat_id field
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="chat_id"\r\n\r\n` +
      `${chatId}\r\n`
    );

    // voice file field
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="voice"; filename="voice.ogg"\r\n` +
      `Content-Type: audio/ogg\r\n\r\n`
    );

    const header = Buffer.from(parts.join(''), 'utf8');
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    const body = Buffer.concat([header, audioBuffer, footer]);

    return new Promise((resolve, reject) => {
      const options = {
        hostname: TELEGRAM_API,
        path: `/bot${this.botToken}/sendVoice`,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.ok) {
              resolve(parsed.result);
            } else {
              reject(new Error(`Telegram sendVoice error: ${parsed.description || 'Unknown'}`));
            }
          } catch (e) {
            reject(new Error(`Invalid Telegram sendVoice response: ${data.slice(0, 200)}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(60000, () => {
        req.destroy(new Error('sendVoice timeout'));
      });

      req.write(body);
      req.end();
    });
  }

  // ── Generate speech via OpenAI TTS API ────────────────────
  async generateSpeech(text) {
    if (!this.tts || !this.tts.apiKey) return null;

    // Truncate to TTS limit
    const input = text.length > MAX_TTS_LENGTH
      ? text.slice(0, MAX_TTS_LENGTH - 3) + '...'
      : text;

    const model = this.tts.model || 'tts-1';
    const voice = this.tts.voice || 'nova';

    const postData = JSON.stringify({
      model,
      input,
      voice,
      response_format: 'opus' // Returns OGG Opus — exactly what Telegram needs
    });

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.openai.com',
        path: '/v1/audio/speech',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.tts.apiKey}`,
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        if (res.statusCode !== 200) {
          let errData = '';
          res.on('data', c => { errData += c; });
          res.on('end', () => reject(new Error(`TTS API error ${res.statusCode}: ${errData.slice(0, 200)}`)));
          return;
        }

        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const audioBuffer = Buffer.concat(chunks);
          console.log(`  🔊 TTS generated: ${audioBuffer.length} bytes (${model}/${voice})`);
          resolve(audioBuffer);
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy(new Error('TTS API timeout'));
      });

      req.write(postData);
      req.end();
    });
  }

  // ── Send recording indicator ──────────────────────────────
  async sendRecording(chatId) {
    try {
      await this._apiCall('sendChatAction', {
        chat_id: chatId,
        action: 'record_voice'
      });
    } catch {
      // Non-critical
    }
  }

  // ── Per-chat voice toggle ─────────────────────────────────
  _voiceEnabled(chatId) {
    if (!this._voiceSettings) this._voiceSettings = new Map();
    // Default to true if TTS is configured
    const setting = this._voiceSettings.get(chatId);
    return setting !== undefined ? setting : true;
  }

  _setVoiceEnabled(chatId, enabled) {
    if (!this._voiceSettings) this._voiceSettings = new Map();
    this._voiceSettings.set(chatId, enabled);
  }

  _splitMessage(text, maxLen) {
    if (text.length <= maxLen) return [text];

    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= maxLen) {
        chunks.push(remaining);
        break;
      }
      // Try to split at a newline near the limit
      let splitIdx = remaining.lastIndexOf('\n', maxLen);
      if (splitIdx < maxLen * 0.5) {
        // No good newline — split at space
        splitIdx = remaining.lastIndexOf(' ', maxLen);
      }
      if (splitIdx < maxLen * 0.3) {
        // No good split point — hard cut
        splitIdx = maxLen;
      }
      chunks.push(remaining.slice(0, splitIdx));
      remaining = remaining.slice(splitIdx).trimStart();
    }
    return chunks;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = TelegramBot;
