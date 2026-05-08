import assert from 'node:assert/strict';
import { Terminal } from '../../dist/terminal/Terminal.js';
import { Renderer } from '../../dist/terminal/Renderer.js';
import { Layout } from '../../dist/ui/Layout.js';
import { FileBrowser } from '../../dist/ui/FileBrowser.js';
import { SearchPanel } from '../../dist/ui/SearchPanel.js';
import { Highlighter } from '../../dist/highlight/Highlighter.js';
import type { TestCase } from './types.js';

export const suite = 'Renderer search cursor';

type StdoutLike = { write: (s: unknown) => boolean };

function captureRender(
  renderer: Renderer,
  layout: Layout,
  fb: FileBrowser,
  sp: SearchPanel,
  hl: Highlighter,
): string {
  const chunks: string[] = [];
  const stdout = process.stdout as unknown as StdoutLike;
  const orig = stdout.write.bind(process.stdout);
  stdout.write = (s: unknown) => { chunks.push(s as string); return true; };
  try {
    renderer.render(layout, fb, sp, hl, 'search', '');
  } finally {
    stdout.write = orig;
  }
  return chunks.join('');
}

function parseCursorFromOutput(output: string): { row: number; col: number } | null {
  // The render output ends with: ...moveTo(row,col) + showCursor
  // showCursor = \x1b[?25h, moveTo = \x1b[R;CH
  const m = output.match(/\x1b\[(\d+);(\d+)H\x1b\[\?25h$/);
  if (!m) return null;
  return { row: parseInt(m[1], 10), col: parseInt(m[2], 10) };
}

export const tests: TestCase[] = [
  {
    name: 'cursor is positioned at start of input field when needle is empty',
    fn: () => {
      const term = new Terminal();
      const renderer = new Renderer(term);
      const W = term.width;
      const H = term.height;

      const layout = new Layout();
      layout.update(W, H);
      const fb = new FileBrowser('.');
      const sp = new SearchPanel();
      const hl = new Highlighter();

      sp.open('file');

      const panelW = Math.min(W - 4, 90);
      const panelX = Math.floor((W - panelW) / 2);
      const panelY = Math.floor(H * 0.15);
      const expectedRow = panelY + 2 + 1; // +1: ANSI 1-indexed
      const expectedCol = panelX + 2 + 1; // panelX + "> ".length, +1: ANSI 1-indexed

      const output = captureRender(renderer, layout, fb, sp, hl);
      const pos = parseCursorFromOutput(output);
      assert.ok(pos !== null, 'cursor position sequence not found in render output');
      assert.equal(pos.row, expectedRow, `expected row ${expectedRow}, got ${pos.row}`);
      assert.equal(pos.col, expectedCol, `expected col ${expectedCol}, got ${pos.col}`);
    },
  },
  {
    name: 'cursor advances by one column per typed character',
    fn: () => {
      const term = new Terminal();
      const renderer = new Renderer(term);
      const W = term.width;
      const H = term.height;

      const layout = new Layout();
      layout.update(W, H);
      const fb = new FileBrowser('.');
      const sp = new SearchPanel();
      const hl = new Highlighter();

      sp.open('file');

      const panelW = Math.min(W - 4, 90);
      const panelX = Math.floor((W - panelW) / 2);
      const panelY = Math.floor(H * 0.15);
      const expectedRow = panelY + 2 + 1; // +1: ANSI 1-indexed

      const chars = ['s', 'e', 'a', 'r', 'c', 'h'];
      for (let i = 0; i <= chars.length; i++) {
        const output = captureRender(renderer, layout, fb, sp, hl);
        const pos = parseCursorFromOutput(output);
        assert.ok(pos !== null, `step ${i}: cursor position not found in render output`);

        const expectedCol = panelX + 2 + sp.needle.length + 1; // +1: ANSI 1-indexed
        assert.equal(pos.row, expectedRow,
          `step ${i} (needle="${sp.needle}"): expected row ${expectedRow}, got ${pos.row}`);
        assert.equal(pos.col, expectedCol,
          `step ${i} (needle="${sp.needle}"): expected col ${expectedCol}, got ${pos.col}`);

        if (i < chars.length) sp.appendChar(chars[i]);
      }
    },
  },
  {
    name: 'cursor row matches search input row, not some other panel row',
    fn: () => {
      const term = new Terminal();
      const renderer = new Renderer(term);
      const W = term.width;
      const H = term.height;

      const layout = new Layout();
      layout.update(W, H);
      const fb = new FileBrowser('.');
      const sp = new SearchPanel();
      const hl = new Highlighter();

      sp.open('file');
      sp.appendChar('t');
      sp.appendChar('e');
      sp.appendChar('s');
      sp.appendChar('t');

      const panelY = Math.floor(H * 0.15);
      // Input row is panelY+2 (0-indexed), ANSI row is panelY+3
      const expectedRow = panelY + 2 + 1;

      const output = captureRender(renderer, layout, fb, sp, hl);
      const pos = parseCursorFromOutput(output);
      assert.ok(pos !== null, 'cursor position sequence not found');
      assert.equal(pos.row, expectedRow,
        `cursor should be on search input row (${expectedRow}), got ${pos.row}`);
    },
  },
];
