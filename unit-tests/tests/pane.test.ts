import assert from 'node:assert/strict';
import { Buffer } from '../../dist/editor/Buffer.js';
import { Pane } from '../../dist/ui/Pane.js';
import type { TestCase } from './types.js';

export const suite = 'Pane';

function makePane(text = 'hello\nworld', width = 40, height = 10): Pane {
  const p = new Pane();
  p.buffer = new Buffer(text);
  p.width  = width;
  p.height = height;
  return p;
}

export const tests: TestCase[] = [
  {
    name: 'gutterWidth: 4 when no buffer',
    fn: () => {
      const p = new Pane();
      assert.equal(p.gutterWidth(), 4);
    },
  },
  {
    name: 'gutterWidth: based on line count digits + 1',
    fn: () => {
      const p = makePane('a\nb\nc'); // 3 lines -> 1 digit -> max(3,1)+1 = 4
      assert.equal(p.gutterWidth(), 4);
    },
  },
  {
    name: 'gutterWidth: grows for large line counts',
    fn: () => {
      let lines = '';
      for (let i = 0; i < 100; i++) lines += 'x\n';
      const p = makePane(lines.trimEnd());
      // 100 lines -> 3 digits -> max(3,3)+1 = 4
      assert.equal(p.gutterWidth(), 4);
    },
  },
  {
    name: 'contentWidth: width minus gutterWidth',
    fn: () => {
      const p = makePane('hello', 40, 10);
      assert.equal(p.contentWidth(), 40 - p.gutterWidth());
    },
  },
  {
    name: 'contentHeight: height minus 1 for title bar',
    fn: () => {
      const p = makePane('hello', 40, 10);
      assert.equal(p.contentHeight(), 9);
    },
  },
  {
    name: 'contentHeight: at least 0 when height is 1',
    fn: () => {
      const p = makePane('hello', 40, 1);
      assert.equal(p.contentHeight(), 0);
    },
  },
  {
    name: 'scrollToCursor: scrolls down when cursor below viewport',
    fn: () => {
      const p = makePane(Array.from({length: 30}, (_, i) => `line ${i}`).join('\n'), 40, 10);
      p.cursor.line = 20;
      p.scrollToCursor();
      assert.ok(p.scrollLine <= 20);
      assert.ok(p.scrollLine + p.contentHeight() > 20);
    },
  },
  {
    name: 'scrollToCursor: scrolls up when cursor above viewport',
    fn: () => {
      const p = makePane(Array.from({length: 30}, (_, i) => `line ${i}`).join('\n'), 40, 10);
      p.scrollLine = 15;
      p.cursor.line = 5;
      p.scrollToCursor();
      assert.equal(p.scrollLine, 5);
    },
  },
  {
    name: 'scrollToCursor: horizontal scroll right',
    fn: () => {
      const p = makePane('a'.repeat(200), 40, 10);
      p.cursor.col = 150;
      p.scrollToCursor();
      const cw = p.contentWidth();
      assert.ok(p.scrollCol <= 150);
      assert.ok(p.scrollCol + cw > 150);
    },
  },
  {
    name: 'scrollToCursor: horizontal scroll left',
    fn: () => {
      const p = makePane('hello world', 40, 10);
      p.scrollCol = 10;
      p.cursor.col = 2;
      p.scrollToCursor();
      assert.equal(p.scrollCol, 2);
    },
  },
  {
    name: 'cursorPaneX: gutter + col - scrollCol',
    fn: () => {
      const p = makePane('hello', 40, 10);
      p.cursor.col = 3;
      p.scrollCol = 1;
      assert.equal(p.cursorPaneX(), p.gutterWidth() + 3 - 1);
    },
  },
  {
    name: 'cursorPaneY: 1 + line - scrollLine',
    fn: () => {
      const p = makePane('a\nb\nc', 40, 10);
      p.cursor.line = 2;
      p.scrollLine = 1;
      assert.equal(p.cursorPaneY(), 2); // 1 + 2 - 1
    },
  },
  {
    name: 'cursorAbsX: pane.x + cursorPaneX',
    fn: () => {
      const p = makePane('hello', 40, 10);
      p.x = 5;
      p.cursor.col = 0;
      p.scrollCol = 0;
      assert.equal(p.cursorAbsX(), 5 + p.cursorPaneX());
    },
  },
  {
    name: 'cursorAbsY: pane.y + cursorPaneY',
    fn: () => {
      const p = makePane('a\nb', 40, 10);
      p.y = 3;
      p.cursor.line = 0;
      p.scrollLine = 0;
      assert.equal(p.cursorAbsY(), 3 + p.cursorPaneY());
    },
  },
  {
    name: 'isCursorVisible: true when cursor within pane bounds',
    fn: () => {
      const p = makePane('hello', 40, 10);
      p.cursor.col = 0;
      p.cursor.line = 0;
      p.scrollCol = 0;
      p.scrollLine = 0;
      assert.equal(p.isCursorVisible(), true);
    },
  },
  {
    name: 'isCursorVisible: false when cursor scrolled out of view',
    fn: () => {
      const p = makePane('hello', 40, 10);
      p.cursor.line = 0;
      p.scrollLine = 5; // cursor above viewport
      assert.equal(p.isCursorVisible(), false);
    },
  },
];
