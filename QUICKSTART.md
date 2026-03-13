# Quick Start: New Web UI Features

## 🎯 Main Changes at a Glance

### Before (Old)
- Auth panel took up whole screen
- Pipeline compression always visible
- Entity setup mixed with provider config
- No memory repair tools

### After (New)
- **Tab-based interface** — clean, organized
- **Entity Management** — create, load, delete entities
- **Multi-LLM Setup** — separate configs for each system
- **Memory Healing** — auto-repair corrupted logs
- **Advanced Dropdown** — legacy pipeline hidden but available

---

## 📌 New Tab System

### 1️⃣ **Chat Tab** (Default)
**What you see:**
- Large chat area
- Subconscious auto-save slider
- Sleep button
- Message history

**What you do:**
- Chat with your entity
- Load memory archives via drag-drop
- Compress chat and save offline

---

### 2️⃣ **Settings Tab**
**Four sections:**

#### A) Entity Management
```
┌─────────────────────────────────┐
│ Current Entity Display           │
│ Name: Liam                       │
│ Traits: adventurous, creative... │
│ Memories: 1009                   │
└─────────────────────────────────┘
[+ New Entity] [📂 Load] [🗑 Delete]
```

**How to:**
- **Create**: Click `+ New Entity` → Fill form → Done
- **Load**: Click `📂 Load Existing` → Pick entity → Loads
- **Delete**: Click `🗑 Delete` → Confirm → Gone

---

#### B) LLM Provider Setup
**Three sub-tabs:**

1. **Main Chat** (Default)
   - Your primary LLM for conversation
   - Options: Google, OpenAI, API Key, Ollama

2. **Subconscious**
   - Fast model for memory compression
   - Runs automatically as chat grows
   - Recommended: gpt-4o-mini, llama-8b

3. **Dream Engine**
   - Used during sleep function
   - Consolidates and integrates memories
   - Recommended: gpt-4o, claude-sonnet

**How to set up:**
```
1. Click "Subconscious" tab
2. Enter API endpoint + key + model name
3. Click "Save Config"
4. See ✓ Confirmation
```

---

#### C) System Health
**Three tools:**

1. **🔧 Memory Log Self-Healing**
   ```
   [Run Self-Heal]
   ↓
   Scans for corrupted log files
   Repairs them automatically
   Shows: Repaired: 2, Errors: 0
   ```

2. **📊 Memory Statistics**
   ```
   [View Stats]
   ↓
   Shows in chat:
   • Total memories: 1009
   • Storage: 2.4 MB
   • Healthy logs: 1007
   • Corrupted logs: 2
   ```

3. **🔄 Rebuild Trace Graph**
   ```
   [Rebuild]
   ↓
   Rebuilds semantic connections
   Shows: Connections: 3000+
   ```

---

### 3️⃣ **Advanced Dropdown**
(Hidden by default)

**Contains:**
- Old compression pipeline
- Steps 1-4 with input/output
- Legacy tools

**How to access:**
```
Click "Advanced ▼" in tab bar
↓
Dropdown menu opens
↓
Click section header to expand/collapse
↓
Old pipeline appears
```

---

## 🚀 Common Tasks

### Task: Create New Entity
```
1. Click "Settings" tab
2. Find "Entity Management" section
3. Click "+ New Entity" button
4. Modal dialog appears:
   - Enter name: "Luna"
   - Pick gender: Female
   - Add traits: "mysterious,playful,quick-witted"
   - Optional intro: "I'm Luna..."
5. Click "Create Entity"
6. Luna appears in header + display
```

### Task: Load Saved Entity
```
1. Click "Settings" tab
2. Click "📂 Load Existing"
3. List of all entities appears
4. Click entity name
5. Entity loads, appears in header
6. Go to Chat tab
7. Chat with entity
8. Personality persists!
```

### Task: Fix Corrupted Memories
```
1. (Optional) Server reported corruption
2. Click "Settings" tab
3. Scroll to "System Health"
4. Click "🔧 Run Self-Heal"
5. Status shows: "Repaired: 2"
6. Done! Memories fixed
```

### Task: Set Up Subconscious LLM
```
1. Click "Settings" tab
2. Scroll to "LLM Provider Setup"
3. Click "Subconscious" tab
4. Enter:
   - API Endpoint: https://api.openai.com/v1/chat/completions
   - Key: sk-...
   - Model: gpt-4o-mini
5. Click "Save Config"
6. Green ✓ appears briefly
7. Subconscious ready!
```

### Task: Use Old Compression (Legacy)
```
1. Click "Advanced ▼" in nav
2. Section drops down
3. Click section header again to expand
4. Old pipeline appears:
   - Input textarea (left)
   - Output textarea (right)
   - Run Pipeline button
5. Paste conversation
6. Click "Run Full Pipeline"
7. Get compressed output
8. Download or copy
```

---

## ⚡ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Ctrl+Enter** | Send chat message |
| **Tab key** | Switch UI tabs |
| **Esc** | Close entity dialog |

---

## 🎨 Visual Indicators

### Header
```
┌──────────────────────────────────┐
│ REM | REM System — Luna     │ v0.6.0
│    | adventurous, creative...    │
│    |                             │
│    [Provider] [Reset]           │
└──────────────────────────────────┘
```

### Entity Display
```
┌─────────────────────────────┐
│ 🧠 | Liam                   │
│    | adventurous, creative  │
│    | 1009 memories          │
│    | Created 5 days ago     │
│                             │
│ Introduction quote here...  │
└─────────────────────────────┘
```

### Chat Bar
```
[💬] Context Chat [gpt-4o]
                            [🧠 0%] [💤] [💾] [🗑]
                                ↑      ↑    ↑    ↑
                          Memory bar Sleep Save Clear
```

---

## 🔧 Troubleshooting

### "No entity loaded" in header
→ Create new entity or click "Load Existing"

### Entity doesn't persist after reload
→ Entity data cached in identity.json
→ Try: Click "Settings" → "Load Existing" → select entity again

### Subconscious config won't save
→ Verify API endpoint is reachable
→ Check API key is valid
→ Ensure model name is correct (gpt-4o-mini, NOT gpt-4-mini)

### Memory logs show corrupted
→ Click System Health → "Run Self-Heal"
→ Repairs automatically
→ Check stats after

### Can't find old compression tool
→ Click "Advanced ▼" dropdown in tab bar
→ It's hidden by default to keep UI clean

---

## 📊 Settings Tab Layout

```
┌─────────────────────────────────────────┐
│          SETTINGS TAB                   │
├─────────────────────────────────────────┤
│                                         │
│  🧠 ENTITY MANAGEMENT                   │
│  ┌──────────────────────────────────┐   │
│  │ [Current Entity Display]         │   │
│  ├──────────────────────────────────┤   │
│  │ [+ New] [📂 Load] [🗑 Delete]   │   │
│  └──────────────────────────────────┘   │
│                                         │
│  🤖 LLM PROVIDER SETUP                  │
│  [Main Chat] [Subconscious] [Dreams]    │
│  ┌──────────────────────────────────┐   │
│  │ Google | OpenAI | API Key        │   │
│  │ [Auth Form]                      │   │
│  │ [Status] [Disconnect]            │   │
│  └──────────────────────────────────┘   │
│                                         │
│  🔧 SYSTEM HEALTH                       │
│  ┌──────────────────────────────────┐   │
│  │ [🔧 Run Self-Heal]               │   │
│  │ [📊 View Stats]                  │   │
│  │ [🔄 Rebuild Trace Graph]         │   │
│  └──────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

---

## 💡 Pro Tips

1. **Personality Persistence**: Once created, entity personality is saved
2. **Auto-Archive**: Subconscious automatically compresses chat when threshold reached
3. **Quick Access**: Entity name always visible in header for context
4. **Memory Maintenance**: Run self-heal monthly to keep logs healthy
5. **Provider Switching**: Use saved profiles to quickly switch LLM providers

---

## 🎯 Next Steps

1. ✅ Create your first entity in Settings
2. ✅ Configure main LLM (Chat tab)
3. ✅ Open Chat tab and start conversation
4. ✅ Optional: Set up Subconscious LLM for auto-compression
5. ✅ Optional: Run memory self-heal if you see corruption warnings

---

**Need help?** Check server logs in "Pipeline Log" at bottom of Chat tab.
**Entity persists?** Check `memories/identity.json` — should mirror entity data.
**Old UI?** Backed up to `client/index_backup.html` if needed.
