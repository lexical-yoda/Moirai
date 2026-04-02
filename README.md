# Moirai

A local-first, privacy-focused journaling app with optional AI-powered insights, voice-to-text, and semantic search. All data stays on your machine.

## Features

**Core (works standalone, no external services):**
- Rich markdown editor with formatting toolbar
- One entry per day with autosave
- Calendar view with mood-colored days
- Full-text search (FTS5 with BM25 ranking)
- Entry templates (gratitude, daily review, morning pages, weekly reflection)
- Manual tagging with autocomplete
- Entry version history with diff preview and revert
- Multi-user with separate journals per account
- Dark/light theme
- Markdown export
- Docker deployment with healthchecks

**AI-Powered (configure in Settings):**
- Mood analysis, theme extraction, action items, key people detection
- Auto-tagging from AI-detected themes
- Weekly and monthly AI-generated reflections
- Semantic search via embeddings ("find entries similar to this one")
- Voice-to-text transcription via Whisper

## Tech Stack

- **Framework:** Next.js 15 (App Router, TypeScript)
- **Database:** SQLite via Drizzle ORM + better-sqlite3
- **Auth:** better-auth (credentials, sessions, rate-limited)
- **UI:** Tailwind CSS + shadcn/ui + Radix/Base UI + Lucide icons
- **Editor:** Tiptap with markdown extensions
- **Charts:** Recharts
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

Open http://localhost:3000, register an account, and start journaling.

### Docker

```bash
# Create .env for Docker Compose
cp .env.example .env
# Edit .env — set BETTER_AUTH_SECRET

# Build and run
docker compose up -d
```

The app runs at http://localhost:3000. Data persists in a Docker volume.

## Setting Up AI Services

The app works fully without AI. To enable AI features, configure the endpoints in **Settings** after logging in. Each integration has a **Test** button to verify connectivity.

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
  --n-gpu-layers 99  # Offload all layers to GPU

# 3. In Moirai Settings:
#    Provider: llama-server
#    Endpoint: http://<machine-ip>:8080
#    Click Test to verify
```

For embeddings/semantic search, llama-server serves both chat and embeddings from the same model when started with `--embeddings`. For better results, use a dedicated embedding model:

```bash
# Run a second instance for embeddings
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
# 1. Install Ollama: https://ollama.com
ollama serve
ollama pull llama3.2

# 2. In Moirai Settings:
#    Provider: Ollama
#    Endpoint: http://<machine-ip>:11434
#    Model: llama3.2
```

### LM Studio

```bash
# 1. Download and run LM Studio: https://lmstudio.ai
# 2. Load a model and start the local server (default port 1234)

# 3. In Moirai Settings:
#    Provider: LM Studio
#    Endpoint: http://localhost:1234
```

## Setting Up Voice Transcription (Whisper)

Voice transcription uses [faster-whisper](https://github.com/SYSTRAN/faster-whisper) via a lightweight FastAPI server.

### Running the Whisper sidecar

```bash
# CPU-only
cd whisper-sidecar
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 5000

# With GPU acceleration (NVIDIA)
DEVICE=cuda COMPUTE_TYPE=float16 uvicorn server:app --host 0.0.0.0 --port 5000
```

The first startup downloads the Whisper model (~150MB for `base`). Use `MODEL_SIZE=medium` or `MODEL_SIZE=large-v3` for better accuracy.

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

Go to **Settings > Voice Transcription** and set:
- Endpoint: `http://<machine-ip>:5000`
- Click **Test** to verify

Then use the **Record** button on any entry page to record and transcribe voice notes.

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
    (auth)/          Login, register (no sidebar)
    (app)/           Authenticated pages (with sidebar)
      entry/[date]/  Journal editor with autosave
      calendar/      Monthly calendar view
      search/        Keyword + semantic search
      reflections/   AI-generated weekly/monthly reflections
      settings/      Integration configuration
    api/             API routes (entries, tags, insights, etc.)
  components/
    editor/          Tiptap editor, toolbar, voice recorder, tags, versions
    layout/          Sidebar, header, theme toggle, service status
    entry/           Insights panel, similar entries
    dashboard/       Mood chart, topic cloud, recent entries
    reflections/     Reflection cards, generate dialog
  lib/
    db/              Drizzle schema, SQLite connection, FTS5 migrations
    auth/            better-auth config, session helpers
    ai/              AI client, prompts, extraction, embeddings, reflections
whisper-sidecar/     FastAPI + faster-whisper server
```

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run db:push` | Push schema changes to SQLite |
| `npm run db:generate` | Generate Drizzle migration |
| `npm run db:studio` | Open Drizzle Studio (DB browser) |
| `npm run lint` | Run ESLint |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BETTER_AUTH_SECRET` | Yes | — | Session signing secret (min 32 chars) |
| `BETTER_AUTH_URL` | No | `http://localhost:3000` | App URL (set if behind reverse proxy) |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | No | `http://localhost:3000` | Public app URL |
| `DATABASE_PATH` | No | `./data/moirai.db` | SQLite database path |

AI and Whisper endpoints are configured per-user in the Settings page, not via environment variables.

## License

MIT
