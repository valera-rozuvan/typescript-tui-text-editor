// Spawn a very simple node script via ConPTY and see if the output comes back.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const _require = createRequire(import.meta.url);
const _dirname = dirname(fileURLToPath(import.meta.url));
const native = _require(join(_dirname, 'pty/build/Release/pty_native.node'));

const node = process.execPath;

// Write "HELLO_FROM_CHILD" to stdout, then exit
// Use a temp file to pass the script to avoid quoting hell
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
const scriptFile = join(tmpdir(), 'pty-test-script.js').replace(/\\/g, '/');
writeFileSync(scriptFile, `process.stdout.write('HELLO_FROM_CHILD\\n'); process.exit(0);`, 'utf8');
console.log('Script file:', scriptFile);
const { fd, pid } = native.spawn(node, [scriptFile], 80, 24);
console.log('Spawned fd=%d pid=%d', fd, pid);

let totalBytes = 0;
let allData = '';

const start = Date.now();
while (Date.now() - start < 3000) {
  const c = native.read(fd);
  if (c) {
    totalBytes += c.length;
    allData += c.toString('utf8');
  }
  await new Promise(r => setTimeout(r, 10));
}
native.close(fd);

console.log('Total bytes from pipe:', totalBytes);
console.log('Contains HELLO_FROM_CHILD:', allData.includes('HELLO_FROM_CHILD'));
console.log('Pipe data (escaped):', JSON.stringify(allData.slice(0, 300)));
