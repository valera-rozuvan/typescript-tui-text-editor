import assert from 'node:assert/strict';
import { ScreenBuffer, DrawContext } from '../../dist/terminal/ScreenBuffer.js';
import { renderStatusBar } from '../../dist/ui/StatusBar.js';
import { Layout } from '../../dist/ui/Layout.js';
import { Buffer } from '../../dist/editor/Buffer.js';
import { Highlighter } from '../../dist/highlight/Highlighter.js';
import type { FileBrowser } from '../../dist/ui/FileBrowser.js';
import type { TestCase } from './types.js';

export const suite = 'StatusBar';

const W = 80;
const H = 24;

function makeFileBrowser(dir = '/tmp'): FileBrowser {
  return { currentDir: dir } as FileBrowser;
}

function render(
  buf: Buffer | null,
  mode: 'edit' | 'filebrowser' | 'search' = 'edit',
  message = '',
  fb: FileBrowser = makeFileBrowser()
): string {
  const layout = new Layout();
  layout.update(W, H);
  if (buf) layout.panes[0].buffer = buf;
  const sbuf = new ScreenBuffer(H, W);
  const ctx = new DrawContext(sbuf);
  const hl = new Highlighter();
  renderStatusBar(ctx, layout, mode, hl, fb, message, W, H);
  return sbuf.cells[H - 1].map(c => c.char).join('');
}

export const tests: TestCase[] = [
  {
    name: 'shows MODIFIED after filename when buffer is modified',
    fn: () => {
      const b = new Buffer('hello');
      b.filePath = '/tmp/test.ts';
      b.modified = true;
      const line = render(b);
      assert.ok(line.includes('MODIFIED'), `expected MODIFIED in: "${line.trimEnd()}"`);
    },
  },
  {
    name: 'does not show MODIFIED when buffer is unmodified',
    fn: () => {
      const b = new Buffer('hello');
      b.filePath = '/tmp/test.ts';
      b.modified = false;
      const line = render(b);
      assert.ok(!line.includes('MODIFIED'), `unexpected MODIFIED in: "${line.trimEnd()}"`);
    },
  },
  {
    name: 'shows READONLY after filename when buffer is read-only',
    fn: () => {
      const b = new Buffer('hello');
      b.filePath = '/tmp/ro.txt';
      b.readOnly = true;
      const line = render(b);
      assert.ok(line.includes('READONLY'), `expected READONLY in: "${line.trimEnd()}"`);
    },
  },
  {
    name: 'does not show READONLY when buffer is writable',
    fn: () => {
      const b = new Buffer('hello');
      b.filePath = '/tmp/rw.txt';
      b.readOnly = false;
      const line = render(b);
      assert.ok(!line.includes('READONLY'), `unexpected READONLY in: "${line.trimEnd()}"`);
    },
  },
  {
    name: 'shows MODIFIED and READONLY together when both are true',
    fn: () => {
      const b = new Buffer('hello');
      b.filePath = '/tmp/both.txt';
      b.modified = true;
      b.readOnly = true;
      const line = render(b);
      assert.ok(line.includes('MODIFIED'), `expected MODIFIED in: "${line.trimEnd()}"`);
      assert.ok(line.includes('READONLY'), `expected READONLY in: "${line.trimEnd()}"`);
      assert.ok(line.indexOf('MODIFIED') < line.indexOf('READONLY'), 'MODIFIED should appear before READONLY');
    },
  },
  {
    name: 'dot ● is not present in status bar for modified buffer',
    fn: () => {
      const b = new Buffer('hello');
      b.filePath = '/tmp/test.ts';
      b.modified = true;
      const line = render(b);
      assert.ok(!line.includes('●'), `unexpected ● in status bar: "${line.trimEnd()}"`);
    },
  },
  {
    name: 'MODIFIED appears after the file path',
    fn: () => {
      const b = new Buffer('hello');
      b.filePath = '/tmp/myfile.ts';
      b.modified = true;
      const line = render(b);
      const pathIdx = line.indexOf('/tmp/myfile.ts');
      const modIdx  = line.indexOf('MODIFIED');
      assert.ok(pathIdx >= 0, 'file path not found in status bar');
      assert.ok(modIdx > pathIdx, 'MODIFIED should appear after the file path');
    },
  },
  {
    name: 'READONLY appears after the file path',
    fn: () => {
      const b = new Buffer('hello');
      b.filePath = '/tmp/myfile.txt';
      b.readOnly = true;
      const line = render(b);
      const pathIdx = line.indexOf('/tmp/myfile.txt');
      const roIdx   = line.indexOf('READONLY');
      assert.ok(pathIdx >= 0, 'file path not found in status bar');
      assert.ok(roIdx > pathIdx, 'READONLY should appear after the file path');
    },
  },
  {
    name: 'flash message is displayed when provided',
    fn: () => {
      const b = new Buffer('hello');
      b.filePath = '/tmp/test.ts';
      const line = render(b, 'edit', 'File saved!');
      assert.ok(line.includes('File saved!'), `expected message in: "${line.trimEnd()}"`);
    },
  },
  {
    name: 'flash message suppresses file info',
    fn: () => {
      const b = new Buffer('hello');
      b.filePath = '/tmp/test.ts';
      b.modified = true;
      const line = render(b, 'edit', 'Saved');
      assert.ok(!line.includes('MODIFIED'), 'MODIFIED should not appear when flash message is shown');
    },
  },
  {
    name: 'mode string EDIT is present in edit mode',
    fn: () => {
      const b = new Buffer('');
      b.filePath = '/tmp/x.ts';
      const line = render(b, 'edit');
      assert.ok(line.includes('EDIT'), `expected EDIT in: "${line.trimEnd()}"`);
    },
  },
  {
    name: 'mode string BROWSE is present in filebrowser mode',
    fn: () => {
      const b = new Buffer('');
      b.filePath = '/tmp/x.ts';
      const line = render(b, 'filebrowser');
      assert.ok(line.includes('BROWSE'), `expected BROWSE in: "${line.trimEnd()}"`);
    },
  },
  {
    name: 'filebrowser mode shows current directory path',
    fn: () => {
      const fb = makeFileBrowser('/home/user/projects/myapp');
      const line = render(null, 'filebrowser', '', fb);
      assert.ok(line.includes('/home/user/projects/myapp'), `expected dir path in: "${line.trimEnd()}"`);
    },
  },
  {
    name: 'filebrowser mode does not show file name from active pane',
    fn: () => {
      const b = new Buffer('');
      b.filePath = '/tmp/x.ts';
      const fb = makeFileBrowser('/some/dir');
      const line = render(b, 'filebrowser', '', fb);
      assert.ok(!line.includes('/tmp/x.ts'), `file path should not appear in filebrowser mode: "${line.trimEnd()}"`);
    },
  },
  {
    name: 'filebrowser mode does not show MODIFIED',
    fn: () => {
      const b = new Buffer('');
      b.filePath = '/tmp/x.ts';
      b.modified = true;
      const line = render(b, 'filebrowser');
      assert.ok(!line.includes('MODIFIED'), `MODIFIED should not appear in filebrowser mode: "${line.trimEnd()}"`);
    },
  },
  {
    name: 'filebrowser mode does not show READONLY',
    fn: () => {
      const b = new Buffer('');
      b.filePath = '/tmp/x.ts';
      b.readOnly = true;
      const line = render(b, 'filebrowser');
      assert.ok(!line.includes('READONLY'), `READONLY should not appear in filebrowser mode: "${line.trimEnd()}"`);
    },
  },
  {
    name: 'filebrowser mode does not show line:col position',
    fn: () => {
      const b = new Buffer('hello\nworld');
      b.filePath = '/tmp/x.ts';
      const fb = makeFileBrowser('/some/dir');
      const line = render(b, 'filebrowser', '', fb);
      // position would appear as "1:1" or similar — check no digit:digit pattern from position
      assert.ok(!line.includes('1:1'), `line:col should not appear in filebrowser mode: "${line.trimEnd()}"`);
    },
  },
  {
    name: 'filebrowser mode does not show language name',
    fn: () => {
      const b = new Buffer('');
      b.filePath = '/tmp/x.ts';
      const fb = makeFileBrowser('/some/dir');
      const line = render(b, 'filebrowser', '', fb);
      assert.ok(!line.includes('TypeScript'), `language name should not appear in filebrowser mode: "${line.trimEnd()}"`);
    },
  },
  {
    name: 'mode string SEARCH is present in search mode',
    fn: () => {
      const b = new Buffer('');
      b.filePath = '/tmp/x.ts';
      const line = render(b, 'search');
      assert.ok(line.includes('SEARCH'), `expected SEARCH in: "${line.trimEnd()}"`);
    },
  },
];
