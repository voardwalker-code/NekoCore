# REM System — Model Recommendations

Last updated: 2026-03-12

Consolidated recommendations for OpenRouter (cloud) and Ollama (local). Covers all pipeline stages and aspect keys.

---

## Pipeline → Aspect Key Mapping

The REM System configures models by aspect key in `Config/ma-config.json`. Here is how pipeline phases map to those keys:

| Aspect key | What it powers |
|-----------|---------------|
| `main` | Conscious (1C) and Orchestrator Final |
| `subconscious` | Subconscious (1A), compression, archive extraction |
| `dream` | Dream-Intuition (1D), identity update, persona evolution |
| `orchestrator` | Orchestrator 2B refinement (if configured separately) |

---

## Model Selection Criteria

**Personality-facing phases (Conscious, Orchestrator, Dream, Identity)** — the model MUST commit to being a persistent synthetic entity without breaking character or adding "I am an AI" disclaimers. Models with strong safety training that resist persona adoption are disqualified for these phases.

**GPT-4/5 family note:** GPT-5 and its variants have strong OpenAI safety training that actively resists persistent entity identity. They work well for utility phases (compression, archive extraction) where personality is irrelevant.

| Phase | Needs persona commitment? |
|-------|--------------------------|
| Conscious (1C) — entity's spoken response | YES — Critical |
| Orchestrator Final — entity's true voice | YES — Critical |
| Dream-Intuition (1D) — abstract links | YES — High |
| Identity update, persona evolution | YES — High |
| Subconscious (1A) — memory activation | No — internal only |
| Compression, archive extraction | No — utility |

---

## OpenRouter Recommendations

Current as of 2026-03-10. Token pricing from OpenRouter live catalog.

### Quality First

| Phase / Aspect | Model | $/M in | $/M out |
|----------------|-------|--------|---------|
| Conscious + Orchestrator | anthropic/claude-sonnet-4.6 | $3.00 | $15.00 |
| Subconscious | moonshotai/kimi-k2.5 | $0.45 | $2.20 |
| Dream | anthropic/claude-sonnet-4.6 | $3.00 | $15.00 |
| Compression (2B) | google/gemini-3-flash-preview | $0.50 | $3.00 |
| Archive extraction | deepseek/deepseek-v3.2 | $0.25 | $0.40 |
| Goal emergence | moonshotai/kimi-k2.5 | $0.45 | $2.20 |
| Identity update | anthropic/claude-sonnet-4.6 | $3.00 | $15.00 |

### Latency First

| Phase / Aspect | Model | $/M in | $/M out |
|----------------|-------|--------|---------|
| Conscious + Orchestrator | inception/mercury-2 | $0.25 | $0.75 |
| Subconscious | inception/mercury-2 | $0.25 | $0.75 |
| Dream | google/gemini-3.1-flash-lite-preview | $0.25 | $1.50 |
| Compression | inception/mercury-2 | $0.25 | $0.75 |
| Archive + Goal + Identity | inception/mercury-2 | $0.25 | $0.75 |

### Cost Floor (Free Tier)

| Phase / Aspect | Model |
|----------------|-------|
| Conscious + Orchestrator | arcee-ai/trinity-large-preview:free |
| Subconscious + Compression + Archive | stepfun/step-3.5-flash:free |
| Dream | arcee-ai/trinity-large-preview:free |

### Hybrid (Balanced Cost/Quality)

| Phase / Aspect | Model | $/M in | $/M out |
|----------------|-------|--------|---------|
| Conscious + Orchestrator | deepseek/deepseek-v3.2 | $0.25 | $0.40 |
| Subconscious + Compression | inception/mercury-2 | $0.25 | $0.75 |
| Dream | google/gemini-3-flash-preview | $0.50 | $3.00 |
| Archive + Goal | inception/mercury-2 | $0.25 | $0.75 |
| Identity update | deepseek/deepseek-v3.2 | $0.25 | $0.40 |

---

## Ollama Recommendations (Local — Hardware Tuned)

Hardware snapshot these recommendations are tuned for:
- MSI Katana 15 HX B14WEK
- CPU: Intel Core i7-14650HX (16C / 24T)
- RAM: 32 GB DDR5-4800
- GPU: NVIDIA GeForce RTX 5050 Laptop GPU (8 GB VRAM)
- OS: Windows 11

Currently installed models: `qwen2.5:1.5b`, `Qwen:latest`, `llama3.2:3b`, `llama3:latest`, `gemma3:1b`

**Important concurrency note:** Per message, 5 LLM calls total. The parallel phase (1A + 1C + 1D) means up to 3 concurrent requests. If all three map to the same Ollama model, it will receive 3 simultaneous generation requests. Size accordingly.

### Best Practical (Quality First on 8 GB VRAM)

| Phase | Model | Fit | Notes |
|-------|-------|-----|-------|
| Conscious | llama3:latest | Good | Best quality installed; persona-facing |
| Orchestrator | llama3:latest | Good | Keep same as conscious for voice consistency |
| Subconscious | llama3.2:3b | Excellent | Fast, lightweight — good for internal reflection |
| Dream-Intuition | Qwen:latest | Good | Creative, lightweight |
| Compression | llama3.2:3b | Excellent | Utility pass; speed matters |
| Archive extraction | llama3.2:3b | Excellent | Structured output; 3b is plenty |

### Minimum Viable (Low RAM / CPU-only)

| Phase | Model |
|-------|-------|
| All phases | qwen2.5:1.5b or gemma3:1b |
| Persona-facing preferred | gemma3:1b (follows instructions better than qwen at 1.5b) |

---

## O2 Escalation Model

The Orchestrator can escalate to a stronger model for its Final pass when escalation policy is triggered (see PIPELINE-AND-ORCHESTRATION.md). A separate model can be configured as the `escalation` runtime in `Config/ma-config.json`.

Recommended escalation model (OpenRouter): `anthropic/claude-sonnet-4.6`
Recommended escalation model (Ollama): `llama3:latest` (no upgrade available in typical local setup unless larger models are installed)

---

## Config Format

In `Config/ma-config.json`, models are set under `configProfiles`:

```json
{
  "configProfiles": {
    "default-multi-llm": {
      "aspects": {
        "main": {
          "provider": "openrouter",
          "model": "deepseek/deepseek-v3.2",
          "endpoint": "https://openrouter.ai/api/v1/chat/completions"
        },
        "subconscious": {
          "provider": "openrouter",
          "model": "inception/mercury-2",
          "endpoint": "https://openrouter.ai/api/v1/chat/completions"
        },
        "dream": {
          "provider": "openrouter",
          "model": "google/gemini-3-flash-preview",
          "endpoint": "https://openrouter.ai/api/v1/chat/completions"
        }
      }
    }
  }
}
```

See `server/services/config-service.js` for the full config schema.
