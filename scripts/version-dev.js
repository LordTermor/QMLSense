#!/usr/bin/env node

/**
Generates dev version from git tags for extension builds.
Format: baseVersion-dev.commitCount.hash (e.g., 0.2.0-dev.5.a1b2c3d)
*/

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

try {
  const gitDescribe = execSync('git describe --tags --always --dirty', { encoding: 'utf8' }).trim();
  
  if (gitDescribe.includes('-')) {
    const match = gitDescribe.match(/^v?(.+?)-(\d+)-g([a-f0-9]+)(-dirty)?$/);
    if (match) {
      const [, baseVersion, commitCount, shortHash, dirty] = match;
      pkg.version = `${baseVersion}-dev.${commitCount}.${shortHash}${dirty || ''}`;
    } else {
      pkg.version = `${gitDescribe.replace(/^v/, '')}-dev.${Date.now()}`;
    }
  } else {
    pkg.version = gitDescribe.replace(/^v/, '').replace(/-dirty$/, '-dev');
  }
} catch (error) {
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0')
  ].join('');
  pkg.version = `0.2.0-dev.${timestamp}`;
}

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`Version updated to ${pkg.version}`);
