import { THEME } from '../highlight/tokens.js';
import { TAB_CHAR_COUNT } from '../constants.js';

export type RGB = [number, number, number];

export interface Cell {
  char: string;
  fg: RGB;
  bg: RGB;
  bold: boolean;
  dim: boolean;
  reverse: boolean;
}

// Sentinel cell — char '\x00' is never emitted by the renderer,
// so _current starts full of these to force a complete first-frame paint.
const DIRTY_CELL: Cell = {
  char: '\x00',
  fg: [0, 0, 0],
  bg: [0, 0, 0],
  bold: false,
  dim: false,
  reverse: false,
};

export function cellsEqual(a: Cell, b: Cell): boolean {
  return (
    a.char === b.char &&
    a.bold === b.bold &&
    a.dim  === b.dim  &&
    a.reverse === b.reverse &&
    a.fg[0] === b.fg[0] && a.fg[1] === b.fg[1] && a.fg[2] === b.fg[2] &&
    a.bg[0] === b.bg[0] && a.bg[1] === b.bg[1] && a.bg[2] === b.bg[2]
  );
}

// ─── ScreenBuffer ─────────────────────────────────────────────────────────────

export class ScreenBuffer {
  rows: number;
  cols: number;
  cells: Cell[][];

  constructor(rows: number, cols: number) {
    this.rows = rows;
    this.cols = cols;
    this.cells = this._makeDirty();
  }

  private _makeDirty(): Cell[][] {
    return Array.from({ length: this.rows }, () =>
      Array.from({ length: this.cols }, () => ({ ...DIRTY_CELL }))
    );
  }

  /** Fill every cell with the dirty sentinel to force a full repaint. */
  markDirty(): void {
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++)
        this.cells[r][c] = { ...DIRTY_CELL };
  }

  /** Resize (and mark dirty — content is stale after a resize). */
  resize(rows: number, cols: number): void {
    this.rows = rows;
    this.cols = cols;
    this.cells = this._makeDirty();
  }

  /** Deep-copy another buffer's cells into this one. */
  copyFrom(other: ScreenBuffer): void {
    this.rows = other.rows;
    this.cols = other.cols;
    // Reuse row arrays where possible, allocate new ones when other is bigger.
    if (this.cells.length !== other.rows) {
      this.cells = Array.from({ length: other.rows }, () => [] as Cell[]);
    }
    for (let r = 0; r < other.rows; r++) {
      const src = other.cells[r];
      const dst = this.cells[r];
      if (dst.length !== src.length) {
        this.cells[r] = src.map(c => ({ ...c }));
      } else {
        for (let c = 0; c < src.length; c++) {
          dst[c] = { ...src[c] };
        }
      }
    }
  }

  set(row: number, col: number, cell: Cell): void {
    if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
      this.cells[row][col] = cell;
    }
  }
}

// ─── DrawContext ───────────────────────────────────────────────────────────────

/**
 * Stateful drawing API wrapping a ScreenBuffer.
 * Tracks position and current style; writes cells into the buffer.
 * All coordinates are 0-indexed.
 */
export class DrawContext {
  private _buf: ScreenBuffer;
  private _row = 0;
  private _col = 0;
  private _fg: RGB = THEME.fg;
  private _bg: RGB = THEME.bg;
  private _bold = false;
  private _dim = false;
  private _reverse = false;

  constructor(buf: ScreenBuffer) {
    this._buf = buf;
  }

  /** Move the draw cursor to (row, col), both 0-indexed. */
  moveTo(row: number, col: number): void {
    this._row = row;
    this._col = col;
  }

  setFg(color: RGB): void    { this._fg = color; }
  setBg(color: RGB): void    { this._bg = color; }
  setBold(v: boolean): void  { this._bold = v; }
  setDim(v: boolean): void   { this._dim = v; }
  setReverse(v: boolean): void { this._reverse = v; }

  /** Reset all style attributes to THEME defaults. */
  reset(): void {
    this._fg = THEME.fg;
    this._bg = THEME.bg;
    this._bold = false;
    this._dim = false;
    this._reverse = false;
  }

  /** Write each character of `text` at the current position, advancing col.
   *  Tab characters are expanded to spaces using TAB_CHAR_COUNT-column tab stops so that
   *  every screen cell is explicitly written and stale content from previous
   *  renders is properly overwritten by the diff pass. */
  write(text: string): void {
    const fg = this._fg;
    const bg = this._bg;
    const bold = this._bold;
    const dim = this._dim;
    const reverse = this._reverse;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\t') {
        const nextStop = this._col + TAB_CHAR_COUNT;
        for (let c = this._col; c < nextStop; c++) {
          this._buf.set(this._row, c, { char: ' ', fg, bg, bold, dim, reverse });
        }
        this._col = nextStop;
      } else {
        this._buf.set(this._row, this._col, { char: text[i], fg, bg, bold, dim, reverse });
        this._col++;
      }
    }
  }
}
