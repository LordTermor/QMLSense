#!/usr/bin/env node

/**
 * Generates release version from git tags for extension builds.
 * Format: x.y.z (e.g., v0.3.4 → 0.3.4)
 * Must be on an exact tag (no commits after tag).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

try {
  const gitDescribe = execSync('git describe --tags --exact-match', { encoding: 'utf8' }).trim();
  const version = gitDescribe.replace(/^v/, '');
  
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`ERROR: Tag '${gitDescribe}' must be X.Y.Z format (e.g., v0.3.4).`);
    process.exit(1);
  }
  
  pkg.version = version;
  console.log(`Release version: ${pkg.version}`);
} catch (error) {
  console.error('ERROR: Not on a tagged commit. Release builds require a git tag.');
  process.exit(1);
}

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`Version updated to ${pkg.version}`);
