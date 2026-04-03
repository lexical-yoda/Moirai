<p align="center">
  <h1 align="center">Moirai</h1>
  <p align="center">A local-first, privacy-focused journaling app with AI-powered insights</p>
  <p align="center">
    <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js" />
    <img src="https://img.shields.io/badge/SQLite-local--first-blue?logo=sqlite" alt="SQLite" />
    <img src="https://img.shields.io/badge/PWA-installable-purple" alt="PWA" />
    <img src="https://img.shields.io/badge/Docker-ready-2496ED?logo=docker" alt="Docker" />
    <img src="https://img.shields.io/badge/License-MIT-green" alt="License" />
  </p>
</p>

---

Your journal. Your data. Your machine.

Moirai is a self-hosted journal that works completely offline. AI features like mood analysis, voice transcription, and semantic search are optional — plug in your own LLM and Whisper server when you're ready, or just write.

---

## Features

<table>
<tr>
<td width="50%">

**Journaling**
- Rich markdown editor with formatting toolbar
- Search & replace (Ctrl+F / Ctrl+H)
- Live updates — content, recordings, and insights refresh automatically as background processing completes
- One entry per day with autosave
- Raw & AI-formatted content views
- Auto-generated titles
- Entry templates (gratitude, daily review, morning pages)
- Bi-directional entry linking
- Version history with preview & revert
- Manual + AI-powered tagging (themes, people, events, places)

</td>
<td width="50%">

**Voice**
- Record, pause, resume voice notes
- Persistent recordings with playback
- Upload existing audio files
- Download recordings
- Multiple recordings per entry
- Auto-transcription via Whisper (background pipeline)
- LLM-powered transcription cleanup (fixes homophones using context)
- Re-transcribe recordings with one click
- Multi-file upload (sorted by creation date)

</td>
</tr>
<tr>
<td>

**Dashboard & Search**
- Mood heatmap (GitHub-style year grid)
- Mood trend chart & topic cloud
- Streak counter & writing stats
- Full-text search (FTS5 + BM25)
- Semantic search ("find similar entries")
- Markdown journal export

</td>
<td>

**AI Insights** *(optional)*
- Background processing pipeline with notification bell
- Mood analysis & scoring
- Theme, people, event, and place extraction
- People identity mapping (aliases resolve to canonical names)
- Auto-formatted content & generated titles
- Action items detection
- Weekly & monthly reflections
- Works with llama.cpp, Ollama, LM Studio, or any OpenAI-compatible API

</td>
</tr>
<tr>
<td>

**Therapy Tracking** *(optional)*
- AI scans journal entries for therapy-worthy topics automatically
- Inline therapy items on each entry page (edit, add, delete)
- Session day toggle — shows agenda of pending items + captures takeaways
- Dedicated /therapy page (Pending / Discussed / Resolved / Takeaways)
- Backfill past entries when enabling therapy
- Calendar indicators for session days

</td>
<td>

**Themes & Mobile**
- 7 color palettes: GitHub, Indigo, Nord, Emerald, Rose, Amber, Ocean
- Dark & light mode
- PWA — installable on phone & desktop
- Bottom tab navigation on mobile
- Responsive across all screen sizes

</td>
</tr>
<tr>
<td>

**Admin & Security**
- Multi-user with separate journals
- First user becomes admin
- Registration lockdown (admin toggle)
- Rate-limited authentication
- Encrypted sessions & secure cookies
- Input validation on every endpoint

</td>
<td>

**Activity Tracking**
- Track daily habits and activities
- Manual toggle or AI auto-detection from entries
- Monthly activity grid on dashboard
- Good/bad activity types with emoji

</td>
</tr>
</table>

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, TypeScript, Turbopack) |
| Database | SQLite via Drizzle ORM + better-sqlite3 |
| Auth | better-auth (credentials, sessions, admin roles) |
| UI | Tailwind CSS v4 + shadcn/ui (Base UI) + Lucide |
| Editor | Tiptap (task lists, highlights, code blocks, search & replace) |
| Charts | Recharts + custom SVG heatmap |
| Fonts | Syne (display) + DM Mono (monospace) |
| AI | Any OpenAI-compatible API |
| Voice | faster-whisper (auto-detects API format) |

---

## Quick Start

### Local Development

```bash
npm install
cp .env.example .env.local
# Set BETTER_AUTH_SECRET (generate with: openssl rand -hex 32)
npm run db:push
npm run dev
```

Open `http://localhost:3000`. First account becomes admin.

### Docker

```bash
echo "BETTER_AUTH_SECRET=$(openssl rand -hex 32)" > .env
docker compose up -d
```

App runs at `http://localhost:3500`. Database auto-initializes on first boot.

### Behind a Reverse Proxy (nginx)

```env
BETTER_AUTH_SECRET=<your-secret>
BETTER_AUTH_URL=https://moirai.yourdomain.com
```

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
        proxy_read_timeout 300s;
    }
}
```

---

## Setting Up AI

> The app works fully without AI. Configure endpoints in **Settings** after logging in. Each has a **Test** button.

### llama.cpp *(recommended)*

Download a GGUF model and place it in a models directory. A 3B model is recommended — handles all Moirai tasks and leaves VRAM for other services.

```yaml
services:
  llama-cpp:
    image: ghcr.io/ggml-org/llama.cpp:server-cuda
    ports:
      - "8080:8080"
    volumes:
      - /path/to/models:/models
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    command: >
      -m /models/Llama-3.2-3B-Instruct-Q4_K_M.gguf
      --host 0.0.0.0 --port 8080 --embeddings -ngl 99 -c 8192
    restart: unless-stopped
```

Settings: Provider `llama-server`, Endpoint `http://<ip>:8080`

> The `--embeddings` flag enables semantic search — search by meaning, not just keywords. Leave the Embeddings section in Settings empty; it uses the AI endpoint automatically.

For CPU-only: use image `ghcr.io/ggml-org/llama.cpp:server` and remove the `deploy` block.

### Ollama

```yaml
services:
  ollama:
    image: ollama/ollama:latest
    ports: ["11434:11434"]
    volumes: [ollama-data:/root/.ollama]
    restart: unless-stopped
volumes:
  ollama-data:
```

```bash
docker compose up -d && docker exec ollama ollama pull llama3.2
```

Settings: Provider `Ollama`, Endpoint `http://<ip>:11434`, Model `llama3.2`

### LM Studio

Download [LM Studio](https://lmstudio.ai), load a model, start the local server.

Settings: Provider `LM Studio`, Endpoint `http://<ip>:1234`

---

## Setting Up Voice Transcription

Recordings are saved persistently and can be replayed, downloaded, or uploaded. Moirai auto-detects the Whisper API format.

### Docker Compose

Using [whisper-asr-webservice](https://github.com/ahmetoner/whisper-asr-webservice):

```yaml
services:
  whisper:
    image: onerahmet/openai-whisper-asr-webservice:latest
    ports:
      - "5000:9000"
    environment:
      - ASR_MODEL=large-v3-turbo
      - ASR_ENGINE=faster_whisper
    restart: unless-stopped
```

> **Recommended:** Run Whisper on CPU and dedicate GPU to llama.cpp. The LLM transcription cleanup step corrects accuracy issues from CPU inference. For GPU Whisper, use image tag `latest-gpu` — requires matching CUDA version with your driver.

Settings: Endpoint `http://<ip>:5000`

### Whisper Model Sizes

| Model | Size | Accuracy | Notes |
|-------|------|----------|-------|
| `tiny` | ~75MB | Basic | Fastest, good for testing |
| `base` | ~150MB | Decent | Good for short notes |
| `small` | ~500MB | Good | Best bang for buck |
| `medium` | ~1.5GB | Very good | For longer recordings |
| `large-v3-turbo` | ~1.5GB | Excellent | Best speed/accuracy tradeoff (recommended) |
| `large-v3` | ~3GB | Best | Most accurate, needs GPU |

> Moirai also runs an LLM pass after transcription to fix contextual errors (homophones, names) using your personal context (known people, activities). This works with any Whisper model size.

---

## Recommended AI Models

| Use Case | Model | Size |
|----------|-------|------|
| Lightweight (recommended) | Qwen 2.5 3B Instruct (Q4_K_M) | ~2GB |
| Lightweight alt | Llama 3.2 3B Instruct (Q4_K_M) | ~2GB |
| Higher quality | Llama 3.1 8B Instruct (Q4_K_M) | ~4.6GB |
| Structured output | Qwen 2.5 7B Instruct (Q4_K_M) | ~4.4GB |
| Dedicated embeddings | nomic-embed-text v1.5 | ~270MB |

> 3B models handle all Moirai tasks well (mood extraction, formatting, therapy topics are all structured JSON). 8B models are better but slower — overkill for most journaling use cases.

---

## Project Structure

```
src/
  app/
    (auth)/              Login & register (with theme picker)
    (app)/               Authenticated pages (sidebar + bottom nav)
      entry/[date]/      Journal editor (raw/formatted, therapy items, recordings)
      calendar/          Monthly calendar with session day indicators
      search/            Keyword + semantic search
      therapy/           Therapy items management
      reflections/       AI reflections
      settings/          Integrations, activities, people, therapy toggle, admin
    api/                 40+ API routes
  components/
    editor/              Editor, toolbar, search & replace, voice recorder, tags, versions, templates
    layout/              Sidebar, bottom nav, header, theme picker, processing bell
    entry/               Insights, similar entries, recordings, entry links, activities, therapy items
    dashboard/           Mood chart, heatmap, topics, activity grid, recent entries
    reflections/         Cards, generate dialog
  lib/
    db/                  Schema (20 tables), auto-migrating connection, FTS5
    auth/                better-auth config, admin/registration helpers
    ai/                  Configurable client, prompts, extraction, embeddings, reflections
    processing/          Background task queue (transcription, formatting, insights, therapy)
whisper-sidecar/         FastAPI + faster-whisper server
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BETTER_AUTH_SECRET` | Yes | — | Session signing secret |
| `BETTER_AUTH_URL` | No | `http://localhost:3000` | App URL (for reverse proxy) |
| `DATABASE_PATH` | No | `./data/moirai.db` | SQLite database path |

AI, embeddings, and Whisper endpoints are configured per-user in Settings.

---

## NPM Scripts

```bash
npm run dev          # Development server
npm run build        # Production build
npm run start        # Production server
npm run db:push      # Push schema to SQLite
npm run db:studio    # Open Drizzle Studio (DB browser)
npm run lint         # ESLint
```

---

## License

MIT
