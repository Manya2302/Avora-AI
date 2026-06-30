#!/bin/bash
set -e
echo "🔧 Running migrations..."
python manage.py migrate
echo "📦 Collecting static files..."
python manage.py collectstatic --noinput
echo "🤖 Pulling Orivo AI model (nomic-embed-text)..."
curl -s http://ollama:11434/api/pull -d '{"name":"nomic-embed-text"}' || echo "⚠️  Ollama not ready yet — pull model manually"
echo "✅ Setup complete. SecureVault AI is ready."
