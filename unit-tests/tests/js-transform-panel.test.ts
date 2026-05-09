import assert from 'node:assert/strict';
import { JsTransformPanel } from '../../dist/ui/JsTransformPanel.js';
import type { TestCase } from './types.js';

export const suite = 'JsTransformPanel';

const DEFAULT_LINE_0 = 'function transform(line, lineNumber) {';
const DEFAULT_LINE_1 = '  return line;';
const DEFAULT_LINE_2 = '}';

export const tests: TestCase[] = [
  // ── open ────────────────────────────────────────────────────────────────────
  {
    name: 'open: sets active to true',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      assert.equal(p.active, true);
    },
  },
  {
    name: 'open: loads default transform template',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      assert.equal(p.lines.length, 3);
      assert.equal(p.lines[0], DEFAULT_LINE_0);
      assert.equal(p.lines[1], DEFAULT_LINE_1);
      assert.equal(p.lines[2], DEFAULT_LINE_2);
    },
  },
  {
    name: 'open: positions cursor at end of second line',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      assert.equal(p.cursorLine, 1);
      assert.equal(p.cursorCol, DEFAULT_LINE_1.length);
    },
  },
  {
    name: 'open: resets scroll to top',
    fn: () => {
      const p = new JsTransformPanel();
      p.scrollLine = 99;
      p.open();
      assert.equal(p.scrollLine, 0);
    },
  },
  {
    name: 'open: repeated open resets state',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      p.insertChar('x');
      p.open();
      assert.equal(p.lines[1], DEFAULT_LINE_1);
      assert.equal(p.cursorCol, DEFAULT_LINE_1.length);
    },
  },

  // ── close ───────────────────────────────────────────────────────────────────
  {
    name: 'close: sets active to false',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      p.close();
      assert.equal(p.active, false);
    },
  },

  // ── getCode ─────────────────────────────────────────────────────────────────
  {
    name: 'getCode: joins lines with newlines',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      const code = p.getCode();
      assert.equal(code, [DEFAULT_LINE_0, DEFAULT_LINE_1, DEFAULT_LINE_2].join('\n'));
    },
  },
  {
    name: 'getCode: reflects edits',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      p.cursorLine = 1;
      p.cursorCol = 0;
      p.insertChar('//');
      assert.ok(p.getCode().includes('//' + DEFAULT_LINE_1));
    },
  },

  // ── insertChar ───────────────────────────────────────────────────────────────
  {
    name: 'insertChar: inserts at cursor position',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      p.cursorLine = 2;
      p.cursorCol = 0;
      p.insertChar('x');
      assert.equal(p.lines[2], 'x}');
      assert.equal(p.cursorCol, 1);
    },
  },
  {
    name: 'insertChar: inserts mid-line',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      p.cursorLine = 1;
      p.cursorCol = 2;
      p.insertChar('!');
      assert.equal(p.lines[1], '  !return line;');
    },
  },
  {
    name: 'insertChar: inserts at end of line',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      p.cursorLine = 2;
      p.cursorCol = p.lines[2].length;
      p.insertChar(';');
      assert.equal(p.lines[2], '};');
    },
  },

  // ── insertNewline ─────────────────────────────────────────────────────────────
  {
    name: 'insertNewline: splits line at cursor',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      p.cursorLine = 2;
      p.cursorCol = 0;
      p.insertNewline();
      assert.equal(p.lines.length, 4);
      assert.equal(p.lines[2], '');
      assert.equal(p.lines[3], '}');
      assert.equal(p.cursorLine, 3);
      assert.equal(p.cursorCol, 0);
    },
  },
  {
    name: 'insertNewline: preserves indentation from current line',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      // Line 1 is '  return line;' (2 spaces indent)
      p.cursorLine = 1;
      p.cursorCol = p.lines[1].length;
      p.insertNewline();
      // New line should have 2 spaces of indent
      assert.equal(p.lines[2], '  ');
      assert.equal(p.cursorCol, 2);
    },
  },
  {
    name: 'insertNewline: at col 0 creates empty line before rest',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      p.cursorLine = 0;
      p.cursorCol = 0;
      p.insertNewline();
      assert.equal(p.lines[0], '');
      assert.equal(p.lines[1], DEFAULT_LINE_0);
      assert.equal(p.cursorLine, 1);
    },
  },

  // ── deleteCharBefore ──────────────────────────────────────────────────────────
  {
    name: 'deleteCharBefore: removes character before cursor',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      p.cursorLine = 2;
      p.cursorCol = 1;
      p.deleteCharBefore();
      assert.equal(p.lines[2], '');
      assert.equal(p.cursorCol, 0);
    },
  },
  {
    name: 'deleteCharBefore: at col 0 merges with previous line',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      p.cursorLine = 2;
      p.cursorCol = 0;
      const prevLen = p.lines[1].length;
      p.deleteCharBefore();
      assert.equal(p.lines.length, 2);
      assert.equal(p.lines[1], DEFAULT_LINE_1 + DEFAULT_LINE_2);
      assert.equal(p.cursorLine, 1);
      assert.equal(p.cursorCol, prevLen);
    },
  },
  {
    name: 'deleteCharBefore: no-op at (0, 0)',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      p.cursorLine = 0;
      p.cursorCol = 0;
      p.deleteCharBefore();
      assert.equal(p.lines.length, 3);
      assert.equal(p.cursorLine, 0);
      assert.equal(p.cursorCol, 0);
    },
  },

  // ── moveUp ──────────────────────────────────────────────────────────────────
  {
    name: 'moveUp: moves cursor to previous line',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      p.cursorLine = 2;
      p.cursorCol = 0;
      p.moveUp();
      assert.equal(p.cursorLine, 1);
    },
  },
  {
    name: 'moveUp: clamps col to line length',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      // Line 0 is long; line 1 is shorter
      p.cursorLine = 1;
      p.cursorCol = DEFAULT_LINE_1.length;
      p.moveUp(); // move to line 0
      assert.equal(p.cursorLine, 0);
      // col should be min(DEFAULT_LINE_1.length, DEFAULT_LINE_0.length)
      assert.equal(p.cursorCol, Math.min(DEFAULT_LINE_1.length, DEFAULT_LINE_0.length));
    },
  },
  {
    name: 'moveUp: no-op at first line',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      p.cursorLine = 0;
      p.cursorCol = 3;
      p.moveUp();
      assert.equal(p.cursorLine, 0);
      assert.equal(p.cursorCol, 3);
    },
  },

  // ── moveDown ────────────────────────────────────────────────────────────────
  {
    name: 'moveDown: moves cursor to next line',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      p.cursorLine = 0;
      p.moveDown();
      assert.equal(p.cursorLine, 1);
    },
  },
  {
    name: 'moveDown: clamps col to line length',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      // line 0 is long; line 1 is '  return line;' (14 chars)
      p.cursorLine = 0;
      p.cursorCol = DEFAULT_LINE_0.length;
      p.moveDown();
      assert.equal(p.cursorLine, 1);
      assert.equal(p.cursorCol, DEFAULT_LINE_1.length);
    },
  },
  {
    name: 'moveDown: no-op at last line',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      p.cursorLine = 2;
      p.cursorCol = 0;
      p.moveDown();
      assert.equal(p.cursorLine, 2);
    },
  },

  // ── moveLeft ────────────────────────────────────────────────────────────────
  {
    name: 'moveLeft: decrements col within line',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      p.cursorLine = 1;
      p.cursorCol = 5;
      p.moveLeft();
      assert.equal(p.cursorCol, 4);
    },
  },
  {
    name: 'moveLeft: wraps to end of previous line at col 0',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      p.cursorLine = 1;
      p.cursorCol = 0;
      p.moveLeft();
      assert.equal(p.cursorLine, 0);
      assert.equal(p.cursorCol, p.lines[0].length);
    },
  },
  {
    name: 'moveLeft: no-op at (0, 0)',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      p.cursorLine = 0;
      p.cursorCol = 0;
      p.moveLeft();
      assert.equal(p.cursorLine, 0);
      assert.equal(p.cursorCol, 0);
    },
  },

  // ── moveRight ───────────────────────────────────────────────────────────────
  {
    name: 'moveRight: increments col within line',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      p.cursorLine = 1;
      p.cursorCol = 0;
      p.moveRight();
      assert.equal(p.cursorCol, 1);
    },
  },
  {
    name: 'moveRight: wraps to start of next line at end of line',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      p.cursorLine = 0;
      p.cursorCol = p.lines[0].length;
      p.moveRight();
      assert.equal(p.cursorLine, 1);
      assert.equal(p.cursorCol, 0);
    },
  },
  {
    name: 'moveRight: no-op at end of last line',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      p.cursorLine = 2;
      p.cursorCol = p.lines[2].length;
      p.moveRight();
      assert.equal(p.cursorLine, 2);
      assert.equal(p.cursorCol, p.lines[2].length);
    },
  },

  // ── moveHome ────────────────────────────────────────────────────────────────
  {
    name: 'moveHome: moves to first non-whitespace when not already there',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      // Line 1 is '  return line;' — first non-WS at col 2
      p.cursorLine = 1;
      p.cursorCol = 10;
      p.moveHome();
      assert.equal(p.cursorCol, 2);
    },
  },
  {
    name: 'moveHome: moves to col 0 when already at first non-whitespace',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      p.cursorLine = 1;
      p.cursorCol = 2; // already at first non-WS
      p.moveHome();
      assert.equal(p.cursorCol, 0);
    },
  },
  {
    name: 'moveHome: moves to col 0 for line with no leading whitespace',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      // Line 2 is '}', no leading whitespace
      p.cursorLine = 2;
      p.cursorCol = 1;
      p.moveHome();
      assert.equal(p.cursorCol, 0);
    },
  },
  {
    name: 'moveHome: stays at col 0 for all-whitespace line',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      // Insert a blank line
      p.cursorLine = 0;
      p.cursorCol = 0;
      p.insertNewline();
      // New line 0 is empty; line 1 is original line 0
      // The new empty line at position 0 was created; let's use a different approach
      // Instead insert a line with spaces only
      p.lines.splice(0, 0, '   ');
      p.cursorLine = 0;
      p.cursorCol = 2;
      p.moveHome();
      // firstNonWs not found (all spaces), so cursorCol goes to 0
      assert.equal(p.cursorCol, 0);
    },
  },

  // ── moveEnd ─────────────────────────────────────────────────────────────────
  {
    name: 'moveEnd: moves cursor to end of line',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      p.cursorLine = 1;
      p.cursorCol = 0;
      p.moveEnd();
      assert.equal(p.cursorCol, DEFAULT_LINE_1.length);
    },
  },
  {
    name: 'moveEnd: no-op when already at end',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      p.cursorLine = 2;
      p.cursorCol = p.lines[2].length;
      p.moveEnd();
      assert.equal(p.cursorCol, p.lines[2].length);
    },
  },

  // ── adjustScroll ─────────────────────────────────────────────────────────────
  {
    name: 'adjustScroll: no-op when cursor within viewport',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      p.scrollLine = 0;
      p.cursorLine = 1;
      p.adjustScroll(10);
      assert.equal(p.scrollLine, 0);
    },
  },
  {
    name: 'adjustScroll: scrolls down when cursor below viewport',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      // Add more lines
      for (let i = 0; i < 20; i++) p.lines.push(`// line ${i}`);
      p.cursorLine = 15;
      p.scrollLine = 0;
      p.adjustScroll(5);
      assert.ok(p.scrollLine > 0);
      assert.ok(p.scrollLine + 5 > 15);
    },
  },
  {
    name: 'adjustScroll: scrolls up when cursor above viewport',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      p.scrollLine = 10;
      p.cursorLine = 2;
      p.adjustScroll(5);
      assert.equal(p.scrollLine, 2);
    },
  },
  {
    name: 'adjustScroll: no-op when visibleHeight is 0',
    fn: () => {
      const p = new JsTransformPanel();
      p.open();
      p.scrollLine = 0;
      p.cursorLine = 2;
      p.adjustScroll(0);
      assert.equal(p.scrollLine, 0);
    },
  },
];
