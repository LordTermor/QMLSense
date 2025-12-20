#!/bin/bash
set -euo pipefail

echo "Building WASM file locally..."
npm install
npm run build:wasm

echo "Building Docker image..."
docker build -t vscode-qml-builder .

echo "Running build inside Docker container..."
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$(pwd)":/app \
  -w /app \
  -e HOME=/tmp \
  vscode-qml-builder bash -c '
  set -euo pipefail
  echo "==============================="
  echo "Building inside Docker container"
  echo "==============================="
  
  npm install
  
  echo "Rebuilding native modules..."
  npm rebuild --build-from-source @vscode/sqlite3
  echo "Packaging VSCode extension..."
  npx @vscode/vsce package --pre-release --allow-missing-repository
  mkdir -p build
  mv *.vsix build/
  
  echo "==============================="
  echo "Docker build completed"
  echo "==============================="
'

echo ""
echo "✓ Build completed successfully!"
echo "✓ Packaged extension is in the build/ directory."
