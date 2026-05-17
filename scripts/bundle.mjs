#!/usr/bin/env node
import { execFileSync } from 'child_process';
import { copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const banner = [
  'import{createRequire}from"module";',
  'import{fileURLToPath as __fileURLToPath}from"url";',
  'import{dirname as __dirname2}from"path";',
  'const require=createRequire(import.meta.url);',
  'const __filename=__fileURLToPath(import.meta.url);',
  'const __dirname=__dirname2(__filename);',
].join('');

const esbuildBin = join(ROOT, 'node_modules', 'esbuild', 'bin', 'esbuild');
const args = [
  join(ROOT, 'src', 'index.tsx'),
  '--bundle',
  '--platform=node',
  '--target=node20',
  `--outfile=${join(ROOT, 'dist-bundle', 'tcl.js')}`,
  '--format=esm',
  '--alias:react-devtools-core=./shims/react-devtools-core.js',
  '--packages=bundle',
  `--banner:js=${banner}`,
];

console.log('📦 Bundling with esbuild...');
execFileSync(esbuildBin, args, { stdio: 'inherit' });

console.log('📋 Copying yoga.wasm...');
copyFileSync(
  join(ROOT, 'node_modules', 'yoga-wasm-web', 'dist', 'yoga.wasm'),
  join(ROOT, 'dist-bundle', 'yoga.wasm')
);

console.log('✅ Bundle complete!');
