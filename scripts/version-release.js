#!/usr/bin/env node

/**
 * Generates release version from git tags for extension builds.
 * Format: 
 *   - Stable: v0.3.0 → 0.3.0
 *   - Pre-release: v0.3.0-pre, v0.3.0-beta, v0.3.0-rc.1 → 0.3.0-pre, 0.3.0-beta, 0.3.0-rc.1
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

try {
  const gitDescribe = execSync('git describe --tags --exact-match', { encoding: 'utf8' }).trim();
  pkg.version = gitDescribe.replace(/^v/, '');
  
  const isPreRelease = pkg.version.includes('-');
  console.log(`${isPreRelease ? 'Pre-release' : 'Stable'} version: ${pkg.version}`);
} catch (error) {
  console.error('ERROR: Not on a tagged commit. Release builds require a git tag.');
  process.exit(1);
}

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`Version updated to ${pkg.version}`);
