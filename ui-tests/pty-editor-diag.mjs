// Diagnostic: spawn the actual editor via ConPTY and log how many bytes come
// through the pipe in the first few seconds.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const _require = createRequire(import.meta.url);
const _dirname = dirname(fileURLToPath(import.meta.url));
const native = _require(join(_dirname, 'pty/build/Release/pty_native.node'));

const node = process.execPath;
const editor = join(_dirname, '../dist/index.js');

if (!existsSync(editor)) {
  console.error('Editor not found at', editor, '— run npm run build first');
  process.exit(1);
}

console.log('Spawning editor:', node, editor);
const { fd, pid } = native.spawn(node, [editor], 120, 30);
console.log('Spawned: fd=%d pid=%d', fd, pid);

let totalBytes = 0;
let chunks = 0;
let allData = '';

// Read for 3 seconds
const start = Date.now();
while (Date.now() - start < 3000) {
  const c = native.read(fd);
  if (c) {
    totalBytes += c.length;
    chunks++;
    allData += c.toString('utf8');
    if (chunks <= 5) {
      process.stdout.write('  chunk ' + chunks + ': ' + c.length + ' bytes\n');
    }
  }
  await new Promise(r => setTimeout(r, 10));
}

// Send Ctrl+Q to quit
native.write(fd, Buffer.from('\x11', 'utf8'));
await new Promise(r => setTimeout(r, 500));
native.close(fd);

console.log('\nTotal bytes received:', totalBytes, 'in', chunks, 'chunks');
console.log('First 200 chars (escaped):', JSON.stringify(allData.slice(0, 200)));
