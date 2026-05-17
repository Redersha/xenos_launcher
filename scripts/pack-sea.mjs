#!/usr/bin/env node
/**
 * Pack the bundled JS into a standalone executable using Node.js SEA (Single Executable Application)
 *
 * Usage:
 *   node scripts/pack-sea.mjs [platform]
 *
 * Platforms: macos-arm64, macos-x64, win-x64, linux-x64, current
 *
 * Prerequisites:
 *   1. Run `npm run bundle` first to generate dist-bundle/xl.js
 *   2. Node.js 20+ with SEA support
 *   3. npx postject available
 *
 * Note: SEA only supports CJS entry. We create a thin CJS wrapper that
 * dynamically imports the ESM bundle at runtime.
 */

import { execSync } from 'child_process';
import { existsSync, copyFileSync, unlinkSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BUNDLE_DIR = join(ROOT, 'dist-bundle');
const BUNDLE_JS = join(BUNDLE_DIR, 'xl.js');
const WASM = join(BUNDLE_DIR, 'yoga.wasm');
const OUT_DIR = join(ROOT, 'dist-pkg');

const platform = process.argv[2] || 'current';

function getArch() { return process.arch; }
function getPlatform() { return process.platform; }

function getExeName(p) {
  const isWin = p.startsWith('win') || (p === 'current' && getPlatform() === 'win32');
  const ext = isWin ? '.exe' : '';
  const names = {
    'macos-arm64': `xl-macos-arm64${ext}`,
    'macos-x64': `xl-macos-x64${ext}`,
    'win-x64': `xl-win-x64${ext}`,
    'linux-x64': `xl-linux-x64${ext}`,
    'current': `xl-${getPlatform()}-${getArch()}${ext}`,
  };
  return names[p] || names['current'];
}

// Check prerequisites
if (!existsSync(BUNDLE_JS)) {
  console.error('❌ Bundle not found. Run `npm run bundle` first.');
  process.exit(1);
}
if (!existsSync(WASM)) {
  console.error('❌ yoga.wasm not found. Run `npm run bundle` first.');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const exeName = getExeName(platform);
const exePath = join(OUT_DIR, exeName);

console.log(`\n🔨 Building SEA executable: ${exeName}\n`);

// Step 1: Create CJS entry wrapper
// SEA requires CJS entry point; we create a thin wrapper that loads the ESM bundle
const entryContent = `
"use strict";
const { existsSync, writeFileSync, mkdirSync } = require('fs');
const { join, dirname } = require('path');
const { tmpdir } = require('os');

// Extract embedded assets to a temp dir so they can be loaded at runtime
let bundleDir = dirname(process.execPath);
try {
  const sea = require('node:sea');
  if (sea.isSea()) {
    const tmpBase = join(tmpdir(), 'xenos-launcher');
    mkdirSync(tmpBase, { recursive: true });
    for (const name of ['xl.js', 'yoga.wasm']) {
      const assetPath = join(tmpBase, name);
      try {
        const data = sea.getAsset(name, 'utf-8');
        writeFileSync(assetPath, data);
      } catch (e) {
        // Asset might not exist or already extracted
        if (!existsSync(assetPath)) {
          console.error('Failed to extract asset:', name, e.message);
        }
      }
    }
    bundleDir = tmpBase;
  }
} catch (e) {
  // Not running as SEA or node:sea not available, use local files
}

const bundlePath = join(bundleDir, 'xl.js');
if (!existsSync(bundlePath)) {
  console.error('Bundle not found at:', bundlePath);
  process.exit(1);
}
import(bundlePath).catch(err => {
  console.error('Failed to load bundle:', err);
  process.exit(1);
});
`;
const entryPath = join(BUNDLE_DIR, 'sea-entry.cjs');
writeFileSync(entryPath, entryContent);
console.log('✅ Step 1: CJS entry wrapper created');

// Step 2: Create SEA config
const seaConfigPath = join(BUNDLE_DIR, 'sea-config.json');
const seaConfig = {
  main: entryPath,
  output: join(BUNDLE_DIR, 'sea-prep.blob'),
  disableExperimentalSEAWarning: true,
  useCodeCache: false,
  useSnapshot: false,
  assets: {
    'yoga.wasm': WASM,
    'xl.js': BUNDLE_JS,
  },
};
writeFileSync(seaConfigPath, JSON.stringify(seaConfig, null, 2));
console.log('✅ Step 2: SEA config written');

// Step 3: Generate blob
console.log('📦 Step 3: Generating SEA blob...');
try {
  execSync(`node --experimental-sea-config "${seaConfigPath}"`, { stdio: 'inherit', cwd: ROOT });
} catch (e) {
  console.error('❌ Failed to generate SEA blob');
  process.exit(1);
}

// Step 4: Copy Node binary
console.log('📋 Step 4: Copying Node.js binary...');
copyFileSync(process.execPath, exePath);

// Step 4b: On macOS, strip to single architecture if Universal Binary
if (process.platform === 'darwin') {
  try {
    const lipoInfo = execSync(`lipo -info "${exePath}" 2>&1`).toString();
    if (lipoInfo.includes('arm64') && lipoInfo.includes('x86_64')) {
      const arch = platform === 'macos-x64' ? 'x86_64' : 'arm64';
      console.log(`🔍 Stripping Universal Binary to ${arch}...`);
      const thinPath = exePath + '.thin';
      execSync(`lipo -extract ${arch} "${exePath}" -output "${thinPath}"`, { stdio: 'inherit' });
      unlinkSync(exePath);
      copyFileSync(thinPath, exePath);
      unlinkSync(thinPath);
    }
  } catch (e) {
    console.warn('⚠️  lipo strip failed, continuing with original binary...');
  }
}

// Step 5: Remove signature (macOS)
if (process.platform === 'darwin') {
  console.log('🔓 Step 5: Removing code signature (macOS)...');
  try {
    execSync(`codesign --remove-signature "${exePath}"`, { stdio: 'inherit' });
  } catch (e) {
    console.warn('⚠️  codesign --remove-signature failed, continuing...');
  }
} else {
  console.log('📋 Step 5: (not needed on this platform)');
}

// Step 6: Inject blob
console.log('💉 Step 6: Injecting SEA blob...');
const blobPath = join(BUNDLE_DIR, 'sea-prep.blob');
try {
  execSync(`npx postject "${exePath}" NODE_SEA_BLOB "${blobPath}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`, {
    stdio: 'inherit',
    cwd: ROOT,
  });
} catch (e) {
  console.error('❌ postject failed. Install it with: npm install -g postject');
  console.error('   Or try: npx postject --help');
  process.exit(1);
}

// Step 7: Set permissions
if (process.platform !== 'win32') {
  console.log('🔑 Step 7: Setting executable permissions...');
  try {
    execSync(`chmod +x "${exePath}"`, { stdio: 'inherit' });
  } catch (e) { /* ignore */ }
}

// Step 8: Re-sign (macOS ad-hoc)
if (process.platform === 'darwin') {
  console.log('✍️  Step 8: Ad-hoc code signing (macOS)...');
  try {
    execSync(`codesign --sign - "${exePath}"`, { stdio: 'inherit' });
  } catch (e) {
    console.warn('⚠️  Ad-hoc signing failed. Binary may show security warning on first run.');
    console.warn('   Run: xattr -cr <executable> to bypass Gatekeeper.');
  }
}

// Cleanup temp files
for (const f of [seaConfigPath, entryPath, blobPath]) {
  try { unlinkSync(f); } catch {}
}

console.log(`\n✅ Done! Executable: ${exePath}`);
console.log(`   Size: ${(readFileSync(exePath).length / 1024 / 1024).toFixed(1)} MB`);
