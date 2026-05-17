#!/usr/bin/env node
/**
 * Pack the bundled JS into a distributable package for the target platform.
 *
 * Output structure:
 *   terminal-craft-launcher/
 *   ├── tcl          (launcher shell script / .cmd for Windows)
 *   ├── tcl.js       (bundled app)
 *   ├── yoga.wasm    (Ink layout engine WASM)
 *   └── node         (Node.js binary)
 *
 * Usage:
 *   node scripts/pack-dist.mjs [platform]
 *
 * Platforms: macos-arm64, macos-x64, win-x64, linux-x64, current
 *
 * Prerequisites:
 *   1. Run `npm run bundle` first
 */

import { execSync } from 'child_process';
import { existsSync, copyFileSync, unlinkSync, writeFileSync, mkdirSync, rmSync, renameSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BUNDLE_DIR = join(ROOT, 'dist-bundle');
const BUNDLE_JS = join(BUNDLE_DIR, 'tcl.js');
const WASM = join(BUNDLE_DIR, 'yoga.wasm');
const OUT_DIR = join(ROOT, 'dist-pkg');

const platform = process.argv[2] || 'current';

function getArch() { return process.arch; }
function getPlatform() { return process.platform; }

function getTargetInfo(p) {
  const map = {
    'macos-arm64': { os: 'darwin', arch: 'arm64' },
    'macos-x64': { os: 'darwin', arch: 'x64' },
    'win-x64': { os: 'win32', arch: 'x64' },
    'linux-x64': { os: 'linux', arch: 'x64' },
    'current': { os: getPlatform(), arch: getArch() },
  };
  return map[p] || map['current'];
}

function getDirName(p) {
  const info = getTargetInfo(p);
  const osName = info.os === 'darwin' ? 'macos' : info.os === 'win32' ? 'windows' : 'linux';
  const archName = info.arch;
  return `terminal-craft-launcher-${osName}-${archName}`;
}

function getArchiveExt(p) {
  const info = getTargetInfo(p);
  return info.os === 'win32' ? '.zip' : '.tar.gz';
}

// Cross-platform directory size calculation
function getDirSize(dir) {
  let size = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      size += getDirSize(full);
    } else {
      size += statSync(full).size;
    }
  }
  return size;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
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

const targetInfo = getTargetInfo(platform);
const dirName = getDirName(platform);
const pkgDir = join(OUT_DIR, dirName);

console.log(`\n📦 Building distributable package: ${dirName}\n`);
console.log(`   Target: ${targetInfo.os}/${targetInfo.arch}`);

// Cross-compile warning
if (targetInfo.os !== getPlatform()) {
  console.log(`\n⚠️  Cross-platform build detected.`);
  console.log(`   The embedded Node.js binary will be from the current system (${getPlatform()}/${getArch()}).`);
  console.log(`   For proper cross-platform builds, provide the correct Node.js binary manually.\n`);
}

// Create package directory
if (existsSync(pkgDir)) rmSync(pkgDir, { recursive: true });
mkdirSync(pkgDir, { recursive: true });

// Step 1: Copy bundle files
console.log('📋 Step 1: Copying bundle files...');
copyFileSync(BUNDLE_JS, join(pkgDir, 'tcl.js'));
copyFileSync(WASM, join(pkgDir, 'yoga.wasm'));

// Step 2: Copy Node.js binary
console.log('📋 Step 2: Copying Node.js binary...');
let nodeBinaryName;
if (targetInfo.os === 'win32') {
  nodeBinaryName = 'node.exe';
} else {
  nodeBinaryName = 'node';
}
const nodeDest = join(pkgDir, nodeBinaryName);
copyFileSync(process.execPath, nodeDest);

// On macOS, strip to single architecture if needed
if (targetInfo.os === 'darwin') {
  try {
    const lipoInfo = execSync(`lipo -info "${nodeDest}" 2>&1`).toString();
    if (lipoInfo.includes('arm64') && lipoInfo.includes('x86_64')) {
      const arch = targetInfo.arch === 'x64' ? 'x86_64' : 'arm64';
      console.log(`   Stripping Universal Binary to ${arch}...`);
      const thinPath = nodeDest + '.thin';
      execSync(`lipo -extract ${arch} "${nodeDest}" -output "${thinPath}"`, { stdio: 'pipe' });
      unlinkSync(nodeDest);
      renameSync(thinPath, nodeDest);
    }
  } catch (e) {
    console.warn('   ⚠️  Could not strip binary architecture');
  }
}

// Step 3: Create launcher script
console.log('📋 Step 3: Creating launcher script...');
if (targetInfo.os === 'win32') {
  // Windows .cmd launcher
  const cmdContent = `@echo off
"%~dp0node.exe" "%~dp0tcl.js" %*
`;
  writeFileSync(join(pkgDir, 'tcl.cmd'), cmdContent);
} else {
  // Unix shell launcher
  const shContent = `#!/bin/sh
DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/node" "$DIR/tcl.js" "$@"
`;
  const launcherPath = join(pkgDir, 'tcl');
  writeFileSync(launcherPath, shContent);
  execSync(`chmod +x "${launcherPath}"`);
  execSync(`chmod +x "${nodeDest}"`);
}

// Step 4: Create archive
console.log('📦 Step 4: Creating archive...');
const archiveExt = getArchiveExt(platform);
const archiveName = dirName + archiveExt;
const archivePath = join(OUT_DIR, archiveName);

if (existsSync(archivePath)) unlinkSync(archivePath);

if (targetInfo.os === 'win32') {
  // Use PowerShell to create zip (available on all Windows runners)
  const psCmd = `Compress-Archive -Path '${pkgDir}\\*' -DestinationPath '${archivePath}' -Force`;
  try {
    execSync(`powershell -Command "${psCmd}"`, { stdio: 'inherit' });
  } catch (e) {
    console.error('❌ PowerShell zip failed. The unpacked directory is still available.');
  }
} else {
  // Create tar.gz
  try {
    execSync(`cd "${OUT_DIR}" && tar -czf "${archiveName}" "${dirName}/"`, { stdio: 'inherit' });
  } catch (e) {
    console.error('❌ tar failed.');
  }
}

// Summary
console.log(`\n✅ Done!`);
console.log(`   Package directory: ${pkgDir}`);
console.log(`   Archive: ${archivePath}`);

// Calculate sizes cross-platform
const pkgSize = getDirSize(pkgDir);
console.log(`   Package size: ${formatBytes(pkgSize)}`);
if (existsSync(archivePath)) {
  const archiveSize = statSync(archivePath).size;
  console.log(`   Archive size: ${formatBytes(archiveSize)}`);
}

console.log(`\n   Usage:`);
if (targetInfo.os === 'win32') {
  console.log(`   - Extract the archive`);
  console.log(`   - Run: tcl.cmd`);
} else {
  console.log(`   - Extract the archive`);
  console.log(`   - Run: ./tcl`);
}
