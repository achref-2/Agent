# GhostMate

GhostMate is the assistant I built for my own life as an international Master's student in Cologne. It keeps my tasks and deadlines, answers questions about lecture PDFs, helps me practise German, tracks my student-job applications and explains official German letters.

The idea I cared about most: **the model never touches the database directly.** It can only act through a fixed set of typed tools on my own records, every tool call is shown with its real result, and anything that deletes data waits for a click.

**Stack:** React 19, Vite, TypeScript, Tailwind CSS 4 · Node.js 22, Express 5, MongoDB (Mongoose), Zod · Claude API with tool calling and structured outputs, or a local model through Ollama

## What it can do

| Area | Features |
| --- | --- |
| **Dashboard** | Today's events, tasks due today, overdue tasks, top priorities and the next 7 days, all computed from the database. An optional AI daily briefing is generated from the same records. |
| **Assistant** | Chat with persistent conversations. Each answer lists the tools that ran with their inputs and results; failed calls show in red. "Plan my day" separates confirmed events from suggestions. |
| **Tasks & calendar** | Month, week and day views, weekly recurring events (lectures), priorities, categories and reminders. Quick add parses plain text locally, for example `Remind me to email my professor tomorrow at 10 !high`. |
| **Study** | Upload lecture PDFs and ask questions. Answers cite the document and page, and each quote is checked against the stored text. Also summaries, explanations, quizzes, flashcards and revision plans. |
| **German coach** | Role-plays (landlord, job interview, university office, Ausländerbehörde, doctor and more) with corrections explained in English, French or Tunisian Arabic. Recurring mistakes are counted and turned into exercises. |
| **Job applications** | Track applications from saved to offer, extract requirements from a pasted job ad, run a fit analysis against my own profile, and draft cover letters and follow-up emails. |
| **Documents** | Paste an official letter or upload a PDF to get a plain-English explanation, deadlines, required documents and a German reply draft, then turn the actions into tasks. |
| **Memory** | Long-term preferences and goals that I can edit or delete, and a switch to turn memory off completely. |

## How it works

**One agent, a fixed toolbox.** The model can call 16 tools (`create_task`, `list_events`, `search_documents`, `retrieve_document_passages`, `save_memory` and so on). Each tool has a Zod schema that is converted to JSON Schema for the model. It validates its input, runs a service function that always filters by the signed-in user, and returns `{ ok, summary, data }` or an error. `server/src/ai/agent.ts` runs the loop with hard limits on model calls and tool calls per message.

**Deleting needs a human.** Delete tools never delete directly. They create a pending action that the user confirms or cancels. It expires after an hour and can't run twice.

**The database is the source of truth.** Tasks, events and applications are records, not chat memory. The system prompt tells the model to look things up with tools instead of trusting earlier messages.

**Swappable AI provider.** `server/src/ai/provider.ts` defines a small interface (`chat`, `generateText`, `generateObject`). There are implementations for the Anthropic SDK and for Ollama, plus a clearly labelled mock for development.

**Retrieval without embeddings.** Questions are matched against page-sized chunks with BM25, and only the top passages go to the model. If nothing relevant is found, the app says so without calling the model. `server/src/services/retrieval.ts` is the one place to change to switch to vector search.

**Prompt-injection defence.** Uploaded and retrieved text is wrapped in `<untrusted_document_content>` tags and treated as data. Even if a document tried to give instructions, the agent has no tool that sends anything outside the app, and deletions still need a click.

**Security.** bcrypt password hashing, a signed JWT in an HttpOnly `SameSite=Strict` cookie, a custom header against CSRF, rate limits on login and AI calls, Zod validation on every endpoint, PDF uploads checked by their magic bytes and stored in GridFS, and Helmet headers. Logs never contain request bodies or document text.

## Run it locally

You need Node.js 22 and a MongoDB database (a free Atlas cluster or a local `mongod`).

```bash
npm install                  # installs server and client (npm workspaces)
cp .env.example .env         # then set MONGODB_URI, JWT_SECRET and the AI provider
npm run dev                  # API on :4000, frontend on http://localhost:5173
```

The first visit shows "Create your account". After that, registration is closed unless `ALLOW_REGISTRATION=true`.

Generate a JWT secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Choosing the AI provider

| `AI_PROVIDER` | What happens |
| --- | --- |
| `anthropic` | Uses the Claude API. Set `ANTHROPIC_API_KEY`, and optionally `ANTHROPIC_MODEL` and `ANTHROPIC_EFFORT` to control cost. |
| `ollama` | Free local model. Run `ollama pull qwen2.5:7b` and set `OLLAMA_MODEL`. The model must support tool calling (qwen2.5, qwen3, llama3.1). |
| `none` | All non-AI features work; AI buttons are disabled. |
| `mock` | Development only. Every answer is labelled as a mock, and the server refuses to start with it in production. |

`AGENT_MAX_ITERATIONS` and `AGENT_MAX_TOOL_CALLS` cap each agent turn (defaults 6 and 12). Each user is limited to 20 AI requests per minute.

## Tests

```bash
npm test             # server (Vitest + Supertest + in-memory MongoDB) and client tests
npm run typecheck
```

43 server tests cover authentication, CSRF, task CRUD and ranking, the agent loop with a scripted model (tool errors, iteration limits, delete confirmation, cross-user isolation), PDF upload and cited answers, a prompt-injection line inside a letter, German corrections, application tracking and reminders firing exactly once.

`scripts/smoke.mjs` is a 14-step browser walkthrough with Playwright against `npm run dev` and the mock provider. Playwright is not a dependency; install it separately to run it.

## Deploy

GhostMate builds into one Node service that serves both the API and the frontend (Render, Railway, Fly.io or any Node host):

- Build: `npm install && npm run build`
- Start: `npm start`
- Environment: everything from `.env.example`, with `NODE_ENV=production`, your Atlas `MONGODB_URI`, a new `JWT_SECRET` and `CLIENT_ORIGIN` set to the public URL. HTTPS is required because the session cookie is `Secure` in production.

## Known limitations

- No OCR: scanned PDFs are stored and flagged but can't be searched.
- Reminders are in-app only and need GhostMate open in a browser tab.
- Calendar, email and job-search integrations are interfaces only (`server/src/integrations`).
- Retrieval is lexical, so questions worded very differently from the slides can miss passages.
- Assistant replies arrive in one piece; there's no token streaming in the UI yet.

## Project structure

```
server/src/
├── ai/            provider interface, Anthropic, Ollama and mock providers, agent loop, tools
├── services/      tasks, events, applications, documents and retrieval, study, German, jobs, reminders
├── routes/        one Express router per area
├── models/        Mongoose schemas
├── middleware/    auth, CSRF/CORS, errors
└── integrations/  interfaces for future calendar, email and job-search connections
client/src/
├── pages/         Dashboard, Assistant, Tasks, Study, German, Jobs, Documents, Settings, Login
├── components/    UI kit, layout, task and document components
└── lib/           API client, auth, hooks, types, dates
```

## Author

Achraf Aroua · [Portfolio](https://achref-2.github.io) · [LinkedIn](https://www.linkedin.com/in/achref-aroua/)
