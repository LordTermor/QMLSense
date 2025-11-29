#!/bin/bash
set -euo pipefail

echo "Building WASM file locally..."
bun --bun install
bun --bun run build:wasm

echo "Building Docker image..."
docker build -t vscode-qml-builder .

echo "Running build inside Docker container..."
docker run --rm -v "$(pwd)":/app -w /app --user "$(id -u):$(id -g)" vscode-qml-builder bash -c '
  set -euo pipefail
  echo "==============================="
  echo "Building inside Docker container"
  echo "==============================="
  bun --bun install
  echo "Rebuilding native modules..."
  cd node_modules/@vscode/sqlite3 && bunx --bun node-gyp rebuild && cd /app
  echo "Packaging VSCode extension..."
  bunx --bun @vscode/vsce package --pre-release --allow-missing-repository
  mkdir -p build
  mv *.vsix build/
  echo "==============================="
  echo "Docker build completed"
  echo "==============================="
'

echo ""
echo "✓ Build completed successfully!"
echo "✓ Packaged extension is in the build/ directory."