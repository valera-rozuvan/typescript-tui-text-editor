// scripts/clean.mjs — cross-platform replacement for rm -rf in the clean script
import { rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const targets = [
  'dist',
  'unit-tests/dist',
  'ui-tests/dist',
  'ui-tests/pty/build',
  'docker-logs',
  'node_modules',
];

for (const rel of targets) {
  const p = join(root, rel);
  if (existsSync(p)) {
    rmSync(p, { recursive: true, force: true });
    console.log(`removed ${rel}`);
  }
}
