import { Terminal } from './Terminal.js';
import { ScreenBuffer, DrawContext, cellsEqual } from './ScreenBuffer.js';
import type { RGB } from './ScreenBuffer.js';
import type { Layout } from '../ui/Layout.js';
import type { Pane } from '../ui/Pane.js';
import type { FileBrowser } from '../ui/FileBrowser.js';
import type { SearchPanel } from '../ui/SearchPanel.js';
import type { Highlighter } from '../highlight/Highlighter.js';
import type { EditorMode } from '../ui/StatusBar.js';
import { renderStatusBar } from '../ui/StatusBar.js';
import { THEME, tokenColor } from '../highlight/tokens.js';
import type { LineTokens } from '../highlight/tokens.js';
import { TAB_CHAR_COUNT } from '../constants.js';
import { basename } from 'path';

export class Renderer {
  private term: Terminal;

  // Two virtual screens: current = what the terminal shows, next = what we want.
  private _current: ScreenBuffer;
  private _next: ScreenBuffer;
  // DrawContext writes into _next each frame.
  private _ctx: DrawContext;
  // On first render and after resize, emit clearScreen and force full repaint.
  private _needsClear = true;

  constructor(term: Terminal) {
    this.term = term;
    this._current = new ScreenBuffer(0, 0);
    this._next    = new ScreenBuffer(0, 0);
    this._ctx     = new DrawContext(this._next);
  }

  render(
    layout: Layout,
    fileBrowser: FileBrowser,
    searchPanel: SearchPanel,
    highlighter: Highlighter,
    mode: EditorMode,
    message: string
  ): void {
    const W = this.term.width;
    const H = this.term.height;

    // Resize buffers when the terminal dimensions change.
    if (W !== this._next.cols || H !== this._next.rows) {
      this._current.resize(H, W);
      this._next.resize(H, W);
      this._ctx = new DrawContext(this._next);
      this._needsClear = true;
    }

    // Reset _next to blank (THEME.bg background, THEME.fg text, space char).
    this._clearNext(W, H);
    this._ctx = new DrawContext(this._next);

    // Render all components into _next.
    for (let i = 0; i < layout.panes.length; i++) {
      const isActive = i === layout.activePaneIndex && !layout.browserFocused && !searchPanel.active;
      this._renderPane(layout.panes[i], isActive, highlighter);
    }
    this._renderSeparators(layout);
    if (layout.browserVisible) {
      this._renderFileBrowser(fileBrowser, layout, mode === 'filebrowser');
    }
    if (searchPanel.active) {
      this._renderSearchPanel(searchPanel, W, H);
    }
    renderStatusBar(this._ctx, layout, mode, highlighter, message, W, H);

    // Build the output: diff _current vs _next, emit only changed cells.
    let out = Terminal.hideCursor;
    if (this._needsClear) {
      out += Terminal.clearScreen;
      this._current.markDirty(); // ensure all cells are re-emitted
      this._needsClear = false;
    }
    out += this._diffOutput();
    out += Terminal.reset;

    // Place the real terminal cursor.
    if (!searchPanel.active) {
      const activePane = layout.activePane;
      if (activePane.buffer && !layout.browserFocused) {
        if (activePane.isCursorVisible()) {
          out += Terminal.moveTo(activePane.cursorAbsY() + 1, activePane.cursorAbsX() + 1);
          out += Terminal.showCursor;
        }
      }
    } else {
      const panelW   = Math.min(W - 4, 90);
      const panelX   = Math.floor((W - panelW) / 2);
      const panelY   = Math.floor(H * 0.15);
      const inputRow = panelY + 2;                              // 0-indexed row of search input
      const inputCol = panelX + 2 + searchPanel.needle.length; // 0-indexed col after "> " + needle
      out += Terminal.moveTo(inputRow + 1, inputCol + 1);       // +1: ANSI is 1-indexed
      out += Terminal.showCursor;
    }

    this.term.append(out);
    this.term.flush();

    // Commit: _next becomes the new current frame.
    this._current.copyFrom(this._next);
  }

  // ── virtual-screen diff ──────────────────────────────────────────────────

  private _diffOutput(): string {
    const H = this._next.rows;
    const W = this._next.cols;
    let out = '';

    let lastRow = -1;
    let lastCol = -1;

    // Track the style currently "live" in the terminal so we only emit
    // sequences when the style actually changes.
    let lastFg: RGB | null = null;
    let lastBg: RGB | null = null;
    let lastBold    = false;
    let lastDim     = false;
    let lastReverse = false;

    for (let r = 0; r < H; r++) {
      const curRow = this._current.cells[r];
      const nxtRow = this._next.cells[r];

      for (let c = 0; c < W; c++) {
        const cur = curRow[c];
        const nxt = nxtRow[c];

        if (cellsEqual(cur, nxt)) continue;

        // Emit cursor-move unless we're continuing a contiguous run on the
        // same row (avoids a moveTo for every consecutive changed cell).
        if (r !== lastRow || c !== lastCol + 1) {
          out += Terminal.moveTo(r + 1, c + 1);
        }

        // If any additive attribute (bold/dim/reverse) needs to be turned OFF,
        // we must reset first (there's no individual "off" sequence).
        const needsReset =
          (lastBold    && !nxt.bold)    ||
          (lastDim     && !nxt.dim)     ||
          (lastReverse && !nxt.reverse);

        if (needsReset) {
          out += Terminal.reset;
          lastFg = null; lastBg = null;
          lastBold = false; lastDim = false; lastReverse = false;
        }

        if (!rgbEqual(nxt.fg, lastFg)) { out += Terminal.fgRgb(nxt.fg); lastFg = nxt.fg; }
        if (!rgbEqual(nxt.bg, lastBg)) { out += Terminal.bgRgb(nxt.bg); lastBg = nxt.bg; }
        if (nxt.bold    && !lastBold)    { out += Terminal.bold;    lastBold    = true; }
        if (nxt.dim     && !lastDim)     { out += Terminal.dim;     lastDim     = true; }
        if (nxt.reverse && !lastReverse) { out += Terminal.reverse; lastReverse = true; }

        out += nxt.char;
        lastRow = r;
        lastCol = c;
      }
    }

    return out;
  }

  // ── blank-fill helpers ───────────────────────────────────────────────────

  /** Fill _next with blank cells (space, THEME.bg background). */
  private _clearNext(W: number, H: number): void {
    const blank = {
      char: ' ',
      fg: THEME.fg as RGB,
      bg: THEME.bg as RGB,
      bold: false, dim: false, reverse: false,
    };
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++)
        this._next.cells[r][c] = { ...blank };
  }

  // ── pane rendering ───────────────────────────────────────────────────────

  private _renderPane(pane: Pane, isActive: boolean, highlighter: Highlighter): void {
    const ctx = this._ctx;
    const { x, y, width, height } = pane;
    if (width <= 0 || height <= 0) return;

    // Title bar (row 0 of the pane).
    ctx.moveTo(y, x);
    ctx.setBg(isActive ? THEME.titleActiveBg : THEME.titleInactiveBg);
    ctx.setFg(isActive ? THEME.titleActiveFg : THEME.titleInactiveFg);
    if (isActive) ctx.setBold(true);

    const name = pane.buffer
      ? ` ${pane.buffer.filePath ?? pane.buffer.name}${pane.buffer.modified ? ' ●' : ''} `
      : ' [No File] ';
    ctx.write(fitStr(name, width));
    ctx.reset();

    // Content rows.
    const gw = pane.gutterWidth();
    const cw = pane.contentWidth();
    const ch = pane.contentHeight();

    for (let row = 0; row < ch; row++) {
      const lineNum   = pane.scrollLine + row;
      const screenRow = y + 1 + row; // +1 for title bar

      const isCursorLine = isActive && pane.buffer !== null && lineNum === pane.cursor.line;

      ctx.moveTo(screenRow, x);
      if (isCursorLine) {
        ctx.setBg(THEME.currentLineBg);
      } else {
        ctx.setBg(THEME.bg);
      }

      if (pane.buffer && lineNum < pane.buffer.lineCount) {
        // Gutter
        ctx.setFg(THEME.gutterFg);
        if (isCursorLine) ctx.setBold(true);
        const numStr = String(lineNum + 1).padStart(gw - 1) + ' ';
        ctx.write(numStr);
        ctx.reset();
        if (isCursorLine) ctx.setBg(THEME.currentLineBg);

        // Content
        const lineStr = pane.buffer.getLine(lineNum);
        const tokens  = highlighter.getTokensForLine(lineNum, pane.buffer);
        this._renderLine(lineStr, tokens, pane.scrollCol, cw, isActive, isCursorLine, pane.cursor.col);
      } else {
        // Past end of file
        ctx.setFg(THEME.gutterFg);
        ctx.setDim(true);
        ctx.write('~'.padEnd(gw));
        ctx.reset();
        if (isCursorLine) ctx.setBg(THEME.currentLineBg);
        ctx.write(' '.repeat(Math.max(0, cw)));
      }

      ctx.reset();
    }
  }

  private _renderLine(
    line: string,
    tokens: LineTokens,
    scrollCol: number,
    visibleWidth: number,
    isActive: boolean,
    isCursorLine: boolean,
    cursorCol: number
  ): void {
    const ctx = this._ctx;
    if (visibleWidth <= 0) return;

    // Build per-column token-type map.
    const len = line.length;
    const typeMap: string[] = new Array(len).fill('normal');
    for (const tok of tokens) {
      for (let ci = tok.start; ci < tok.start + tok.length && ci < len; ci++) {
        typeMap[ci] = tok.type;
      }
    }

    const visEnd = Math.min(scrollCol + visibleWidth, len);
    let lastType = '';
    let col = scrollCol;

    while (col < visEnd) {
      const isCursor = isActive && isCursorLine && col === cursorCol;
      const tokType  = typeMap[col] ?? 'normal';

      if (isCursor) {
        ctx.reset();
        ctx.setReverse(true);
        ctx.setFg(THEME.bg);
        ctx.write(line[col]);
        ctx.reset();
        if (isCursorLine) ctx.setBg(THEME.currentLineBg);
        lastType = '';
      } else {
        if (tokType !== lastType) {
          ctx.setFg(tokenColor(tokType as never));
          lastType = tokType;
        }
        ctx.write(line[col]);
      }
      col++;
    }

    // Padding / cursor past end of line.
    const rendered  = visEnd - scrollCol;
    const remaining = visibleWidth - rendered;

    if (remaining > 0) {
      if (isActive && isCursorLine && cursorCol >= visEnd && cursorCol - scrollCol < visibleWidth) {
        const spacesBeforeCursor = cursorCol - visEnd;
        ctx.reset();
        if (isCursorLine) ctx.setBg(THEME.currentLineBg);
        if (spacesBeforeCursor > 0) ctx.write(' '.repeat(spacesBeforeCursor));
        ctx.reset();
        ctx.setReverse(true);
        ctx.setFg(THEME.bg);
        ctx.write(' ');
        ctx.reset();
        if (isCursorLine) ctx.setBg(THEME.currentLineBg);
        const afterCursor = remaining - spacesBeforeCursor - 1;
        if (afterCursor > 0) ctx.write(' '.repeat(afterCursor));
      } else {
        ctx.reset();
        if (isCursorLine) ctx.setBg(THEME.currentLineBg);
        ctx.write(' '.repeat(remaining));
      }
    }
  }

  // ── separator rendering ──────────────────────────────────────────────────

  private _renderSeparators(layout: Layout): void {
    const ctx = this._ctx;
    const seps = layout.separators();

    for (const sep of seps) {
      ctx.setFg(THEME.borderInactive);
      ctx.setBg(THEME.bg);

      if (sep.type === 'vertical') {
        for (let row = sep.start; row <= sep.end; row++) {
          ctx.moveTo(row, sep.pos);
          ctx.write('│');
        }
      } else {
        ctx.moveTo(sep.pos, sep.start);
        ctx.write('─'.repeat(sep.end - sep.start + 1));
      }
      ctx.reset();
    }
  }

  // ── file browser rendering ───────────────────────────────────────────────

  private _renderFileBrowser(fb: FileBrowser, layout: Layout, isActive: boolean): void {
    const ctx = this._ctx;
    const bounds = layout.browserBounds();
    const { x, y, w, h } = bounds;
    if (w <= 0 || h <= 0) return;

    // Title
    ctx.moveTo(y, x);
    ctx.setBg(isActive ? THEME.titleActiveBg : THEME.titleInactiveBg);
    ctx.setFg(isActive ? THEME.titleActiveFg : THEME.titleInactiveFg);
    if (isActive) ctx.setBold(true);
    ctx.write(fitStr(' Files', w));
    ctx.reset();

    fb.adjustScroll(h - 1);

    // Entries
    for (let row = 0; row < h - 1; row++) {
      const entryIdx = fb.scrollOffset + row;
      const entry    = fb.entries[entryIdx];
      ctx.moveTo(y + 1 + row, x);

      const isSel = entryIdx === fb.selectedIndex && isActive;
      if (isSel) {
        ctx.setBg(THEME.selectionBg);
        ctx.setFg(THEME.fg);
      } else {
        ctx.setBg(THEME.bgAlt);
        if (entry?.isDir) {
          ctx.setFg(THEME.blue);
        } else {
          ctx.setFg(THEME.fgDim);
        }
      }

      if (entry) {
        const icon        = entry.isDir ? '▸ ' : '  ';
        const displayName = icon + entry.name;
        ctx.write(fitStr(displayName, w));
      } else {
        ctx.write(' '.repeat(w));
      }
      ctx.reset();
    }
  }

  // ── search panel rendering ───────────────────────────────────────────────

  private _renderSearchPanel(sp: SearchPanel, W: number, H: number): void {
    const ctx = this._ctx;

    const panelH = Math.min(Math.floor(H * 0.7), 30);
    const panelW = Math.min(W - 4, 90);
    const panelX = Math.floor((W - panelW) / 2);
    const panelY = Math.floor(H * 0.15);

    // Background fill
    ctx.setBg(THEME.surface0);
    ctx.setFg(THEME.fg);
    for (let row = 0; row < panelH; row++) {
      ctx.moveTo(panelY + row, panelX);
      ctx.write(' '.repeat(panelW));
    }

    // Title
    ctx.moveTo(panelY, panelX);
    ctx.setBg(THEME.surface1);
    ctx.setFg(THEME.blue);
    ctx.setBold(true);
    const title = sp.mode === 'file' ? ' Search in file ' : ' Search project ';
    ctx.write(fitStr(title, panelW));
    ctx.reset();

    // Search input (0-indexed row panelY+2, matching original 1-indexed T.moveTo(panelY+3,...))
    const inputRow = panelY + 2;
    ctx.moveTo(inputRow, panelX);
    ctx.setBg(THEME.surface1);
    ctx.setFg(THEME.fg);
    const prompt       = '> ';
    const inputDisplay = prompt + sp.needle;
    ctx.write(fitStr(inputDisplay, panelW));
    ctx.reset();

    // Separator
    ctx.moveTo(inputRow + 1, panelX);
    ctx.setFg(THEME.borderInactive);
    ctx.setBg(THEME.surface0);
    ctx.write('─'.repeat(panelW));
    ctx.reset();

    // Results
    if (sp.loading) {
      ctx.moveTo(inputRow + 2, panelX);
      ctx.setBg(THEME.surface0);
      ctx.setFg(THEME.overlay);
      ctx.write('  Searching...'.padEnd(panelW));
      ctx.reset();
    } else {
      const resultsH = panelH - 4;
      sp.adjustScroll(resultsH);

      for (let row = 0; row < resultsH; row++) {
        const idx    = sp.scrollOffset + row;
        const result = sp.results[idx];
        ctx.moveTo(inputRow + 3 + row, panelX);

        if (result) {
          const isSel = idx === sp.selectedIndex;
          if (isSel) {
            ctx.setBg(THEME.selectionBg);
            ctx.setFg(THEME.fg);
          } else {
            ctx.setBg(THEME.surface0);
            ctx.setFg(THEME.fgDim);
          }

          const path    = sp.getResultPath(result);
          const lineNo  = sp.getResultLine(result) + 1;
          const loc     = `${basename(path)}:${lineNo}`;
          // Snippet starts at visual col panelX + 1 (space) + loc.length + 2 (separator).
          // Pre-expand tabs from that col so slice/fitStr work in visual-width units.
          const snippetStartCol = panelX + loc.length + 3;
          const expandedSnippet = expandTabsFromCol(result.snippet.trimStart(), snippetStartCol);
          const snippet = expandedSnippet.slice(0, panelW - loc.length - 4);
          const entry   = ` ${loc}  ${snippet}`;
          ctx.write(fitStr(entry, panelW));
        } else {
          ctx.setBg(THEME.surface0);
          ctx.write(' '.repeat(panelW));
        }
        ctx.reset();
      }
    }

    // Result count footer
    ctx.moveTo(panelY + panelH - 1, panelX);
    ctx.setBg(THEME.surface1);
    ctx.setFg(THEME.overlay);
    const countStr = sp.results.length > 0
      ? ` ${sp.results.length} result${sp.results.length === 1 ? '' : 's'}`
      : sp.needle ? '  No results' : '  Type to search';
    ctx.write(fitStr(countStr, panelW));
    ctx.reset();
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Expand tab characters in `text` to spaces using TAB_CHAR_COUNT-column stops,
 *  starting from the given absolute screen column `startCol`. */
function expandTabsFromCol(text: string, startCol: number): string {
  let out = '';
  let col = startCol;
  for (const ch of text) {
    if (ch === '\t') {
      const spaces = TAB_CHAR_COUNT - (col % TAB_CHAR_COUNT);
      out += ' '.repeat(spaces);
      col += spaces;
    } else {
      out += ch;
      col++;
    }
  }
  return out;
}

function fitStr(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width);
  return s.padEnd(width);
}

function rgbEqual(a: RGB | null, b: RGB | null): boolean {
  if (a === null || b === null) return a === b;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}
