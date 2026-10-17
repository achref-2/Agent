# GhostMate

GhostMate is a personal AI agent for an international Master's student in Köln. It manages tasks and deadlines, answers questions about lecture PDFs, coaches German, tracks student-job applications and explains German official letters. The AI acts through a fixed set of tools on your own database records, shows every tool call it makes, and asks for confirmation before deleting anything.

- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS 4, Lucide icons
- **Backend:** Node.js 22, Express 5, TypeScript, MongoDB (Atlas) with Mongoose, Zod
- **AI:** Anthropic Claude API (`@anthropic-ai/sdk`) with tool calling and structured outputs, behind a provider interface

---

## Quick start (local)

**Requirements:** Node.js 22 or newer, and a MongoDB database (a free MongoDB Atlas cluster, or a local `mongod`).

```bash
# 1. Install dependencies (root, server and client are npm workspaces)
npm install

# 2. Create your configuration
cp .env.example .env
#    then edit .env: set MONGODB_URI, JWT_SECRET and ANTHROPIC_API_KEY (see below)

# 3. Start backend (port 4000) and frontend (port 5173) together
npm run dev
```

Open http://localhost:5173. The first visit shows **Create your account**; that first account is always allowed. After that, registration is closed unless you set `ALLOW_REGISTRATION=true`.

### Configure MongoDB Atlas

1. In Atlas, create a free cluster, then **Database Access → Add user** (username + password).
2. **Network Access → Add IP address**: your current IP for local use (or `0.0.0.0/0` for a hosting provider, protected by the user password).
3. **Database → Connect → Drivers** and copy the connection string.
4. Put it in `.env` with a database name, e.g.
   `MONGODB_URI=mongodb+srv://ghost:<password>@cluster0.xxxxx.mongodb.net/ghostmate?retryWrites=true&w=majority`

For a local database instead: `MONGODB_URI=mongodb://localhost:27017/ghostmate` (for example with `docker run -d -p 27017:27017 mongo:7`).

### Configure the Anthropic API

1. Create a key at https://platform.claude.com (Settings → API keys) and add billing credit.
2. In `.env`:
   ```
   AI_PROVIDER=anthropic
   ANTHROPIC_API_KEY=sk-ant-...
   ANTHROPIC_MODEL=claude-opus-5-5
   ANTHROPIC_EFFORT=medium
   ```
3. Restart `npm run dev`. The sidebar shows the active model under **AI model**.

**Cost control.** `ANTHROPIC_MODEL` and `ANTHROPIC_EFFORT` are the two levers. `claude-opus-5-5` is the most capable; `claude-sonnet-5-5` or `claude-haiku-5-5` are cheaper. Lower effort (`low`) uses fewer tokens. The current model list is at https://platform.claude.com/docs/en/about-claude/models/overview. Each user is limited to 20 AI requests per minute, and every agent turn is capped at 6 model calls and 12 tool calls (`AGENT_MAX_ITERATIONS`, `AGENT_MAX_TOOL_CALLS`).

`ANTHROPIC_FALLBACKS=default` turns on Anthropic's server-side refusal fallback: if the model declines a request for policy reasons, the API retries it on a fallback model inside the same call. Set it to `off` to disable.

### Free local AI with Ollama (no API costs)

Claude Pro does not include API credits, so GhostMate cannot use a Pro subscription. To get real AI answers for free, run a local model with [Ollama](https://ollama.com):

1. Install Ollama for your OS and start it.
2. `ollama pull qwen2.5:7b` (about 4.7 GB; needs ~8 GB free RAM. `qwen2.5:3b` is lighter but weaker).
3. In `.env`: `AI_PROVIDER=ollama`, `OLLAMA_MODEL=qwen2.5:7b` (and `OLLAMA_BASE_URL` if Ollama is not on `http://127.0.0.1:11434`).
4. Restart `npm run dev`. The sidebar shows the model with "(local)".

The model must support tool calling (qwen2.5, qwen3, llama3.1). Local models are slower and less reliable than Claude: structured results are validated and retried once, and you get a clear error instead of bad data if the model still gets the format wrong.

### Without an API key

- `AI_PROVIDER=none` (or an empty key): every non-AI feature works (tasks, calendar, reminders, quick add, applications, document upload and text extraction, memory). AI buttons are disabled and AI endpoints return a clear "AI is not configured" error.
- `AI_PROVIDER=mock`: **development mode**. A yellow banner is shown on every page and every AI answer starts with `[Dev mock: no AI model connected]`. The mock calls real tools for simple phrases ("remind me to …", "what are my urgent tasks?") so you can see the tool plumbing work, and fills structured results with labelled placeholders. Never use it as if it were real AI. The server refuses to start with `AI_PROVIDER=mock` when `NODE_ENV=production`.

### Generate a JWT secret

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Backend with auto-reload on :4000 and Vite on :5173 (API proxied, so cookies work) |
| `npm test` | Server tests (Vitest + Supertest + in-memory MongoDB) and client tests (Vitest + Testing Library) |
| `npm run typecheck` | TypeScript checks for server and client |
| `npm run build` | Compiles the server to `server/dist` and the client to `client/dist` |
| `npm start` | Runs the compiled server. With `NODE_ENV=production` it also serves the built frontend |

The server tests start a throwaway MongoDB with `mongodb-memory-server`, which downloads a `mongod` binary the first time. If that download is blocked on your network, point it at an existing binary: `MONGOMS_SYSTEM_BINARY=/path/to/mongod npm test`.

---

## Deploying

GhostMate builds into one Node service that serves both the API and the frontend.

**Render / Railway / Fly.io (any Node host):**

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Environment variables: everything from `.env.example`, with `NODE_ENV=production`, your Atlas `MONGODB_URI`, a fresh `JWT_SECRET`, `ANTHROPIC_API_KEY`, and `CLIENT_ORIGIN` set to your public URL (e.g. `https://ghostmate.onrender.com`).
- In Atlas Network Access, allow the host's outbound IPs (or `0.0.0.0/0`).
- Use HTTPS (all of these hosts do). In production the session cookie is `Secure`, so it only works over HTTPS.

Reminders are checked by the server every 30 seconds. On free tiers that put the service to sleep, reminders that came due while it slept fire when it wakes up.

---

## What's implemented

### Dashboard and daily briefing
- Quick add in natural language, parsed **locally without AI** (dates, times, `!high`/`urgent`, category hints, "remind me" → reminder). Example: `Remind me to email my professor tomorrow at 10 !high`.
- Today's confirmed events, tasks due today, overdue tasks, top priorities (ranked by due date and priority), next 7 days, unfinished work, recently added tasks, application status counts and follow-ups. All numbers come from the database.
- AI daily briefing generated from those same records on demand and cached per day.

### AI assistant (the agent)
- Chat with persistent conversations. Each answer lists the tools that ran, their inputs and their real results; failed tool calls are shown in red.
- Tools: `create_task`, `list_tasks`, `update_task`, `complete_task`, `delete_task`, `list_events`, `create_event`, `get_day_overview`, `search_applications`, `create_application`, `update_application`, `delete_application`, `search_documents`, `retrieve_document_passages`, `save_memory`, `retrieve_memory`.
- Delete tools never delete directly: they create a pending action that you confirm or cancel with a button (it expires after an hour and cannot run twice).
- "Plan my day" uses `get_day_overview` and separates **confirmed** items from **suggested** activities.
- Quick-action chips for common requests.

### Tasks & Calendar
- Month / Week / Day calendar (Monday first) with task deadlines (outlined) and confirmed events (filled), plus a Todos panel with Today/Week/Month progress, as in the reference screenshot.
- List view with search and filters (status, category, priority), sorted by urgency.
- Tasks: title, description, category, priority, status, due date and optional time, reminder, source (manual, assistant, quick add, document, study plan), linked document, timestamps.
- Events with weekly recurrence (e.g. a lecture every Monday until the end of the semester).

### Reminders
- Stored on the task in MongoDB, so they survive restarts. A scheduler polls every `REMINDER_POLL_SECONDS` and claims each due reminder atomically, so a reminder fires once even with several server instances. Reminders that came due while the server was down fire on the next start.
- Delivered as in-app notifications (bell icon, toast). If you allow it, the browser also shows a system notification. **Notifications only appear while GhostMate is open in a browser tab**; there is no push, email or phone notification.

### Study workspace
- Upload lecture PDFs (or text). Text is extracted per page with `pdfjs-dist`; pages without a text layer are detected. A fully scanned PDF is marked **needs OCR** and the app says plainly that OCR is not available.
- Retrieval-augmented answers: the question is matched against page chunks with BM25 and only the top passages are sent to the model. Answers cite passages with document title and page; each quote is checked against the stored text and marked "verified" or "not found verbatim". If nothing relevant is found, the app says so without calling the AI.
- Summaries (beginner or advanced, map-reduce for long documents), concept explanations (from your document or clearly labelled general knowledge), quizzes, flashcards and practice exercises with page references.
- Quiz answers update a per-topic progress list that flags topics you struggle with.
- Revision plans built from your study time, university deadlines in the database and weak topics; you can save the sessions as tasks.

### German coach
- Role-play scenarios: landlord, job interview, university office, Ausländerbehörde, doctor, small talk, shopping/contracts, free conversation. Natural everyday German adapted to your CEFR level.
- Every message gets corrections with explanations in English, French or Tunisian Arabic (Derja), plus a more natural alternative; replies can be translated.
- Recurring mistakes are stored by grammar category and counted; personalised exercises target the most frequent ones.
- "Check my text" and a formal/informal email, message and letter writer (with placeholders instead of invented facts).

### Job applications
- Track company, title, URL, location, employment type, status (saved → preparing → applied → interview → rejected/offer), application date, contact, follow-up date, notes, job description and related documents.
- Paste a job ad to extract details and requirements (only what the ad states).
- Fit analysis against **your own profile** (matches with evidence, honest gaps, unclear requirements). It refuses to run until you have written a profile.
- Drafts: tailored German or English cover letter, interview preparation, follow-up email. Drafts are saved on the application for you to copy and send yourself.
- Live job discovery is not built in: no documented job-search API is configured. The integration interface is ready (`server/src/integrations`).

### Documents (German administration)
- Upload a PDF or paste an email/letter. "Explain & extract actions" returns a plain-English explanation, sender, type and purpose, **facts with exact quotes** (verified against the original), **interpretations** labelled with confidence, deadlines, required documents, points to check with an advisor, and a German reply draft with translation.
- Pick suggested actions and turn them into tasks linked to the document.

### Memory & Settings
- Long-term memory (preferences, communication style, projects, study goals, routines) that you can add, edit, delete, or delete all. The assistant can save memories, and they are labelled "Saved by GhostMate".
- A switch to turn memory off completely: the agent then neither reads nor writes memories.
- Tasks, events and applications are stored as records and are the source of truth; memory is never used for task status or deadlines.
- Profile (name, timezone), career profile used for job matching, German level and goals, theme, password change, JSON export of your data, delete chat history.
- Integration status shows calendar, email, job search and push notifications as **not connected**.

---

## How it works (the important decisions)

**One agent, a fixed toolbox.** The model never touches the database directly. It can only call the 16 tools above. Each tool has a Zod schema (converted to JSON Schema for the model), validates its input, runs a service function that always filters by your user id, and returns `{ ok, summary, data }` or `{ ok: false, error }`. If the model sends bad input or calls an unknown tool, it gets an error back and has to tell you. `server/src/ai/agent.ts` runs the loop with hard limits on model calls and tool calls.

**The database is the memory for facts.** Conversation history is sent back to the model for context, but the system prompt tells it to look up tasks, events and applications with tools rather than trusting what was said earlier. The briefing and the dashboard are computed from records, not from chat.

**Provider-neutral AI layer.** `server/src/ai/provider.ts` defines a small `LLMProvider` interface (`chat`, `generateText`, `generateObject`). `anthropic.ts` implements it with the official SDK (streaming for chat with tools, `messages.parse` with Zod for structured results). Adding another provider means writing one more class.

**Structured outputs for features.** Summaries, quizzes, German corrections, job parsing and document analysis use schema-constrained JSON, so the UI never has to parse free text.

**Prompt-injection defence.** Uploaded and retrieved text is wrapped in `<untrusted_document_content>` tags, and every system prompt says to treat it as data and never follow instructions inside it. Even if a document tried, the agent has no tool that sends anything outside the app, and deletions still need your click.

**Retrieval without embeddings.** Anthropic has no embeddings API, so retrieval uses BM25 over page-sized chunks stored in MongoDB. For one person's lecture notes this is fast and free. `server/src/services/retrieval.ts` is the only place to change to switch to vector search (e.g. Atlas Vector Search with an embeddings provider).

**Dates.** Due dates are stored as `YYYY-MM-DD` in your timezone (default `Europe/Berlin`), so "due Friday" never shifts because of UTC. Reminders are stored as exact instants.

---

## Security

- Passwords hashed with bcrypt (cost 12); minimum 10 characters. Login and registration are rate limited (10 per 15 minutes).
- Session: signed JWT in an `HttpOnly`, `SameSite=Strict` cookie (`Secure` in production), 7-day expiry.
- CSRF: state-changing requests must carry an `X-GhostMate: 1` header, which browsers cannot add cross-origin without a CORS preflight that the server only approves for `CLIENT_ORIGIN`.
- Every query is scoped by user id; tests check that one user cannot read, change, delete, confirm or retrieve another user's data.
- Zod validation on every endpoint; 1 MB JSON limit; uploads up to `MAX_UPLOAD_MB`, PDF verified by its magic bytes (renamed files are rejected); files are stored in MongoDB GridFS under generated ids, never on the server's filesystem, so there is no path to traverse.
- Helmet security headers; API keys only on the server; logs contain method, path, status and timing, never request bodies or document text.
- AI calls are rate limited per user.

---

## Tests actually run

Server (`npm test -w server`, 43 tests, including the Ollama provider against a fake Ollama server) covers: registration, login, logout, closed registration, CSRF header, invalid sessions; task CRUD, search, urgency ranking, overdue filter, validation, cross-user isolation, quick add, bulk create, weekly events; the agent loop with a scripted model (tool calls change real records, invalid input and unknown tools return errors, another user's records are unreachable, delete needs confirmation and cannot be confirmed twice or by someone else, the iteration limit stops loops, memory on/off, clear 503 when AI is not configured); PDF upload and per-page extraction, scanned-PDF detection, rejection of disguised files, grounded answers with verified and unverified citations, "not in your documents" without an AI call, document privacy and deletion, admin-letter analysis with quote verification and linked task creation (including a prompt-injection line in the letter); German corrections and mistake counting; application tracking and fit analysis requiring a real profile; dev-mock labelling; reminders firing exactly once, skipping completed tasks and re-arming after rescheduling; dashboard numbers from real records; memory edit/delete and settings validation; date, timezone, parser and retrieval helpers.

Client (`npm test -w client`, 4 tests): date helpers and the task row component.

Browser walkthrough (`scripts/smoke.mjs`, Playwright + Chromium, run against `npm run dev` with `AI_PROVIDER=mock` and an empty database): registers the first user, quick-adds five tasks, generates the labelled mock briefing, creates an event and switches month/week/list views, completes a task from the Todos panel, has the assistant create a real task through a tool call, uploads a PDF and asks a cited question, generates a quiz, runs a German role-play turn, adds and updates a job application (fit analysis correctly refuses without a profile), analyses a pasted Krankenkasse letter, adds and edits a memory, toggles light/dark, checks the phone layout for horizontal overflow, and logs out. All 14 steps passed. The script needs `playwright` installed separately; it is not a dependency.

Also checked by hand: the production build (`npm run build && npm start`) serves the app and API from one process, and the server refuses to start with `AI_PROVIDER=mock` when `NODE_ENV=production`.

---

## Known limitations

- No OCR: scanned PDFs are stored and flagged but cannot be searched or summarized.
- Reminders are in-app only and need GhostMate open in a browser tab.
- Calendar, email and job-search integrations are interfaces only (`server/src/integrations/index.ts`); nothing syncs with Google Calendar, Outlook or Gmail yet.
- Voice practice for German is not implemented.
- Retrieval is lexical (BM25): questions phrased very differently from the slides may miss passages.
- Assistant replies arrive in one piece (no token streaming in the UI yet).
- The calendar uses your browser's local date; set your profile timezone to match where you are.

## Project layout

```
server/src/
  ai/            provider interface, Anthropic + dev-mock providers, agent loop, tools
  services/      tasks, events, applications, documents/PDF/retrieval, study, german, jobs, admin, dashboard, reminders, quick add
  routes/        Express routers (one per area)
  models/        Mongoose schemas
  middleware/    auth, CSRF/CORS, error handling
  integrations/  interfaces for future calendar, email and job-search connections
server/test/     Vitest + Supertest tests
client/src/
  pages/         Dashboard, Assistant, Tasks, Study, German, Jobs, Documents, Settings, Login
  components/    UI kit, layout, task/document components
  lib/           API client, auth, hooks, types, dates
```
