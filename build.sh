#!/bin/bash
set -euo pipefail

# Parse arguments
BUILD_TYPE="pre-release"
if [[ "${1:-}" == "--release" ]]; then
  BUILD_TYPE="release"
  echo "Building RELEASE version..."
else
  echo "Building PRE-RELEASE version (use --release for release build)..."
fi

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
  -e BUILD_TYPE="$BUILD_TYPE" \
  vscode-qml-builder bash -c '
  set -euo pipefail
  
  # Fix Git ownership for Docker
  git config --global --add safe.directory /app
  
  echo "==============================="
  echo "Building inside Docker container"
  echo "==============================="
  
  npm install
  
  echo "Rebuilding native modules..."
  npm rebuild --build-from-source @vscode/sqlite3
  echo "Packaging VSCode extension..."
  if [[ "$BUILD_TYPE" == "release" ]]; then
    npx @vscode/vsce package --allow-missing-repository
  else
    npx @vscode/vsce package --pre-release --allow-missing-repository
  fi
  mkdir -p build
  mv *.vsix build/
  
  echo "==============================="
  echo "Docker build completed"
  echo "==============================="
'

echo ""
echo "✓ Build completed successfully!"
echo "✓ Packaged extension is in the build/ directory."
