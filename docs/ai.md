# The AI assistant

Optional. Everything else in Hisaab works without it. Open it with **Ctrl/⌘ J** or **Ask anything**
in the sidebar.

## Setting it up

**OpenRouter (recommended, works on any laptop)**

1. Create a free key at [openrouter.ai/keys](https://openrouter.ai/keys).
2. In Hisaab: Settings → AI → OpenRouter, paste the key, press Save, then **Test the connection**.
3. Pick a model. The default, Gemma 4 31B, is free. Free models allow about 50 requests a day (one question takes 2–4) until you've bought $10 of OpenRouter credit once, after which it's 1,000 a day. If the chosen free model is busy, Hisaab falls back to another free one automatically.

You can also set the key with the `OPENROUTER_API_KEY` environment variable.

| Model | Cost | Good for |
|---|---|---|
| Gemma 4 31B (`google/gemma-4-31b-it:free`) | Free | The default |
| Claude Haiku 5.5 | About ₹0.2 a question | Best value once you add a little credit |
| Claude Sonnet 5.5 | About ₹3 a question | Harder planning questions |

**Offline (needs a graphics card for good speed)**

1. Install [Ollama](https://ollama.com) and start it.
2. Settings → AI → Offline shows models for your GPU size. Press **Download** (nothing downloads until you do), then **Use**.

| Model | Download | For |
|---|---|---|
| Gemma 4 E4B | 6.6 GB | 8 GB GPU, or a 16 GB Apple Silicon Mac |
| Gemma 4 12B | 7.7 GB | 12 GB GPU |
| Gemma 4 26B (MoE) | 16 GB | 24 GB GPU, or a 32 GB+ Mac |

**Custom**: any OpenAI-compatible endpoint (LM Studio, a provider's own API): base URL, model name, and a key if it needs one.

## What it can do

- Answer questions from your data: spending by category, merchant, month or weekday; searches; budgets; bills and subscriptions; goals; the month-end forecast; balances and net worth.
- Suggest changes (a budget, a category for a payee, an auto-categorize rule). Nothing changes until you press **Apply**.
- **Suggest with AI** in the review inbox proposes categories for unknown merchants.
- **Write it up with AI** on the month in review turns the month's numbers into a short summary.

## What leaves your computer

- Only your question and the small results of the lookups it makes, never your statements or the database.
- People you pay are replaced with "Person A", "Person B"… before anything is sent; you see real names in the answer because the mapping stays on your computer. Payments to people are never sent for categorizing.
- Settings → AI → **What was sent** shows every request exactly as it was sent, and can clear the history.
- The key is stored in a private file in your user config folder (`~/.config/hisaab/secrets.json` on Linux), never in the database, backups or exports.

## Checking a model

`python -m hisaab.ai.eval --model <openrouter-model-id>` asks ten questions about the demo data and checks each answer against the number computed directly from the database. Use it before switching the default model.
