#!/bin/bash

# Step 1: Build WASM file on the host machine
# (requires tree-sitter-cli and emscripten to be installed locally)
echo "Building WASM file locally..."
bun --bun install
bun --bun run build:wasm

# Step 2: Build Docker image if it doesn't exist yet
echo "Building Docker image..."
docker build -t vscode-qml-builder .


# Step 3: Run the build process inside Docker container
# This ensures native modules are compiled for Linux
docker run --rm -v $(pwd):/app -w /app --user $(id -u):$(id -g) vscode-qml-builder bash -c "
  echo '===============================' &&
  echo 'Building inside Docker container' &&
  echo '===============================' &&
  
  
  bun --bun install &&

  echo 'Rebuilding native modules...' &&
  cd node_modules/@vscode/sqlite3 && bunx --bun node-gyp rebuild && cd /app &&
  
  echo 'Packaging VSCode extension...' &&
  bunx --bun @vscode/vsce package --pre-release --allow-missing-repository &&
  
  
  mkdir -p build &&
  mv *.vsix build/ &&
  
  echo '===============================' &&
  echo 'Docker build completed' &&
  echo '==============================='
"

echo ""
echo "✓ Build completed successfully!"
echo "✓ Packaged extension is in the build/ directory."