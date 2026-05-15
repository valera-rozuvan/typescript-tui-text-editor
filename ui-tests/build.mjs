// ui-tests/build.mjs — cross-platform replacement for build.sh
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = dirname(fileURLToPath(import.meta.url));
const ptyDir = join(root, 'pty');

console.log('Building N-API PTY addon ...');
execSync('npx node-gyp rebuild', { cwd: ptyDir, stdio: 'inherit' });
console.log(`  → built: ${join(ptyDir, 'build', 'Release', 'pty_native.node')}`);

console.log('Compiling TypeScript tests ...');
execSync('npx tsc -p tsconfig.json', { cwd: root, stdio: 'inherit' });
console.log(`  → compiled to: ${join(root, 'dist', '')}`);

console.log('\nBuild complete.  Run tests with:');
console.log('  node ui-tests/runner.mjs --no-build');
console.log('or simply:');
console.log('  node ui-tests/runner.mjs');
