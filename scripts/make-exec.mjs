// scripts/make-exec.mjs — cross-platform replacement for make-exec.sh
import { readFileSync, writeFileSync, chmodSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(root, 'dist', 'index.js');
const shebang = '#!/usr/bin/env node\n';

if (!existsSync(target)) {
  console.error(`Error: ${target} not found. Run 'npm run build' first.`);
  process.exit(1);
}

const content = readFileSync(target, 'utf8');
if (!content.startsWith(shebang)) {
  writeFileSync(target, shebang + content, 'utf8');
}

if (process.platform === 'win32') {
  // On Windows, .js files open in a GUI editor by default. Create a .cmd
  // wrapper so `dist\index.cmd` (or just `index` on PATH) invokes Node.js.
  const cmdPath = join(root, 'dist', 'index.cmd');
  writeFileSync(cmdPath, '@echo off\r\nnode "%~dp0index.js" %*\r\n', 'utf8');
  console.log(`Created ${cmdPath}`);
} else {
  chmodSync(target, 0o755);
}
