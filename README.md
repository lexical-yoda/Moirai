# Moirai

A local-first, privacy-focused journaling app with optional AI-powered insights, voice-to-text, and semantic search. All data stays on your machine. Installable as a PWA.

## Features

**Core (works standalone, no external services):**
- Rich markdown editor with formatting toolbar
- One entry per day with autosave (2s debounce)
- Calendar view with mood-colored days
- Full-text search (FTS5 with BM25 ranking)
- Entry templates (gratitude, daily review, morning pages, weekly reflection)
- Manual tagging with autocomplete
- Entry version history with preview and revert
- Bi-directional entry linking (link related entries together)
- Voice recording with persistent playback (multiple recordings per entry)
- Multi-user with admin controls (first user is admin, registration lockdown)
- Dark/light theme (including login/register pages)
- Mood heatmap (GitHub-style year grid on dashboard)
- Markdown export
- PWA support (installable on mobile and desktop)
- Mobile-optimized with bottom tab navigation
- Docker deployment with auto-migration and healthchecks

**AI-Powered (configure in Settings):**
- Mood analysis, theme extraction, action items, key people detection
- Auto-tagging from AI-detected themes
- Weekly and monthly AI-generated reflections
- Semantic search via embeddings ("find entries similar to this one")
- Voice-to-text transcription via Whisper

## Tech Stack

- **Framework:** Next.js 16 (App Router, TypeScript, Turbopack)
- **Database:** SQLite via Drizzle ORM + better-sqlite3 (auto-migrating)
- **Auth:** better-auth (credentials, sessions, rate-limited, admin roles)
- **UI:** Tailwind CSS v4 + shadcn/ui (Base UI) + Lucide icons
- **Editor:** Tiptap with task lists, highlights, code blocks
- **Charts:** Recharts
- **Fonts:** Syne (display) + DM Mono (monospace)
- **AI:** Any OpenAI-compatible API (llama.cpp, Ollama, LM Studio, etc.)
- **Voice:** faster-whisper via FastAPI sidecar

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env.local
# Edit .env.local and set BETTER_AUTH_SECRET (generate with: openssl rand -hex 32)

# Push database schema
npm run db:push

# Start dev server
npm run dev
```

Open http://localhost:3000. The first account you create becomes admin.

### Docker

```bash
# Create .env
echo "BETTER_AUTH_SECRET=$(openssl rand -hex 32)" > .env

# Pull and run (or docker compose up --build to build locally)
docker compose up -d
```

The app runs at http://localhost:3500. Database auto-initializes on first boot — no manual migration needed.

### Behind a Reverse Proxy

If exposing via nginx (e.g., `https://moirai.yourdomain.com`), set the URL in your `.env`:

```env
BETTER_AUTH_SECRET=<your-secret>
BETTER_AUTH_URL=https://moirai.yourdomain.com
NEXT_PUBLIC_BETTER_AUTH_URL=https://moirai.yourdomain.com
```

Example nginx config:

```nginx
server {
    listen 443 ssl;
    server_name moirai.yourdomain.com;

    ssl_certificate     /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    client_max_body_size 50M;

    location / {
        proxy_pass http://<internal-ip>:3500;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Admin System

The first user to register automatically becomes admin. Registration closes after the first signup.

**Admin controls (Settings > Administration):**
- Open/close registration
- View all users
- Delete non-admin users

## Setting Up AI Services

The app works fully without AI. To enable AI features, configure endpoints in **Settings** after logging in. Each integration has a **Test** button to verify connectivity.

### llama.cpp (recommended for self-hosting)

```bash
# 1. Download a GGUF model
# Example: Llama 3.2 3B from https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF

# 2. Start llama-server with embeddings enabled
llama-server \
  --model /path/to/model.gguf \
  --host 0.0.0.0 \
  --port 8080 \
  --embeddings \
  --ctx-size 4096 \
  --n-gpu-layers 99

# 3. In Moirai Settings > AI/LLM:
#    Provider: llama-server
#    Endpoint: http://<machine-ip>:8080
#    Click Test
```

For better semantic search, run a dedicated embedding model:

```bash
llama-server \
  --model /path/to/nomic-embed-text-v1.5.Q8_0.gguf \
  --host 0.0.0.0 \
  --port 8081 \
  --embeddings

# In Moirai Settings > Embeddings:
#    Endpoint: http://<machine-ip>:8081
#    Model: nomic-embed-text
```

### Ollama

```bash
ollama serve
ollama pull llama3.2

# In Moirai Settings:
#    Provider: Ollama
#    Endpoint: http://<machine-ip>:11434
#    Model: llama3.2
```

### LM Studio

```bash
# Start LM Studio, load a model, start local server (default port 1234)

# In Moirai Settings:
#    Provider: LM Studio
#    Endpoint: http://localhost:1234
```

## Setting Up Voice Transcription (Whisper)

Voice transcription uses [faster-whisper](https://github.com/SYSTRAN/faster-whisper) via a lightweight FastAPI server. Recordings are saved and can be replayed from the entry page.

### Running the Whisper sidecar

```bash
# CPU-only
cd whisper-sidecar
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 5000

# With GPU acceleration (NVIDIA)
DEVICE=cuda COMPUTE_TYPE=float16 uvicorn server:app --host 0.0.0.0 --port 5000
```

### Docker (standalone)

```bash
cd whisper-sidecar
docker build -t moirai-whisper .
docker run -d -p 5000:5000 \
  -e MODEL_SIZE=base \
  -e DEVICE=cuda \
  -e COMPUTE_TYPE=float16 \
  --gpus all \
  moirai-whisper
```

### Configure in Moirai

Go to **Settings > Voice Transcription**, enter the endpoint URL, and click **Test**.

## Available Models

| Use Case | Recommended Model | Size | Notes |
|----------|------------------|------|-------|
| Chat/Insights | Llama 3.2 3B Instruct | ~2GB | Good balance of speed and quality |
| Chat/Insights | Mistral 7B Instruct | ~4GB | Better quality, needs more VRAM |
| Embeddings | nomic-embed-text v1.5 | ~270MB | Purpose-built for embeddings |
| Whisper | base | ~150MB | Fast, decent accuracy |
| Whisper | medium | ~1.5GB | Better accuracy |
| Whisper | large-v3 | ~3GB | Best accuracy, needs GPU |

## Project Structure

```
src/
  app/
    (auth)/              Login, register (with theme toggle)
    (app)/               Authenticated pages
      entry/[date]/      Journal editor with autosave
      calendar/          Monthly calendar view
      search/            Keyword + semantic search
      reflections/       AI-generated reflections
      settings/          Integrations + admin panel
    api/
      admin/             Registration control, user management
      entries/           CRUD, versions, insights, links, similar
      voice/             Transcribe, recordings, file serving
      reflections/       Generate, list, detail
      search/            FTS5 keyword + semantic
      settings/          User settings, test endpoints
      health/            Liveness check
  components/
    editor/              MarkdownEditor, Toolbar, VoiceRecorder, TagInput, VersionHistory, TemplateSelector
    layout/              Sidebar, BottomNav, Header, ThemeToggle, ServiceStatus
    entry/               InsightsPanel, SimilarEntries, RecordingsList, EntryLinks
    dashboard/           MoodChart, MoodHeatmap, TopicCloud, RecentEntries
    reflections/         ReflectionCard, GenerateReflection
  lib/
    db/                  Schema, connection (auto-migrating), FTS5
    auth/                better-auth config, session helpers
    ai/                  Client, prompts, extraction, embeddings, reflections
whisper-sidecar/         FastAPI + faster-whisper server
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BETTER_AUTH_SECRET` | Yes | — | Session signing secret (min 32 chars) |
| `BETTER_AUTH_URL` | No | `http://localhost:3000` | App URL (set if behind reverse proxy) |
| `DATABASE_PATH` | No | `./data/moirai.db` | SQLite database path |

AI, embeddings, and Whisper endpoints are configured per-user in the Settings page.

## License

MIT
