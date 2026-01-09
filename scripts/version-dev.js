#!/usr/bin/env node

/**
Generates dev version from git tags for extension builds.
Format: x.y.z-dev.n (e.g., 0.3.4-dev.5 = 5 commits after v0.3.4 tag)
Valid semver pre-release format for local builds and vsce packaging.
*/

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

try {
  const gitDescribe = execSync('git describe --tags --long --always', { encoding: 'utf8' }).trim();
  
  const match = gitDescribe.match(/^v?([0-9.]+)-(\d+)-g[a-f0-9]+$/);
  if (match) {
    const [, baseVersion, commitCount] = match;
    if (commitCount === '0') {
      pkg.version = baseVersion;
    } else {
      pkg.version = `${baseVersion}-dev.${commitCount}`;
    }
  } else {
    const timestamp = Math.floor(Date.now() / 1000);
    pkg.version = `0.0.0-dev.${timestamp}`;
  }
} catch (error) {
  const timestamp = Math.floor(Date.now() / 1000);
  pkg.version = `0.0.0-dev.${timestamp}`;
}

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`Version updated to ${pkg.version}`);
