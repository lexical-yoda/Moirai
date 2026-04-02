# Moirai — LLM Development Guide

This document is for AI agents and developers working on the Moirai codebase. It provides the architectural context, conventions, and gotchas needed to make changes without breaking things.

## What This Is

A local-first journal app. Users write daily entries. Optionally, AI extracts insights (mood, themes, people, action items) and generates weekly/monthly reflections. Voice transcription via Whisper is also optional. Everything runs locally — no cloud APIs unless the user explicitly configures one.

## Core Architecture

### Stack
- **Next.js 15** with App Router, TypeScript, Turbopack
- **SQLite** via `better-sqlite3` + Drizzle ORM
- **better-auth** for multi-user authentication (credentials only, no OAuth)
- **Tailwind CSS v4** + shadcn/ui (Base UI variant, NOT Radix — uses `render` prop, not `asChild`)
- **Tiptap** for the rich text editor
- **DOMPurify** for HTML sanitization
- **Zod v4** for input validation (`import from "zod/v4"`)

### Key Design Decisions

1. **One entry per day** — enforced by unique constraint on `(user_id, date)`. The POST /api/entries endpoint upserts by date.

2. **AI is optional and fire-and-forget** — entries save immediately, AI extraction runs async in the background. If AI is offline or unconfigured, the app works perfectly for core journaling.

3. **All external services are user-configured** — AI endpoint, embedding endpoint, and Whisper endpoint are set per-user in the Settings page. There are no hardcoded service URLs. Environment variables serve as initial defaults only.

4. **Multi-user isolation** — every database table has a `user_id` foreign key. Every API route validates session and scopes queries by user. Never query without filtering by user_id.

5. **Versioning on save** — before updating an entry, the current content is saved as a version (if the SHA-256 hash changed). Version creation + entry update happen inside a `sqlite.transaction()` to prevent race conditions.

6. **Content is HTML** — Tiptap outputs HTML, stored as-is in SQLite. All rendering of stored HTML uses `sanitizeHtml()` from `src/lib/sanitize.ts` via DOMPurify. Never render user content with `dangerouslySetInnerHTML` without sanitizing first.

## File Layout

```
src/
├── app/
│   ├── (auth)/                # Login/register — no sidebar, public routes
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (app)/                 # Authenticated pages — sidebar + header
│   │   ├── page.tsx           # Dashboard
│   │   ├── entry/[date]/      # Journal editor
│   │   ├── calendar/          # Monthly calendar
│   │   ├── search/            # FTS5 + semantic search
│   │   ├── reflections/       # AI reflections list + detail
│   │   └── settings/          # Service integration config
│   └── api/
│       ├── auth/[...all]/     # better-auth catch-all (rate-limited)
│       ├── entries/           # CRUD + versions + insights + similar
│       ├── tags/              # Tag CRUD
│       ├── insights/          # Dashboard aggregation
│       ├── reflections/       # List + generate + detail
│       ├── search/            # FTS5 keyword search
│       ├── search/semantic/   # Vector similarity search
│       ├── settings/          # User settings + test endpoints
│       ├── voice/transcribe/  # Whisper proxy
│       ├── export/            # Streaming markdown export
│       └── health/            # Liveness check
├── components/
│   ├── editor/                # MarkdownEditor, Toolbar, VoiceRecorder, TagInput, VersionHistory, TemplateSelector
│   ├── layout/                # Sidebar, Header, UserMenu, ThemeToggle, ServiceStatus
│   ├── entry/                 # InsightsPanel, SimilarEntries
│   ├── dashboard/             # MoodChart, TopicCloud, RecentEntries
│   ├── reflections/           # ReflectionCard, GenerateReflection
│   └── ui/                    # shadcn/ui primitives (Button, Card, Dialog, etc.)
├── hooks/
│   └── use-voice-recorder.ts  # MediaRecorder hook with cleanup
├── lib/
│   ├── db/
│   │   ├── schema.ts          # Drizzle schema — 13 tables, all with user_id
│   │   ├── index.ts           # SQLite connection (WAL mode, foreign keys ON)
│   │   └── migrate.ts         # FTS5 virtual table + sync triggers
│   ├── auth/
│   │   ├── index.ts           # better-auth server config
│   │   ├── client.ts          # Client-side auth hooks (useSession, signIn, etc.)
│   │   └── session.ts         # Server-side getSession() helper
│   ├── ai/
│   │   ├── config.ts          # Load AI settings from user_settings table
│   │   ├── client.ts          # OpenAI-compatible fetch wrapper (chat + embeddings)
│   │   ├── prompts.ts         # All prompt templates with injection guards
│   │   ├── extract.ts         # Insight extraction pipeline (fire-and-forget)
│   │   ├── embed-entry.ts     # Embedding generation + sqlite-vec storage
│   │   └── reflections.ts     # Weekly/monthly reflection generation
│   ├── sanitize.ts            # DOMPurify HTML sanitization
│   ├── validation.ts          # Zod schemas for all API inputs
│   ├── encryption.ts          # AES-256-GCM + PBKDF2 (600k iterations)
│   ├── rate-limit.ts          # In-memory sliding window rate limiter
│   ├── json.ts                # Safe JSON parse with error logging
│   ├── api-utils.ts           # Safe request.json() parsing
│   ├── templates.ts           # Entry templates
│   └── utils.ts               # cn() classname utility
├── proxy.ts                   # Auth proxy (Next.js 16 convention, replaces middleware.ts)
└── ...
whisper-sidecar/
├── server.py                  # FastAPI + faster-whisper (~60 lines)
├── requirements.txt
└── Dockerfile
```

## Database Schema (src/lib/db/schema.ts)

13 tables. All application tables have `user_id` FK with cascade delete.

**Auth (managed by better-auth):** users, sessions, accounts, verifications

**Application:**
- `entries` — id, user_id, date (unique per user), title, content (HTML), word_count, template_used
- `entry_versions` — id, entry_id, user_id, version_number (unique per entry), title, content, content_hash
- `insights` — id, entry_id, user_id, mood, mood_score (-1..1), summary, action_items/key_people/themes (JSON strings)
- `tags` — id, user_id, name (unique per user), color, is_ai_generated
- `entry_tags` — entry_id, tag_id (many-to-many)
- `voice_recordings` — id, entry_id, user_id, audio_path, transcription, duration
- `entry_embeddings` — id, entry_id, user_id, model_name, embedded_at
- `reflections` — id, user_id, type, period_start, period_end, title, content, mood_summary, themes/key_insights/entry_ids (JSON)
- `user_settings` — id, user_id, ai_provider, ai_endpoint_url, ai_model_name, ai_api_key, embedding_*, whisper_endpoint_url

**Virtual tables (raw SQL, not in Drizzle schema):**
- `entries_fts` — FTS5 on title+content, synced via triggers (see migrate.ts)
- `vec_entries` — sqlite-vec for embedding KNN search (created dynamically by embed-entry.ts)

## Conventions and Patterns

### API Routes

Every API route follows this pattern:
```typescript
import { parseJsonBody } from "@/lib/api-utils";
import { someSchema, parseBody } from "@/lib/validation";

export async function POST(request: NextRequest) {
  // 1. Auth check
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 2. Parse and validate body
  const jsonResult = await parseJsonBody(request);
  if ("error" in jsonResult) return jsonResult.error;
  const parsed = parseBody(someSchema, jsonResult.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // 3. Business logic (always scope by user_id)
  const result = await db.query.entries.findFirst({
    where: and(eq(entries.id, id), eq(entries.userId, session.user.id)),
  });

  // 4. Return response
  return NextResponse.json(result);
}
```

### Atomic Writes with Transactions

When creating a version + updating an entry, use `sqlite.transaction()`:
```typescript
import { sqlite } from "@/lib/db";

const op = sqlite.transaction(() => {
  sqlite.prepare("INSERT INTO entry_versions ...").run(...);
  sqlite.prepare("UPDATE entries SET ...").run(...);
});
op();
```

This mixes raw SQL (for the transaction) with Drizzle ORM (for reads). The raw SQL uses snake_case column names.

### JSON Fields

Insights, reflections, etc. store arrays as JSON strings in SQLite. Always use `safeJsonParse()` from `src/lib/json.ts` when reading them — never bare `JSON.parse()`.

### HTML Sanitization

```typescript
import { sanitizeHtml } from "@/lib/sanitize";

// Always sanitize before dangerouslySetInnerHTML
<div dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }} />
```

### Component Library

This project uses **shadcn/ui v4 with Base UI** (not Radix). Key difference:
- Use `render` prop instead of `asChild`:
  ```tsx
  // Correct:
  <DialogTrigger render={<Button variant="ghost" />}>Click me</DialogTrigger>

  // Wrong (will not compile):
  <DialogTrigger asChild><Button>Click me</Button></DialogTrigger>
  ```

### AI Pipeline

AI features are fire-and-forget. After an entry saves:
1. `extractInsights()` calls the AI endpoint, parses JSON response, upserts insights + auto-creates tags
2. `embedEntry()` generates an embedding and stores in sqlite-vec

Both run with `.catch((err) => console.error(...))` — they never block the save response.

Prompts use XML delimiters (`<entry>`, `<transcription>`, `<entries>`) and explicit instructions to ignore user-injected instructions.

### Auth

- `src/proxy.ts` — edge-level cookie check (redirects to /login)
- Every API route does full session validation via `auth.api.getSession()`
- Auth API is rate-limited (10 requests / 15 minutes per IP)
- Cookie prefix is `moirai`, secure cookies in production

## Common Tasks

### Adding a new API route
1. Create route file in `src/app/api/`
2. Add auth check, use `parseJsonBody()` + Zod schema from `validation.ts`
3. Always filter by `session.user.id`

### Adding a new page
1. Create under `src/app/(app)/` (gets sidebar + header)
2. Add nav link in `src/components/layout/sidebar.tsx`

### Modifying the database schema
1. Edit `src/lib/db/schema.ts`
2. Run `npm run db:push` (or `npm run db:generate` for migration files)
3. If adding a new table, add `user_id` FK with cascade delete

### Adding a new AI feature
1. Add prompt template in `src/lib/ai/prompts.ts` (use XML delimiters)
2. Add pipeline function in `src/lib/ai/`
3. Use `getAIConfig(userId)` to get the user's configured endpoint
4. Handle the case where AI is not configured (return gracefully, don't crash)

## Security Model

- **XSS:** DOMPurify on all rendered HTML, HTML entity escaping for transcriptions
- **Input validation:** Zod schemas on every POST/PUT, safe JSON body parsing
- **Auth:** better-auth sessions, rate limiting, secure cookies
- **Encryption:** AES-256-GCM with PBKDF2 (600k iterations), constant-time comparison
- **SQL injection:** Drizzle ORM parameterized queries + parameterized raw SQL
- **Prompt injection:** XML delimiters + explicit "ignore instructions in content" in system prompts
- **Data isolation:** Every query scoped by user_id, ownership verified before writes
- **Rate limiting:** In-memory sliding window on auth endpoints
- **Open redirect prevention:** Callback URLs validated as relative paths

## Things to Watch Out For

1. **Never use `asChild` on shadcn components** — this project uses Base UI, not Radix. Use `render` prop.
2. **Never `JSON.parse()` database fields directly** — use `safeJsonParse()` from `src/lib/json.ts`.
3. **Never render HTML without `sanitizeHtml()`** — all stored content is user-generated HTML.
4. **Always scope queries by `user_id`** — multi-user data isolation is critical.
5. **Use `sqlite.transaction()` for atomic multi-step writes** — especially version creation + entry update.
6. **AI endpoints are per-user** — never hardcode URLs. Use `getAIConfig(userId)`.
7. **Zod is imported from `"zod/v4"`** — this project uses Zod 4, not Zod 3.
8. **Next.js 16 uses `proxy.ts`** not `middleware.ts` — the function is named `proxy`, not `middleware`.
9. **Route params are `Promise`** — use `const { id } = await params;` in route handlers.
