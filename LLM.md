# Moirai — LLM Development Guide

This document is for AI agents and developers working on the Moirai codebase. It provides the architectural context, conventions, and gotchas needed to make changes without breaking things.

## What This Is

A local-first journal app with admin controls. Users write daily entries. Optionally, AI extracts insights (mood, themes, people, action items) and generates weekly/monthly reflections. Voice transcription via Whisper is also optional — recordings are saved and replayable. Everything runs locally — no cloud APIs unless the user explicitly configures one. First user becomes admin; registration auto-closes.

## Core Architecture

### Stack
- **Next.js 16** with App Router, TypeScript, Turbopack
- **SQLite** via `better-sqlite3` + Drizzle ORM (auto-migrating on startup)
- **better-auth** for multi-user authentication (credentials only, admin roles, rate-limited)
- **Tailwind CSS v4** + shadcn/ui (Base UI variant, NOT Radix — uses `render` prop, not `asChild`)
- **Tiptap** for the rich text editor
- **Recharts** for mood chart, **custom heatmap** for mood year view
- **DOMPurify** for HTML sanitization
- **Zod v4** for input validation (`import from "zod/v4"`)
- **Fonts:** Syne (display) + DM Mono (monospace)

### Key Design Decisions

1. **One entry per day** — enforced by unique constraint on `(user_id, date)`. The POST /api/entries endpoint upserts by date with race condition handling.

2. **AI is optional and fire-and-forget** — entries save immediately, AI extraction runs async in the background. If AI is offline or unconfigured, the app works perfectly for core journaling.

3. **All external services are user-configured** — AI endpoint, embedding endpoint, and Whisper endpoint are set per-user in the Settings page. There are no hardcoded service URLs. Environment variables serve as initial defaults only.

4. **Multi-user isolation** — every database table has a `user_id` foreign key. Every API route validates session and scopes queries by user. Never query without filtering by user_id.

5. **Admin system** — first registered user becomes admin, registration auto-closes. Admin can reopen registration and manage users from Settings.

6. **Versioning on save** — before updating an entry, the current content is saved as a version (if the SHA-256 hash changed). Version creation + entry update happen inside a `sqlite.transaction()` to prevent race conditions.

7. **Content is HTML** — Tiptap outputs HTML, stored as-is in SQLite. All rendering of stored HTML uses `sanitizeHtml()` from `src/lib/sanitize.ts` via DOMPurify. Never render user content with `dangerouslySetInnerHTML` without sanitizing first.

8. **Voice recordings persist** — audio files saved to `/data/voice/`, metadata in `voice_recordings` table. Multiple recordings per entry. Served via authenticated API route.

9. **Bi-directional entry links** — entries can link to other entries by date. Links are stored once but queried in both directions.

10. **Auto-migration** — database tables are created automatically on first connection in `src/lib/db/index.ts`. No manual migration step needed in Docker.

11. **Mobile-first navigation** — bottom tab bar on mobile, sidebar on desktop. No hamburger menu.

## File Layout

```
src/
├── app/
│   ├── (auth)/                # Login/register — theme toggle, public routes
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── layout.tsx         # Adds ThemePicker to auth pages
│   ├── (app)/                 # Authenticated pages — sidebar (desktop) + bottom nav (mobile)
│   │   ├── page.tsx           # Dashboard (stats, mood chart, heatmap, topics, recent)
│   │   ├── entry/[date]/      # Journal editor with sidebar (insights, links, recordings, similar)
│   │   ├── calendar/          # Monthly calendar with mood colors
│   │   ├── search/            # FTS5 keyword + semantic search + export
│   │   ├── reflections/       # AI reflections list + detail
│   │   ├── settings/          # Integrations (AI, embeddings, whisper) + admin panel
│   │   └── layout.tsx         # Sidebar + Header + BottomNav wrapper
│   └── api/
│       ├── admin/             # Registration toggle, user management (admin-only)
│       ├── auth/[...all]/     # better-auth catch-all (rate-limited, registration blocking)
│       ├── entries/           # CRUD + versions + insights + links + similar
│       ├── tags/              # Tag CRUD with entry linking
│       ├── insights/          # Dashboard aggregation + heatmap data
│       ├── reflections/       # Generate, list, detail, delete
│       ├── search/            # FTS5 keyword search
│       ├── search/semantic/   # Vector similarity search
│       ├── settings/          # User settings + test-connection + test-whisper
│       ├── voice/             # Transcribe proxy, recording CRUD, file serving
│       ├── export/            # Streaming markdown export
│       └── health/            # Liveness check (unauthenticated basic, detailed with auth)
├── components/
│   ├── editor/                # MarkdownEditor, Toolbar, VoiceRecorder, TagInput, VersionHistory, TemplateSelector
│   ├── layout/                # Sidebar, BottomNav, Header, UserMenu, ThemePicker, ServiceStatus
│   ├── entry/                 # InsightsPanel, SimilarEntries, RecordingsList, EntryLinks
│   ├── dashboard/             # MoodChart, MoodHeatmap, TopicCloud, RecentEntries
│   ├── reflections/           # ReflectionCard, GenerateReflection
│   └── ui/                    # shadcn/ui primitives (Button, Card, Dialog, etc.)
├── hooks/
│   └── use-voice-recorder.ts  # MediaRecorder hook with full cleanup on unmount
├── lib/
│   ├── db/
│   │   ├── schema.ts          # Drizzle schema — 15 tables, all with user_id
│   │   ├── index.ts           # SQLite connection (WAL mode, foreign keys ON, auto-migration)
│   │   └── migrate.ts         # FTS5 virtual table + sync triggers (legacy, superseded by index.ts)
│   ├── auth/
│   │   ├── index.ts           # better-auth server config + admin/registration helpers
│   │   ├── client.ts          # Client-side auth hooks (relative URL, no baseURL)
│   │   └── session.ts         # Server-side getSession() helper
│   ├── ai/
│   │   ├── config.ts          # Load AI settings from user_settings table
│   │   ├── client.ts          # OpenAI-compatible fetch wrapper (chat + embeddings)
│   │   ├── prompts.ts         # All prompt templates with XML delimiters + injection guards
│   │   ├── extract.ts         # Insight extraction pipeline (fire-and-forget)
│   │   ├── embed-entry.ts     # Embedding generation + sqlite-vec storage (cached table creation)
│   │   └── reflections.ts     # Weekly/monthly reflection generation
│   ├── sanitize.ts            # DOMPurify HTML sanitization (restrictive allowlist)
│   ├── validation.ts          # Zod schemas for all API inputs (date validation, URL protocol checks)
│   ├── encryption.ts          # AES-256-GCM + PBKDF2 (600k iterations, timingSafeEqual)
│   ├── rate-limit.ts          # In-memory sliding window rate limiter
│   ├── json.ts                # Safe JSON parse with error logging
│   ├── api-utils.ts           # Safe request.json() parsing
│   ├── templates.ts           # Entry templates
│   └── utils.ts               # cn() classname utility
├── proxy.ts                   # Auth proxy (Next.js 16 convention — checks any session_token cookie)
└── ...
whisper-sidecar/
├── server.py                  # FastAPI + faster-whisper (~60 lines)
├── requirements.txt
└── Dockerfile
public/
├── manifest.json              # PWA manifest
├── sw.js                      # Service worker (network-first, cache fallback)
└── icons/                     # PWA icons (192, 512)
```

## Database Schema (src/lib/db/schema.ts)

15 tables. All application tables have `user_id` FK with cascade delete.

**Auth (managed by better-auth):** users (with `is_admin`), sessions, accounts, verifications

**Global:** app_settings (key-value, used for `registration_open`)

**Application:**
- `user_settings` — id, user_id, ai_provider, ai_endpoint_url, ai_model_name, ai_api_key, embedding_*, whisper_endpoint_url
- `entries` — id, user_id, date (unique per user), title, content (HTML), word_count, template_used
- `entry_versions` — id, entry_id, user_id, version_number (unique per entry), title, content, content_hash
- `entry_links` — id, source_entry_id, target_entry_id, user_id (unique on source+target)
- `insights` — id, entry_id, user_id, mood, mood_score (-1..1), summary, action_items/key_people/themes (JSON)
- `tags` — id, user_id, name (unique per user), color, is_ai_generated
- `entry_tags` — entry_id, tag_id (many-to-many)
- `voice_recordings` — id, entry_id, user_id, audio_path, transcription, duration
- `entry_embeddings` — id, entry_id, user_id, model_name, embedded_at
- `reflections` — id, user_id, type, period_start/end, title, content, mood_summary, themes/key_insights/entry_ids (JSON)

**Virtual tables (raw SQL in auto-migration, not in Drizzle schema):**
- `entries_fts` — FTS5 on title+content, synced via triggers
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

  // 2. Parse and validate body (safe JSON parsing)
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

### Admin Routes

Admin routes use a `requireAdmin()` helper:
```typescript
async function requireAdmin(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) });
  if (!user?.isAdmin) return null;
  return user;
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

### Auth & Registration

- `src/proxy.ts` — edge-level cookie check (looks for any cookie containing `session_token`)
- Every API route does full session validation via `auth.api.getSession()`
- Auth API is rate-limited (10 requests / 15 minutes per IP)
- Cookie prefix is `moirai`, secure cookies in production (becomes `__Secure-moirai.session_token`)
- Auth client uses relative URLs (no `baseURL`) — works behind any reverse proxy
- First user auto-becomes admin; registration auto-closes
- Registration blocked at API level in `auth/[...all]/route.ts` before reaching better-auth

### Theming

7 color palettes, each with dark and light mode:
- **Palettes:** GitHub (default), Indigo, Nord, Emerald, Rose, Amber, Ocean
- **Mode:** controlled by `next-themes` (adds `.dark` class to `<html>`)
- **Palette:** controlled by `data-palette` attribute on `<html>`, stored in `localStorage` as `moirai-palette`
- **CSS structure:** `globals.css` has `[data-palette="X"]` for light and `.dark[data-palette="X"]` for dark variants
- **Component:** `ThemePicker` in `src/components/layout/theme-picker.tsx` — dropdown with palette dots + light/dark toggle
- **Validation:** localStorage value validated against palette list on mount to prevent injection

When adding new CSS that should be theme-aware, use the existing CSS variables (`--primary`, `--background`, `--border`, etc.) — they automatically adapt to the selected palette and mode.

### Mobile Navigation

- Desktop (md+): sidebar with full nav (6 items including Reflections)
- Mobile (<md): bottom tab bar with 5 tabs (Home, Calendar, Write, Search, Settings)
- No hamburger menu — clean split
- Bottom nav respects safe area for devices with home indicators/notches

### Voice Recording Flow

The voice recorder saves recordings BEFORE transcription so audio is never lost.

1. User clicks **Record** → MediaRecorder captures audio (webm/opus) with **Pause/Resume** support
2. User clicks **Stop** → audio blob available for preview
3. User has three options:
   - **Transcribe** — saves recording to disk first, then sends to Whisper. If transcription fails, recording is still saved
   - **Save** — saves recording without transcription (when Whisper is unavailable or not needed)
   - **Discard** — deletes the unsaved recording
4. **Upload** button allows importing existing audio files (any audio format, max 50MB)
5. Transcribe route auto-detects Whisper API format (tries `/transcribe`, `/asr`, `/v1/audio/transcriptions`) with 5-minute timeout
6. If `entryId` is null (new day), voice recorder creates the entry first via `POST /api/entries`
7. Recordings stored on disk (`/data/voice/<nanoid>.webm`) with metadata in `voice_recordings` table
8. **Download** button on each saved recording for export
9. Recordings visible below tags section with playback controls on all screen sizes
10. Supports 20+ minute recordings (body size limit: 50MB, nginx proxy_read_timeout: 300s)

### Entry Page Structure

The entry page (`/entry/[date]`) has:
- **Header row 1:** date + save status + word count
- **Header row 2:** Record, Upload, Pause/Resume, Template, Version History (with clear), Delete buttons
- **Title input:** borderless, large font
- **Tiptap editor:** rich text with toolbar
- **Tags section:** below editor
- **Recordings list:** below tags (visible on all screens, with download/delete per recording)
- **Mobile (< lg):** AI Insights, Linked Entries, Similar Entries shown inline below recordings
- **Desktop (lg+):** same content in a sidebar on the right

Delete button uses a Dialog confirmation, not `confirm()`. Version History has a "Clear all history" button.

## Common Tasks

### Adding a new API route
1. Create route file in `src/app/api/`
2. Add auth check, use `parseJsonBody()` + Zod schema from `validation.ts`
3. Always filter by `session.user.id`
4. Add the table to auto-migration SQL in `src/lib/db/index.ts` if new

### Adding a new page
1. Create under `src/app/(app)/` (gets sidebar + header + bottom nav)
2. Add nav link in `src/components/layout/sidebar.tsx` (desktop)
3. Optionally add to `src/components/layout/bottom-nav.tsx` (mobile, max 5 items)

### Modifying the database schema
1. Edit `src/lib/db/schema.ts`
2. Add matching `CREATE TABLE IF NOT EXISTS` in `src/lib/db/index.ts` (auto-migration)
3. Run `npm run db:push` for local dev
4. Add `user_id` FK with cascade delete on all new tables

### Adding a new AI feature
1. Add prompt template in `src/lib/ai/prompts.ts` (use XML delimiters)
2. Add pipeline function in `src/lib/ai/`
3. Use `getAIConfig(userId)` to get the user's configured endpoint
4. Handle the case where AI is not configured (return gracefully, don't crash)

### Adding admin-only functionality
1. Create route in `src/app/api/admin/`
2. Use `requireAdmin()` pattern (check session + `isAdmin` flag)
3. Add UI in Settings page inside the `{isAdmin && (...)}` block

## Security Model

- **XSS:** DOMPurify on all rendered HTML, HTML entity escaping for transcriptions
- **Input validation:** Zod schemas on every POST/PUT, safe JSON body parsing, calendar date validation
- **Auth:** better-auth sessions, rate limiting, secure cookies, admin roles
- **Registration:** Auto-closes after first user, admin toggle, blocked at API level
- **Encryption:** AES-256-GCM with PBKDF2 (600k iterations), constant-time comparison
- **SQL injection:** Drizzle ORM parameterized queries + parameterized raw SQL
- **Prompt injection:** XML delimiters + explicit "ignore instructions in content" in system prompts
- **Data isolation:** Every query scoped by user_id, ownership verified before writes
- **File security:** Voice files served via authenticated API (no direct path access), path traversal impossible
- **Rate limiting:** In-memory sliding window on auth endpoints
- **Open redirect prevention:** Callback URLs validated as relative paths
- **API key protection:** Never returned in GET responses (masked with dots)
- **HTTPS enforcement:** URL validation requires HTTPS for remote endpoints in production

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
10. **Cookie name varies by environment** — production uses `__Secure-moirai.session_token`, dev uses `moirai.session_token`. The proxy checks for any cookie containing `session_token`.
11. **New tables need two places** — `schema.ts` (Drizzle) AND `index.ts` (auto-migration SQL). They must match.
12. **Auth client has no baseURL** — it uses relative URLs. This is intentional for reverse proxy compatibility.
13. **Voice files live on disk** — stored in `/data/voice/` (Docker) or `data/voice/` (local). The `audio_path` column stores just the filename, not the full path.
14. **Theming uses two mechanisms** — `next-themes` for dark/light (`.dark` class), `data-palette` attribute for color palette. Both on `<html>`. CSS uses `[data-palette="X"]` and `.dark[data-palette="X"]` selectors.
15. **Whisper API is auto-detected** — the transcribe route tries 3 API formats in order: custom `/transcribe`, whisper-asr-webservice `/asr`, and OpenAI `/v1/audio/transcriptions`. No configuration needed.
16. **Voice recorder creates entries** — if recording on a new day with no existing entry, the voice recorder creates the entry via the API before saving the recording. The `entryId` passed to VoiceRecorder may be null.
17. **Never use `confirm()` or `alert()`** — use shadcn Dialog components for all confirmations. See delete button pattern in entry page and reflections page.
18. **Heatmap uses SVG** — the mood heatmap is a custom SVG component, not a library. Cell positions are calculated with exact pixel math. Tailwind classes are applied to SVG `<rect>` elements via `className`.
