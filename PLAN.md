# Hisaab: personal finance tracker, end-to-end plan

> **Status (11 Nov 2026): v1.0.0. Phases 0–5 are built and merged.** The "Later" items below remain open.
> Name: **Hisaab** ("the accounts / the reckoning").

A local-first money tracker that runs on your own computer. One command starts it, it opens in
your browser, and all your data is a single SQLite file on your disk. It should answer three
questions every month:

1. **Where did my money go?**
2. **Am I on track this month?**
3. **What should I change next month?**

---

## 1. Principles

| Principle | What it means in practice |
|---|---|
| **Lightweight** | Python + SQLite. A handful of small dependencies. No Node, Docker, database server or sign-up needed to run it. |
| **Local and private** | No cloud, no telemetry. AI is optional and stays off until you add your own OpenRouter key. An offline model is an opt-in download. |
| **Numbers you can trust** | Transfers, credit-card bill payments, refunds and splits are counted correctly. Every number can be clicked to see the transactions behind it. |
| **Low effort** | Import bank statements instead of typing. Auto-categorize. 10-second quick add. Weekly review in minutes. |
| **Good defaults for India, works anywhere** | ₹ with lakh/crore formatting, UPI narration parsing, "my month starts on salary day". Currency and locale are settings. |

**Not building (keeps it small):** automatic bank sync, live stock/MF prices, multi-user or cloud
sync, a native mobile app, double-entry accounting, receipt OCR.

---

## 2. The core loop and rituals

```
Capture  →  Organize  →  Plan  →  Understand  →  Decide
(import,    (categories,  (budgets,  (dashboard,    (insights,
quick add)  rules, inbox) goals,     reports)       monthly review,
                          bills)                    AI assistant)
```

| Ritual | Time | What you do |
|---|---|---|
| Daily | 10 s | Quick-add a cash expense (`N` from anywhere). |
| Weekly | 5 min | Import the bank/card statement, clear the review inbox. |
| Monthly | 15 min | Open **Month in review**: see what happened, then set next month's budget in the same flow. |

---

## 3. Features

Tags: **MVP** = first usable version · **v1** = the complete product · **Later** = nice to have.

### 3.1 Capture
| Feature | Phase |
|---|---|
| Accounts: bank, cash, credit card, wallet/UPI, investment, loan. Opening balance and running balance. | MVP |
| Quick add: type `450 zomato` → amount, payee, guessed category, today, default account. | MVP |
| Transfers between accounts (incl. paying the credit-card bill), never counted as spending or income. | MVP |
| CSV import wizard: map columns once and save as a preset per bank, preview, skip duplicates, **undo a whole import**. | MVP |
| UPI narration parsing: pull the merchant name and VPA out of strings like `UPI/<ref>/<name>/<vpa>/...`. | MVP |
| Refunds: a credit in an expense category reduces that category's spend. | MVP |
| Recurring transactions auto-posted (rent, SIP, salary). | v1 |
| Splits: one transaction across several categories (an Amazon order = groceries + home). | v1 |
| Excel (.xlsx) statement import. | v1 |
| Shared expenses: you paid ₹1,200, your share is ₹400 → reports count ₹400, the rest is "owed to you". | Later |
| **ICICI savings-account PDF statement import** (your bank, so it moves up from Later). See 3.7. | MVP |
| PDF import for other banks. | Later |
| Add expenses from your phone over home Wi-Fi (PIN-protected mobile layout). | Later |

### 3.2 Organize
| Feature | Phase |
|---|---|
| Categories in groups, with a sensible Indian default set, icons and colours. Each category is tagged **Need / Want / Saving**. | MVP |
| Auto-categorize: payee memory (learns from your corrections) + rules (`contains / equals / regex` → category, clean payee name, tags). | MVP |
| **Review inbox**: new and uncategorized transactions, triaged by keyboard (`j/k` move, `c` category, `Enter` accept). | MVP |
| Search and filters: text, date, amount range, account, category, tag. Bulk edit. | MVP |
| "Exclude from reports" (e.g. a laptop your office reimbursed). | MVP |
| Tags for cross-category views (`#goa-trip`, `#wedding`). Saved filters. | v1 |

Default categories (editable): Rent · Groceries · Food delivery · Eating out · Transport & fuel ·
Cabs · Bills & recharges (electricity, mobile, internet) · Shopping · Subscriptions · Health ·
Education · Travel · Entertainment · Gifts & family · EMI & loans · Insurance · Investments (SIP) ·
Fees & charges · Misc. Income: Salary · Freelance · Interest · Refunds · Other.

### 3.3 Plan
| Feature | Phase |
|---|---|
| **Financial month start day** (salary on the 25th → your month is 25th–24th). Every report respects it. | MVP |
| Monthly budget per category. Suggest from your 3-month average, or copy last month. | v1 |
| Left to spend per category and overall, and **safe to spend per day** for the rest of the month. | v1 |
| Rollover per category (unspent money carries forward), for yearly costs like insurance. | v1 |
| Bills and subscriptions: due dates, next 14 days on the dashboard, total monthly and yearly cost. | v1 |
| Savings goals: target, date, "you need ₹X/month", progress. | v1 |
| Needs / Wants / Savings split against a target (50/30/20 by default). | v1 |

### 3.4 Understand
| Feature | Phase |
|---|---|
| **Dashboard** for the current month: spent vs budget, income, net, savings rate, safe to spend today, top categories, upcoming bills, recent transactions, 2–3 insight cards. | MVP (basic) → v1 |
| Spending by category and group, drilling down category → merchants → transactions. | MVP |
| **Cash-flow Sankey**: income → groups → categories. The single best "where does my money go" picture. | v1 |
| Trends: 12-month stacked bars, each category against its own average. | v1 |
| Calendar heatmap of daily spend (spot weekend and payday spikes). | v1 |
| Top merchants. | v1 |
| Compare two months side by side. | v1 |
| Net worth over time (sum of account balances). | v1 |
| Year in review. | Later |

### 3.5 Decide
| Feature | Phase |
|---|---|
| **Insights engine** (plain Python, offline, always on): category unusually high vs your 3-month median · pace warnings ("at this pace Shopping ends ₹3,200 over") · new or more expensive subscriptions · month-end forecast · large or duplicate-looking transactions. | v1 |
| **Month in review**: a guided page at each month start. What happened, vs budget, vs average, biggest changes, savings rate, then set next month's budget right there. | v1 |
| AI assistant (section 6). | v1 |
| What-if: "cut eating out by 30%" → savings per month and year, and how much sooner each goal is reached. | Later |

### 3.6 Own your data
| Feature | Phase |
|---|---|
| One SQLite file in your user data folder; can point it at any folder (e.g. a synced drive). | MVP |
| Automatic daily backups (keep the last 14) and one-click backup / restore. | MVP |
| Export everything to CSV and JSON. | MVP |
| Demo mode with realistic sample data, for first-time users and README screenshots. | MVP |
| Privacy blur: one key hides every amount (screen sharing). | v1 |
| App lock with a PIN. Encrypted database. Multi-currency (base currency + manual rate for trips). | Later |

### 3.7 ICICI statement import (from your real statement)
The "Statement of Transactions in Saving Account" PDF is text-based (not scanned), so it can
be read reliably without OCR.
- **Columns:** S No · Transaction Date (`DD.MM.YYYY`) · Cheque Number · Transaction Remarks ·
  Withdrawal Amount (INR) · Deposit Amount (INR) · Balance (INR). One table per page, header repeated.
- **Remarks span several lines.** The first bold line is a short payee name (e.g. `Swiggy Ltd`);
  the following lines are the raw narration.
- **Narration types to parse:**
  - `UPI/<name>/<vpa>/<note>/<bank>/<ref>/...`: payee name and VPA (`swiggyupi@axb` → Swiggy).
  - `UPI/.../MandateReq/...`: UPI autopay, which flags a subscription (e.g. Spotify).
  - `ACH/...` and `NACH trxn`: auto-debits such as SIPs → Investments, and recurring.
  - `MMT/IMPS/...`, `NEFT`, `BIL/INFT/...`: transfers to people; ask once whether it's a transfer, rent, family and so on, then remember.
  - The legend on the last page (BBPS, RCHG, VPS/IPS card, ATM/NFS cash …) maps codes to default categories.
- **Checks:** the running Balance column is used to verify every row parsed correctly (previous
  balance − withdrawal + deposit = balance), so a bad parse is caught before anything is saved.
- **Dedupe:** the UPI/IMPS reference number is a natural unique key, so re-importing overlapping
  statements never doubles a transaction.
- The same importer also accepts ICICI's CSV/XLS export, if you'd rather download that.
- Library: `pdfplumber` (pure Python), a core dependency.
- **Privacy:** real statements are never committed. `.gitignore` excludes `*.pdf`, `*.csv` and
  the data folder, and tests use a fake statement generated by the demo module.

---

## 4. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Backend | **Python 3.11+, FastAPI, Uvicorn** | Small, typed, fast to write; streams AI answers over SSE. |
| Database | **SQLite** via the standard library `sqlite3`, plain SQL | No server. Reports are `GROUP BY` queries, which read best as SQL. Migrations are numbered `.sql` files tracked with `PRAGMA user_version`. |
| Frontend | **React + TypeScript + Vite + Tailwind v4**, `lucide-react`, `motion`, `sonner` | The same toolkit as Sync, minus Next.js (a local app needs no server rendering). Built once into static files that ship **inside** the Python package, so users never need Node. |
| Charts | **Recharts** (bar, area, donut, Sankey) + a hand-made CSS grid heatmap | One library covers every chart we need, and it themes well in light and dark. |
| Data layer | TanStack Query; TanStack Virtual for long transaction lists | Caching and instant UI updates with little code. |
| AI | **Python only**: one OpenAI-compatible client over `httpx`. **OpenRouter** by default, **Ollama** for the opt-in offline model | One client covers every provider, so no provider SDKs. See section 6. |
| Packaging | `pyproject.toml` (hatchling); `pipx install hisaab` or `uv tool install hisaab` | Gives the user a `hisaab` command. `hisaab --window` opens it in a native window via `pywebview` (optional extra). |

Runtime dependencies: `fastapi`, `uvicorn`, `platformdirs`, `httpx` (AI client) and `pdfplumber`
(ICICI PDFs). Optional extras: `[excel]` (`openpyxl`), `[window]` (`pywebview`). Expected footprint: one Python process, roughly
60–90 MB of memory, starting in about a second.

Why not an all-Python UI (Streamlit, NiceGUI) or a no-build htmx page: they are lighter to write
but cap how good the UI can look and feel, and a great UI is a requirement.

---

## 5. Architecture

```
  Browser tab (React UI, served by the app itself)
        │   JSON at http://127.0.0.1:8765/api      SSE for streaming AI answers
 ┌──────▼──────────────────────────────────────────────────┐
 │  FastAPI app (Python)                                   │
 │   api/        routers: accounts, transactions,          │
 │               categories, budgets, goals, recurring,    │
 │               reports, imports, settings, ai            │
 │   services/   importer · categorize · budgets ·         │
 │               recurring · insights · reports · backup   │
 │   ai/         agent · tools · client     ───────────────┼──► OpenRouter (default, your key)
 │   (off until a key is added)                            │    Ollama (offline, opt-in download)
 └──────┬──────────────────────────────────────────────────┘
        ▼
  hisaab.db (one SQLite file)   +   backups/
```

- Binds to `127.0.0.1` only. Nothing is reachable from the network unless "phone mode" (Later) is turned on with a PIN.
- `hisaab` CLI: `hisaab` (start and open the browser), `--port`, `--data-dir`, `--demo`, `hisaab backup`, `hisaab import file.csv --account HDFC`.

### Money and date rules (decided up front so numbers are always right)
- Amounts are **integers in the smallest unit** (paise), never floats.
- Sign: negative = money out, positive = money in.
- A transfer is two linked rows (`transfer_id`) and is excluded from income and spending.
- Paying a credit-card bill is a transfer; the card purchases are the spending.
- A refund is a positive amount in an expense category, so it lowers that category's spend.
- Dates are ISO `YYYY-MM-DD`. "Month" always means the financial month from settings.

---

## 6. AI assistant (entirely Python)

### 6.1 Decision: OpenRouter by default, offline model optional
| Mode | Who it's for | Setup |
|---|---|---|
| **OpenRouter** (default) | Everyone, including laptops without a GPU | Paste your own OpenRouter API key in Settings → AI. One key reaches hundreds of models, free and paid. You can also add your own provider keys inside your OpenRouter account and OpenRouter routes through them; Hisaab only ever needs the one OpenRouter key. |
| **Offline** (opt-in) | People with a GPU, or anyone who wants nothing to leave the computer | Nothing is downloaded by default. Settings → AI → Offline shows recommended models for your GPU size with a **Download** button. |
| **Custom endpoint** (advanced) | Anyone with another OpenAI-compatible server (LM Studio, a provider's own API) | Base URL + key + model name. Comes free with the same client code. |

- **The whole AI layer is one small Python client** that speaks the OpenAI-compatible chat API over `httpx`. OpenRouter, Ollama and custom endpoints all speak it, so there are no provider SDKs to install.
- **Bring your own key.** No key ships in the repo. Each user adds their own, and AI stays off until they do. The app works fully without AI.
- **Where the key lives:** a local secrets file in the user config folder (owner-only permissions), or the `OPENROUTER_API_KEY` environment variable. It is never stored in the database, so backups and exports never contain it, and it is never logged.

### 6.2 Models (OpenRouter list checked on 10 Nov 2026)
The model picker loads OpenRouter's live list and shows only models that support tool calls
(403 of 467 today), with our recommended picks pinned at the top and free models labelled.

| Job | Free default | Cheap paid (recommended once you add a few dollars) | Best quality |
|---|---|---|---|
| **Chat assistant** (tool calls, maths over your data) | `google/gemma-4-31b-it:free`: dense 31B, tool calls and JSON output, 256K context, same family as the offline models | `anthropic/claude-haiku-5.5`: $0.10 in / $0.50 out per million tokens, about **$0.002 (₹0.2) per question** | `anthropic/claude-sonnet-5.5`: $2 / $10, about $0.04 per question |
| **Categorize new payees** (batch, background) | `google/gemma-4-26b-a4b-it:free`: fast mixture-of-experts | `z-ai/glm-5.3-flash`: $0.04 / $0.08 | same as chat |
| **Month-in-review write-up** | same as chat | same as chat | same as chat |

- **Automatic fallback:** requests send a fallback list (`gemma-4-31b-it:free` → `nvidia/nemotron-3-ultra-550b-a55b:free` → `openrouter/free`), so a busy free model doesn't break the chat.
- **Free-plan limits (OpenRouter):** about 20 requests a minute, and 50 a day until you have bought $10 of credit once (then 1,000 a day). A chat question takes 2–4 requests, so roughly 12–25 questions a day on a fully free account. Payee categorization batches 50 payees per request to save quota.
- **Free endpoints and privacy:** some free providers may store prompts. OpenRouter's account privacy settings control whether those providers are allowed. Hisaab's data minimisation (6.4) applies either way.
- **Defaults are verified, not guessed:** Phase 4 includes a small test set of about 20 finance questions with known answers on the demo data. We run it against the candidates above and keep whichever answers correctly. Models change often, so the recommended list lives in one file (`hisaab/ai/models.py`) and is easy to update.

### 6.3 Offline model (opt-in download)
- Runs through **Ollama**, which handles NVIDIA, AMD and Apple GPUs automatically. Hisaab's own code stays pure Python and talks to Ollama over its local API.
- Settings → AI → Offline: Hisaab checks whether Ollama is running. If it isn't, it shows the one-line install command. If it is, it lists the models below with a **Download** button and a progress bar (Ollama's pull API). Nothing downloads without that click.

| Your hardware | Model (Ollama) | Download size |
|---|---|---|
| 8 GB GPU, or a 16 GB Apple Silicon Mac | `gemma4:e4b` | about 6 GB |
| 12 GB GPU | `gemma4:12b` | about 7.7 GB |
| 24 GB GPU, or a 32 GB+ Mac | `gemma4:26b-a4b` (fast mixture-of-experts) | about 16 GB |

Gemma 4 is used both online (free default) and offline, so prompts behave the same in both modes.
Laptops without a GPU (like a Ryzen 5 5600U) can technically run the smallest model, but a chat
answer would take about a minute, so they should use OpenRouter.

### 6.4 How the assistant works
A chat panel (`⌘J` from any page) backed by a small tool-calling agent in `hisaab/ai/`.

1. The user asks a question. The agent sends it with today's date, the currency, the financial-month setting and the tool list.
2. The model calls **read-only tools** that run SQL on your database and return small, aggregated results.
3. The answer streams back to the UI with a "looked at …" line showing which tools ran, so every number is traceable.

| Tool | Returns |
|---|---|
| `get_summary(period)` | income, spending, net, savings rate |
| `spending_by(group_by, period, filters)` | totals by category, group, merchant or tag |
| `search_transactions(text, category, account, date_from, date_to, min, max, limit)` | matching transactions |
| `budget_status(period)` | budgeted, spent, left per category |
| `compare_periods(a, b, group_by)` | the differences between two periods |
| `list_recurring()` · `goals_status()` · `forecast(period)` | bills and subscriptions, goal progress, month-end projection |

The AI never changes data directly. `propose_recategorize`, `propose_budget` and `propose_rule`
return a suggestion card you approve with a click.

**What leaves your computer (online mode)**
- Only your question and the small tool results, never the statement or the database.
- Never your account number. People you pay over UPI or IMPS are replaced with labels ("Person A") before sending; merchants keep their names.
- Settings → AI → "Show what was sent" lists every request.

**Questions it should handle**
- "Where did my money go last month?"
- "How much have I spent on Swiggy and Zomato this year?"
- "Can I afford a ₹40,000 phone in March and still hit my Goa goal?"
- "Which subscriptions went up in price?"
- "Make next month's budget 10% tighter on wants."

**Two quieter AI jobs**
- **Categorize unknown payees:** only payee names and your category list are sent; suggestions land in the review inbox, and accepting one teaches payee memory.
- **Month-in-review write-up:** the insights engine computes the facts in Python; the model only turns them into five bullets and three suggestions. Without AI, a plain template does the same job.

---

## 7. Data model

```
accounts        id, name, kind (bank|cash|credit_card|wallet|investment|loan), currency,
                opening_balance, opening_date, include_in_net_worth, archived, sort
category_groups id, name, kind (expense|income), sort
categories      id, group_id, name, icon, color, bucket (need|want|saving), rollover,
                archived, sort
transactions    id, account_id, date, amount, payee, raw_description, category_id,
                notes, tags, status (cleared|pending), transfer_id, split_parent_id,
                recurring_id, import_id, fingerprint, exclude_from_reports,
                created_at, updated_at
budgets         month, category_id, amount            -- primary key (month, category_id)
recurring       id, kind (bill|subscription|income), payee, amount, category_id,
                account_id, cadence, interval, next_due, auto_post, active
goals           id, name, target_amount, target_date, account_id, icon, color, archived
goal_entries    id, goal_id, date, amount
rules           id, priority, field (payee|description), match (contains|equals|regex),
                pattern, set_category_id, set_payee, set_tags
payee_memory    payee, category_id, times_used        -- learned from your corrections
imports         id, file_name, account_id, preset_id, rows, imported, skipped, created_at
import_presets  id, name, column_map (json), date_format, amount_mode
                (signed|debit_credit), skip_rows, delimiter
settings        key, value      -- currency, locale, month_start_day, theme, ai_*, backup_*
ai_messages     id, thread_id, role, content, tool_calls, created_at
```

`fingerprint` is a hash of account + date + amount + normalized description, used to skip
duplicates when the same statement is imported twice.

---

## 8. Screens

| Screen | Contents |
|---|---|
| **Onboarding** (first run, ~2 min) | Currency, month start day, accounts with opening balances, category template, optional first import, or "explore with demo data". |
| **Dashboard** | This month at a glance (section 3.4). |
| **Transactions** | Dense table with filters, inline edit, bulk edit, and an **Inbox** tab for review. |
| **Import** (wizard) | Pick file → map columns (or use a saved preset) → preview with duplicates and auto-categories → import → undo available. |
| **Budget** | Month grid: category · budgeted · spent · left · progress, plus safe-to-spend and needs/wants/savings. |
| **Reports** | Tabs: Spending · Cash flow (Sankey) · Trends · Calendar · Merchants · Net worth · Compare. |
| **Bills and subscriptions** | Upcoming list and calendar, monthly and yearly totals, detected subscriptions to confirm. |
| **Goals** | Cards with progress, monthly amount needed, add contribution. |
| **Accounts** | Balances, net worth, per-account transactions. |
| **Month in review** | Guided monthly ritual (section 3.5). |
| **Ask** | AI side panel, available everywhere. |
| **Settings** | Categories, rules, import presets, currency and locale, month start, backups, AI provider, theme. |

Everywhere: `⌘K` command palette (jump anywhere, add a transaction, search), keyboard shortcuts,
light and dark themes, privacy blur.

---

## 9. Repository layout

```
hisaab/
├─ pyproject.toml
├─ README.md                    banner, screenshots, GIF, install in one line (like Sync's)
├─ LICENSE                      MIT
├─ hisaab/                      the Python package
│  ├─ cli.py                    `hisaab` command
│  ├─ app.py                    FastAPI app; serves /api and the built UI
│  ├─ db/                       connection.py, migrations/001_init.sql …
│  ├─ api/                      one router per area
│  ├─ services/
│  │  ├─ importer/              csv.py, icici_pdf.py, presets.py, upi.py, dedupe.py
│  │  ├─ categorize.py          rules + payee memory
│  │  ├─ budgets.py · recurring.py · insights.py · reports.py · backup.py
│  ├─ ai/                       client.py (OpenAI-compatible), models.py (recommended list),
│  │                            tools.py, agent.py, privacy.py (masking), offline.py (Ollama)
│  ├─ demo.py                   sample data generator
│  └─ static/                   built UI (generated, shipped in the wheel)
├─ web/                         frontend source (Vite + React + TS + Tailwind)
│  └─ src/  pages/ · components/ · lib/api.ts · lib/money.ts
├─ tests/                       pytest: import parsing, dedupe, transfers, budget and
│                               period maths, API
└─ .github/workflows/           ci.yml (lint, test, build); release.yml (tag → PyPI + GitHub Release)
```

---

## 10. Build phases

Each phase ends with something you can actually use.

| Phase | Scope | Done when |
|---|---|---|
| **0. Foundation** (small) | Repo, `pyproject`, FastAPI skeleton, schema and migrations, Vite app shell with theme tokens, sidebar, `⌘K`, `hisaab` command that opens the browser, demo data. | `hisaab --demo` opens a styled, empty-but-navigable app. |
| **1. Track** (largest) | Accounts, categories, transactions (add, edit, search, filters, bulk), quick add, transfers, CSV import with presets, dedupe, UPI parsing and undo, payee memory and rules, review inbox, basic dashboard, spending-by-category, backups, export. | You import a real month of statements and see correctly where the money went. |
| **2. Plan** | Financial month, budgets (suggest, copy, rollover), safe to spend, bills and subscriptions, goals, needs/wants/savings. | You set November's budget and the dashboard tells you what is left each day. |
| **3. Understand** | Reports (Sankey, trends, heatmap, merchants, compare, net worth), insights engine, Month in review, splits, tags, privacy blur. | On the 1st you finish the monthly review in 15 minutes. |
| **4. Ask** | OpenRouter client with key in Settings and live model picker, fallbacks, privacy masking and sent-log, tools, agent with streaming, chat panel, AI categorization, AI review write-up, model test set, offline mode (Ollama detect + Download button). | You ask "where did my money go last month?" and get a correct, traceable answer. |
| **5. Ship** | README with screenshots and GIF, MIT license, CI, PyPI release, GitHub Releases, `--window` mode, docs for import presets. | A stranger installs it with one command and is tracking in 5 minutes. |

Later: phone entry over Wi-Fi, shared expenses, PDF import, what-if, PIN lock, encryption,
multi-currency, year in review.

---

## 11. UI direction (detail later) and references

### Direction: "Sync's personality, calmer for numbers"
Keep from Sync:
- Editorial headings: a heavy display face with one serif-italic accent word ("Where it *went*", "This *month*").
- Mono uppercase eyebrows ("NOV 2026 · DAY 10 OF 30 · ₹18,400 LEFT").
- Warm paper light theme and ink-black dark theme, built on semantic tokens.
- `⌘K` palette, pill buttons, soft rounded cards, subtle grain.

Change for a money app:
- **Numbers are the hero**: large tabular figures, aligned digits, Indian grouping (₹1,23,456).
- **One calm accent.** Green and red are reserved for money in/out and under/over budget only, so they always mean something. Acid lime on black suits events but competes with "over budget" red.
- **Left sidebar** on desktop (more sections, data-dense screens); a Sync-style floating dock only on narrow screens.
- Dense, keyboard-focusable table rows (Linear-style); charts in muted greys with one highlighted series.

### References

Finance products (closest to what we are building):

| Reference | Look at | Steal |
|---|---|---|
| [Copilot Money](https://copilot.money) | The polish bar for personal finance (iPhone, Mac) | "To review" inbox, category icons and colours, this-month vs last-month spending line, recurring view. |
| [Monarch Money](https://www.monarchmoney.com) | Web dashboard and reports | Cash-flow Sankey, budget page layout, dashboard widgets. |
| [Lunch Money](https://lunchmoney.app) | Web-first, power-user tracker | Transaction table ergonomics, rules UI, recurring calendar. |
| [Actual Budget](https://actualbudget.org) ([GitHub](https://github.com/actualbudget/actual)) | Open-source, local-first; has a live demo on the site | Budget grid (budgeted / spent / balance), keyboard entry, local-first setup. |
| [Maybe](https://github.com/maybe-finance/maybe) | Open-source finance app with a calm, premium look | Typography, net-worth chart, account pages. |
| [Cashew](https://github.com/jameskokoska/Cashew) | Open-source budgeting app, playful | Budget progress visuals, quick add, spending pie interactions. |
| [YNAB](https://www.ynab.com) | Not the look, the method | "Give every rupee a job", category targets, the monthly budgeting mental model. |

Craft references (the feel, not finance-specific):

| Reference | Steal |
|---|---|
| [Mercury](https://mercury.com) | Calm, editorial banking UI; the best number typography and tables. The closest "Sync-like personality, but serious about money". |
| [Linear](https://linear.app) | Keyboard-first lists, `⌘K`, the inbox-triage pattern (our review inbox). |
| [Raycast](https://www.raycast.com) | Command palette and quick-add interactions. |

Building blocks:

| Reference | Use for |
|---|---|
| [shadcn/ui charts](https://ui.shadcn.com/charts) | Chart styling that works in light and dark (built on Recharts, our chart library). |
| [Tremor](https://tremor.so) | KPI cards, bar lists (top merchants), spark charts. |
| [SankeyMATIC](https://sankeymatic.com) | Try your own income → spending Sankey before we build it. |

Browse more: search "Copilot Money", "Monarch" or "budget" on [Mobbin](https://mobbin.com),
[Refero](https://refero.design) or [Dribbble](https://dribbble.com/search/finance-dashboard).

---

## 12. Open decisions

| Decision | Default unless you say otherwise |
|---|---|
| Name | Hisaab |
| License | MIT (anyone can download, use and modify) |
| Default theme | Dark, like Sync |
| First import preset | ICICI savings-account PDF (decided, see 3.7) |
| Repository | github.com/sakshamm21/Hisaab |
| AI provider | OpenRouter with your own key (decided); offline Gemma 4 via Ollama as an opt-in download |
| Default currency / locale | ₹ / en-IN, changeable in onboarding |
