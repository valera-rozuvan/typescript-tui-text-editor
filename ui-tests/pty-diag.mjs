// Diagnostic: spawn child via ConPTY, have child write to a temp file,
// read back to see isTTY/columns/rows without console interference.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';

const _require = createRequire(import.meta.url);
const _dirname = dirname(fileURLToPath(import.meta.url));
const native = _require(join(_dirname, 'pty/build/Release/pty_native.node'));

const outFile = join(tmpdir(), 'pty-diag-out.txt').replace(/\\/g, '/');
if (existsSync(outFile)) unlinkSync(outFile);

const node = process.execPath;
const script = `
const fs = require('fs');
fs.writeFileSync(${JSON.stringify(outFile)}, JSON.stringify({
  isTTY_stdout: process.stdout.isTTY,
  isTTY_stderr: process.stderr.isTTY,
  columns: process.stdout.columns,
  rows: process.stdout.rows,
  platform: process.platform,
}), 'utf8');
process.exit(0);
`.trim();

console.log('Spawning child...');
const { fd, pid } = native.spawn(node, ['-e', script], 120, 30);

// wait up to 3 seconds for the child to write the file
const deadline = Date.now() + 3000;
while (!existsSync(outFile) && Date.now() < deadline) {
  await new Promise(r => setTimeout(r, 50));
}

// drain pipe output
let pipeOut = '';
for (let i = 0; i < 30; i++) {
  const c = native.read(fd);
  if (c) pipeOut += c.toString('utf8');
  await new Promise(r => setTimeout(r, 20));
}

native.close(fd);

if (existsSync(outFile)) {
  console.log('Child wrote to file:', readFileSync(outFile, 'utf8'));
} else {
  console.log('Child did NOT write to file within 3 seconds');
}
console.log('Pipe bytes received:', pipeOut.length);
console.log('Pipe content (escaped):', JSON.stringify(pipeOut.slice(0, 200)));
