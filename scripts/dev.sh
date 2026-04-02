#!/usr/bin/env bash
set -euo pipefail

echo "=== Moirai Dev ==="
echo ""

# Check if docker compose is available
if command -v docker &> /dev/null && docker compose version &> /dev/null; then
  echo "Starting with Docker Compose..."
  echo "  App:     http://localhost:3000"
  echo "  Whisper: http://localhost:5000"
  echo ""
  echo "To also start llama-server: docker compose --profile ai up"
  echo ""
  docker compose up --build
else
  echo "Docker not found. Starting Next.js dev server only..."
  echo "  App: http://localhost:3000"
  echo ""
  echo "Start Whisper separately: cd whisper-sidecar && uvicorn server:app --port 5000"
  echo ""
  npm run dev
fi
