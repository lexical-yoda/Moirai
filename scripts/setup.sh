#!/usr/bin/env bash
set -euo pipefail

echo "=== Moirai Setup ==="
echo ""

# Check for .env.local
if [ ! -f ".env.local" ]; then
  echo "Creating .env.local from .env.example..."
  cp .env.example .env.local

  # Generate a random secret
  SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n')
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/generate-a-random-secret-here/$SECRET/" .env.local
  else
    sed -i "s/generate-a-random-secret-here/$SECRET/" .env.local
  fi
  echo "Generated BETTER_AUTH_SECRET in .env.local"
else
  echo ".env.local already exists, skipping."
fi

echo ""

# Install dependencies
echo "Installing dependencies..."
npm install

# Create data directory
mkdir -p data

# Push database schema
echo "Initializing database..."
npx drizzle-kit push

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Start the dev server:  npm run dev"
echo "Or use Docker:         docker compose up"
echo ""
echo "Optional services:"
echo "  Whisper sidecar:     cd whisper-sidecar && pip install -r requirements.txt && uvicorn server:app --port 5000"
echo "  llama-server:        llama-server -m model.gguf --port 8080 --embeddings"
echo ""
