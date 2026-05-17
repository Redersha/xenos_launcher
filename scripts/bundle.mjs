#!/usr/bin/env node
import { copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const banner = {
  js: [
    'import{createRequire}from"module";',
    'import{fileURLToPath as __fileURLToPath}from"url";',
    'import{dirname as __dirname2}from"path";',
    'const require=createRequire(import.meta.url);',
    'const __filename=__fileURLToPath(import.meta.url);',
    'const __dirname=__dirname2(__filename);',
  ].join(''),
};

console.log('📦 Bundling with esbuild...');
await build({
  entryPoints: [join(ROOT, 'src', 'index.tsx')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: join(ROOT, 'dist-bundle', 'xl.js'),
  format: 'esm',
  alias: { 'react-devtools-core': './shims/react-devtools-core.js' },
  packages: 'bundle',
  banner,
});

console.log('📋 Copying yoga.wasm...');
copyFileSync(
  join(ROOT, 'node_modules', 'yoga-wasm-web', 'dist', 'yoga.wasm'),
  join(ROOT, 'dist-bundle', 'yoga.wasm')
);

console.log('✅ Bundle complete!');
