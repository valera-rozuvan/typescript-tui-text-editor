import assert from 'node:assert/strict';
import { ScreenBuffer, DrawContext, cellsEqual } from '../../dist/terminal/ScreenBuffer.js';
import type { Cell, RGB } from '../../dist/terminal/ScreenBuffer.js';
import type { TestCase } from './types.js';

export const suite = 'ScreenBuffer';

const DEFAULT_FG: RGB = [205, 214, 244]; // THEME.fg
const DEFAULT_BG: RGB = [30, 30, 46];   // THEME.bg
const DIRTY_CHAR = '\x00';

function makeCell(char: string, opts: Partial<Cell> = {}): Cell {
  return {
    char,
    fg: opts.fg ?? [255, 255, 255],
    bg: opts.bg ?? [0, 0, 0],
    bold: opts.bold ?? false,
    dim: opts.dim ?? false,
    reverse: opts.reverse ?? false,
  };
}

export const tests: TestCase[] = [
  // ── cellsEqual ──────────────────────────────────────────────────────────────
  {
    name: 'cellsEqual: identical cells are equal',
    fn: () => {
      const a = makeCell('a', { fg: [1, 2, 3], bg: [4, 5, 6], bold: true });
      const b = makeCell('a', { fg: [1, 2, 3], bg: [4, 5, 6], bold: true });
      assert.ok(cellsEqual(a, b));
    },
  },
  {
    name: 'cellsEqual: different char is not equal',
    fn: () => {
      const a = makeCell('a');
      const b = makeCell('b');
      assert.ok(!cellsEqual(a, b));
    },
  },
  {
    name: 'cellsEqual: different bold is not equal',
    fn: () => {
      const a = makeCell('a', { bold: false });
      const b = makeCell('a', { bold: true });
      assert.ok(!cellsEqual(a, b));
    },
  },
  {
    name: 'cellsEqual: different dim is not equal',
    fn: () => {
      const a = makeCell('a', { dim: false });
      const b = makeCell('a', { dim: true });
      assert.ok(!cellsEqual(a, b));
    },
  },
  {
    name: 'cellsEqual: different reverse is not equal',
    fn: () => {
      const a = makeCell('a', { reverse: false });
      const b = makeCell('a', { reverse: true });
      assert.ok(!cellsEqual(a, b));
    },
  },
  {
    name: 'cellsEqual: different fg is not equal',
    fn: () => {
      const a = makeCell('a', { fg: [1, 2, 3] });
      const b = makeCell('a', { fg: [1, 2, 4] });
      assert.ok(!cellsEqual(a, b));
    },
  },
  {
    name: 'cellsEqual: different bg is not equal',
    fn: () => {
      const a = makeCell('a', { bg: [10, 20, 30] });
      const b = makeCell('a', { bg: [10, 20, 31] });
      assert.ok(!cellsEqual(a, b));
    },
  },

  // ── ScreenBuffer constructor ─────────────────────────────────────────────────
  {
    name: 'ScreenBuffer: constructor creates correct dimensions',
    fn: () => {
      const sb = new ScreenBuffer(5, 10);
      assert.equal(sb.rows, 5);
      assert.equal(sb.cols, 10);
      assert.equal(sb.cells.length, 5);
      assert.equal(sb.cells[0].length, 10);
    },
  },
  {
    name: 'ScreenBuffer: constructor fills with dirty sentinel cells',
    fn: () => {
      const sb = new ScreenBuffer(3, 4);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
          assert.equal(sb.cells[r][c].char, DIRTY_CHAR);
        }
      }
    },
  },

  // ── ScreenBuffer.set ─────────────────────────────────────────────────────────
  {
    name: 'ScreenBuffer.set: writes cell at valid position',
    fn: () => {
      const sb = new ScreenBuffer(5, 5);
      const cell = makeCell('X', { fg: [1, 2, 3] });
      sb.set(2, 3, cell);
      assert.equal(sb.cells[2][3].char, 'X');
      assert.deepEqual(sb.cells[2][3].fg, [1, 2, 3]);
    },
  },
  {
    name: 'ScreenBuffer.set: ignores out-of-bounds row',
    fn: () => {
      const sb = new ScreenBuffer(3, 3);
      sb.set(5, 1, makeCell('X'));
      // No throw, buffer unchanged
      assert.equal(sb.cells[0][1].char, DIRTY_CHAR);
    },
  },
  {
    name: 'ScreenBuffer.set: ignores out-of-bounds col',
    fn: () => {
      const sb = new ScreenBuffer(3, 3);
      sb.set(1, 10, makeCell('X'));
      assert.equal(sb.cells[1][0].char, DIRTY_CHAR);
    },
  },
  {
    name: 'ScreenBuffer.set: ignores negative coordinates',
    fn: () => {
      const sb = new ScreenBuffer(3, 3);
      sb.set(-1, -1, makeCell('X'));
      assert.equal(sb.cells[0][0].char, DIRTY_CHAR);
    },
  },

  // ── ScreenBuffer.markDirty ───────────────────────────────────────────────────
  {
    name: 'ScreenBuffer.markDirty: resets all cells to dirty sentinel',
    fn: () => {
      const sb = new ScreenBuffer(3, 3);
      sb.set(1, 1, makeCell('A'));
      sb.markDirty();
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          assert.equal(sb.cells[r][c].char, DIRTY_CHAR);
        }
      }
    },
  },

  // ── ScreenBuffer.resize ──────────────────────────────────────────────────────
  {
    name: 'ScreenBuffer.resize: updates dimensions and resets to dirty',
    fn: () => {
      const sb = new ScreenBuffer(2, 2);
      sb.set(0, 0, makeCell('Z'));
      sb.resize(4, 6);
      assert.equal(sb.rows, 4);
      assert.equal(sb.cols, 6);
      assert.equal(sb.cells.length, 4);
      assert.equal(sb.cells[0].length, 6);
      assert.equal(sb.cells[0][0].char, DIRTY_CHAR);
    },
  },

  // ── ScreenBuffer.copyFrom ────────────────────────────────────────────────────
  {
    name: 'ScreenBuffer.copyFrom: copies dimensions and cells',
    fn: () => {
      const src = new ScreenBuffer(2, 3);
      const cell = makeCell('Q', { fg: [10, 20, 30] });
      src.set(1, 2, cell);

      const dst = new ScreenBuffer(1, 1);
      dst.copyFrom(src);

      assert.equal(dst.rows, 2);
      assert.equal(dst.cols, 3);
      assert.equal(dst.cells[1][2].char, 'Q');
      assert.deepEqual(dst.cells[1][2].fg, [10, 20, 30]);
    },
  },
  {
    name: 'ScreenBuffer.copyFrom: produces independent deep copy',
    fn: () => {
      const src = new ScreenBuffer(2, 2);
      src.set(0, 0, makeCell('A'));

      const dst = new ScreenBuffer(2, 2);
      dst.copyFrom(src);

      // Mutate src after copy — dst must be unaffected
      src.set(0, 0, makeCell('B'));
      assert.equal(dst.cells[0][0].char, 'A');
    },
  },

  // ── DrawContext ───────────────────────────────────────────────────────────────
  {
    name: 'DrawContext.write: writes characters at current position',
    fn: () => {
      const sb = new ScreenBuffer(3, 10);
      const ctx = new DrawContext(sb);
      ctx.moveTo(1, 2);
      ctx.write('hi');
      assert.equal(sb.cells[1][2].char, 'h');
      assert.equal(sb.cells[1][3].char, 'i');
    },
  },
  {
    name: 'DrawContext.write: advances col after writing',
    fn: () => {
      const sb = new ScreenBuffer(2, 10);
      const ctx = new DrawContext(sb);
      ctx.moveTo(0, 0);
      ctx.write('abc');
      // After writing 3 chars, next write should start at col 3
      ctx.write('d');
      assert.equal(sb.cells[0][3].char, 'd');
    },
  },
  {
    name: 'DrawContext.write: uses default fg and bg colors',
    fn: () => {
      const sb = new ScreenBuffer(2, 5);
      const ctx = new DrawContext(sb);
      ctx.moveTo(0, 0);
      ctx.write('x');
      assert.deepEqual(sb.cells[0][0].fg, DEFAULT_FG);
      assert.deepEqual(sb.cells[0][0].bg, DEFAULT_BG);
    },
  },
  {
    name: 'DrawContext.setFg/setBg: applies custom colors',
    fn: () => {
      const sb = new ScreenBuffer(2, 5);
      const ctx = new DrawContext(sb);
      ctx.setFg([255, 0, 0]);
      ctx.setBg([0, 0, 255]);
      ctx.moveTo(0, 0);
      ctx.write('x');
      assert.deepEqual(sb.cells[0][0].fg, [255, 0, 0]);
      assert.deepEqual(sb.cells[0][0].bg, [0, 0, 255]);
    },
  },
  {
    name: 'DrawContext.setBold/setDim/setReverse: applies style flags',
    fn: () => {
      const sb = new ScreenBuffer(2, 5);
      const ctx = new DrawContext(sb);
      ctx.setBold(true);
      ctx.setDim(true);
      ctx.setReverse(true);
      ctx.moveTo(0, 0);
      ctx.write('x');
      assert.equal(sb.cells[0][0].bold, true);
      assert.equal(sb.cells[0][0].dim, true);
      assert.equal(sb.cells[0][0].reverse, true);
    },
  },
  {
    name: 'DrawContext.reset: restores default fg, bg, and style flags',
    fn: () => {
      const sb = new ScreenBuffer(2, 5);
      const ctx = new DrawContext(sb);
      ctx.setFg([255, 0, 0]);
      ctx.setBg([0, 0, 128]);
      ctx.setBold(true);
      ctx.setDim(true);
      ctx.setReverse(true);
      ctx.reset();
      ctx.moveTo(0, 0);
      ctx.write('y');
      assert.deepEqual(sb.cells[0][0].fg, DEFAULT_FG);
      assert.deepEqual(sb.cells[0][0].bg, DEFAULT_BG);
      assert.equal(sb.cells[0][0].bold, false);
      assert.equal(sb.cells[0][0].dim, false);
      assert.equal(sb.cells[0][0].reverse, false);
    },
  },
  {
    name: 'DrawContext.write: tab at col 0 expands to 8 spaces',
    fn: () => {
      const sb = new ScreenBuffer(2, 20);
      const ctx = new DrawContext(sb);
      ctx.moveTo(0, 0);
      ctx.write('\t');
      // Tab at col 0 → next stop is col 8 → fills cols 0–7 with spaces
      for (let c = 0; c < 8; c++) {
        assert.equal(sb.cells[0][c].char, ' ', `col ${c} should be space`);
      }
    },
  },
  {
    name: 'DrawContext.write: tab at col 3 expands to next 8-column stop',
    fn: () => {
      const sb = new ScreenBuffer(2, 20);
      const ctx = new DrawContext(sb);
      ctx.moveTo(0, 0);
      ctx.write('abc'); // advances to col 3
      ctx.write('\t'); // next stop: col 8 → fills cols 3–7
      for (let c = 3; c < 8; c++) {
        assert.equal(sb.cells[0][c].char, ' ', `col ${c} should be space`);
      }
      // col 8 should still be dirty (not written yet)
      assert.equal(sb.cells[0][8].char, DIRTY_CHAR);
    },
  },
  {
    name: 'DrawContext.write: tab at col 8 expands to col 16',
    fn: () => {
      const sb = new ScreenBuffer(2, 20);
      const ctx = new DrawContext(sb);
      ctx.moveTo(0, 8);
      ctx.write('\t');
      for (let c = 8; c < 16; c++) {
        assert.equal(sb.cells[0][c].char, ' ', `col ${c} should be space`);
      }
    },
  },
  {
    name: 'DrawContext.write: multiple tabs advance correctly',
    fn: () => {
      const sb = new ScreenBuffer(2, 32);
      const ctx = new DrawContext(sb);
      ctx.moveTo(0, 0);
      ctx.write('\t\t'); // two tabs: 0→8→16
      ctx.write('X');
      assert.equal(sb.cells[0][16].char, 'X');
    },
  },
  {
    name: 'DrawContext.moveTo: subsequent writes start at new position',
    fn: () => {
      const sb = new ScreenBuffer(5, 10);
      const ctx = new DrawContext(sb);
      ctx.moveTo(3, 5);
      ctx.write('Z');
      assert.equal(sb.cells[3][5].char, 'Z');
      // Original position should still be dirty
      assert.equal(sb.cells[0][0].char, DIRTY_CHAR);
    },
  },
];
