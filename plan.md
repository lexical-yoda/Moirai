# Journal App — Implementation Plan

## Context

Building a local-first, privacy-focused journaling app from an empty directory. The app provides AI-powered insights from journal entries, voice-to-text for hands-free entry, and a calendar-based UI. All processing stays local — llama-server for AI, faster-whisper for speech-to-text, SQLite for storage.

## Tech Stack

- **Framework:** Next.js 15 + TypeScript (App Router)
- **Database:** SQLite via Drizzle ORM + better-sqlite3
- **UI:** Tailwind CSS + shadcn/ui + Radix primitives + lucide-react icons
- **Editor:** Tiptap with markdown extension
- **Charts:** Recharts
- **AI:** llama-server (OpenAI-compatible API at localhost:8080)
- **Voice:** faster-whisper via a tiny FastAPI sidecar (localhost:5000)
- **Theme:** next-themes (dark/light/system)

## Database Schema

**entries** — id, date (unique, one per day), title, content (markdown, encrypted), word_count, template_used, timestamps
**insights** — id, entry_id (FK), mood, mood_score (-1 to 1), summary, action_items (JSON), key_people (JSON), themes (JSON), extracted_at
**tags** — id, name (unique), color, is_ai_generated
**entry_tags** — entry_id, tag_id (many-to-many)
**voice_recordings** — id, entry_id (FK), audio_path, transcription, duration, created_at
**entries_fts** — FTS5 virtual table on title+content with sync triggers

## Key Architecture Decisions

- **One entry per day** enforced by unique constraint on date
- **AI extraction is fire-and-forget** — entry saves immediately, AI runs async in background
- **Whisper runs as a Python sidecar** — Next.js API route proxies to it, frontend never calls it directly
- **Voice transcriptions get an AI formatting pass** through llama-server to produce clean markdown
- **Graceful degradation** — if AI/Whisper are offline, core journaling (write, read, search, calendar) still works perfectly
- **Encryption at rest** using AES-256-GCM with PBKDF2-derived key from user passphrase

## Implementation Phases

### Phase 1: Foundation
1. `npx create-next-app` with TypeScript + Tailwind + App Router
2. Install deps: drizzle-orm, better-sqlite3, next-themes, nanoid, date-fns, zod, swr
3. Set up Drizzle schema (`src/lib/db/schema.ts`) and SQLite connection (`src/lib/db/index.ts`)
4. Write FTS5 migration (raw SQL)
5. Build root layout with sidebar nav (Dashboard, Calendar, Search, Settings) + theme toggle
6. Set up shadcn/ui components (Button, Card, Dialog, Input, Badge, etc.)

### Phase 2: Entry CRUD + Markdown Editor
1. Build Tiptap markdown editor component (`src/components/editor/MarkdownEditor.tsx`)
2. Build `/entry/[date]/page.tsx` — editor with autosave (2s debounce)
3. API routes: `POST/GET /api/entries`, `GET/PUT/DELETE /api/entries/[id]`
4. Entry templates (gratitude, daily review, morning pages) with selector
5. Manual tag input with autocomplete
6. Encryption helpers (`src/lib/encryption.ts`)

### Phase 3: Calendar View
1. `CalendarGrid`, `CalendarDay`, `CalendarNav` components
2. `GET /api/entries?month=YYYY-MM` returning date, title, mood, word_count
3. Day click navigates to `/entry/[date]`
4. Color-code days by mood score

### Phase 4: Voice Recording + Whisper
1. Build `whisper-sidecar/server.py` — FastAPI + faster-whisper (~60 lines)
2. `useVoiceRecorder` hook using MediaRecorder API (webm/opus)
3. `VoiceRecorder` component with record/stop/preview
4. `POST /api/voice/transcribe` proxy route
5. AI formatting pass through llama-server to clean up transcription into markdown
6. Insert formatted text into editor

### Phase 5: AI Integration
1. `src/lib/ai/client.ts` — fetch wrapper for localhost:8080/v1/chat/completions
2. `src/lib/ai/prompts.ts` — structured JSON extraction prompt
3. `src/lib/ai/extract.ts` — full pipeline: call AI → parse JSON → upsert insights + tags
4. Wire into entry save flow (fire-and-forget after save)
5. Insight display components: MoodBadge, TopicChips, ActionItems, PeopleMentioned, EntrySummary
6. Insights sidebar on entry page

### Phase 6: Dashboard
1. `GET /api/insights` with aggregation queries (mood trends, topic frequency, streaks, stats)
2. MoodChart (recharts line chart), TopicCloud, StreakCounter, WritingStats
3. RecentEntries list

### Phase 7: Search + Export + Polish
1. FTS5 search via `GET /api/entries?search=query` with snippet highlighting
2. SearchBar + SearchResults components
3. Export: markdown zip (archiver) and optionally PDF
4. Loading states, error boundaries, empty states, responsive layout

### Phase 8: Hardening
1. Encryption at rest (AES-256-GCM, passphrase prompt on start)
2. Health checks for llama-server and Whisper sidecar (status indicators in UI)
3. `scripts/setup.sh` and `scripts/dev.sh` for orchestrated startup
4. README

## Additional Features (my suggestions)

- **Full-text search** with FTS5 and BM25 ranking
- **Auto-tagging** by AI + manual tagging with color coding
- **Entry templates** (gratitude, daily review, morning pages, weekly reflection)
- **Export** as markdown zip or PDF
- **Encryption at rest** for privacy
- **Autosave** with 2-second debounce
- **Streak tracking** on dashboard
- **Service health indicators** — show llama-server and Whisper status in the UI
- **Audio replay** — saved voice recordings can be replayed from the entry page

## Critical Files

| File | Role |
|---|---|
| `src/lib/db/schema.ts` | Drizzle schema — all features depend on this |
| `src/lib/ai/extract.ts` | AI extraction pipeline — most complex module |
| `src/app/entry/[date]/page.tsx` | Primary user surface: editor + voice + insights |
| `whisper-sidecar/server.py` | Whisper transcription service |
| `src/app/api/entries/route.ts` | Entry CRUD + triggers AI extraction |
| `src/lib/ai/prompts.ts` | All prompt templates for AI features |

## Verification

1. **Entry CRUD:** Create, edit, delete entries via the editor; verify SQLite persistence
2. **Calendar:** Navigate months, click days, verify entries load correctly
3. **Voice:** Record audio in browser, verify Whisper transcription returns, verify AI formatting
4. **AI Insights:** Save an entry, verify insights appear (mood, topics, actions, people, summary)
5. **Dashboard:** Write several entries, verify charts and stats populate correctly
6. **Search:** Search for text across entries, verify FTS5 results with snippets
7. **Offline resilience:** Stop llama-server/Whisper, verify app still works for basic journaling
