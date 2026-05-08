import { Terminal } from './Terminal.js';
import type { Layout } from '../ui/Layout.js';
import type { Pane } from '../ui/Pane.js';
import type { FileBrowser } from '../ui/FileBrowser.js';
import type { SearchPanel } from '../ui/SearchPanel.js';
import type { Highlighter } from '../highlight/Highlighter.js';
import type { EditorMode } from '../ui/StatusBar.js';
import { renderStatusBar } from '../ui/StatusBar.js';
import { THEME, tokenColor } from '../highlight/tokens.js';
import type { LineTokens } from '../highlight/tokens.js';
import { basename } from 'path';

const T = Terminal;

export class Renderer {
  private term: Terminal;

  constructor(term: Terminal) {
    this.term = term;
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
    let out = '';

    out += T.hideCursor;
    out += T.clearScreen;

    // Render panes
    for (let i = 0; i < layout.panes.length; i++) {
      const isActive = i === layout.activePaneIndex && !layout.browserFocused && !searchPanel.active;
      out += this._renderPane(layout.panes[i], isActive, highlighter);
    }

    // Render pane separators
    out += this._renderSeparators(layout);

    // Render file browser
    if (layout.browserVisible) {
      out += this._renderFileBrowser(fileBrowser, layout, mode === 'filebrowser');
    }

    // Render search panel overlay
    if (searchPanel.active) {
      out += this._renderSearchPanel(searchPanel, W, H);
    }

    // Status bar
    out += renderStatusBar(layout, mode, highlighter, message, W, H);

    // Place cursor
    if (!searchPanel.active) {
      const activePane = layout.activePane;
      if (activePane.buffer && !layout.browserFocused) {
        if (activePane.isCursorVisible()) {
          out += T.moveTo(activePane.cursorAbsY() + 1, activePane.cursorAbsX() + 1);
          out += T.showCursor;
        }
      }
    } else {
      // Cursor in search input
      const inputRow = Math.floor(H * 0.2) + 2;
      const inputCol = 3 + searchPanel.needle.length;
      out += T.moveTo(inputRow, inputCol + 1);
      out += T.showCursor;
    }

    this.term.append(out);
    this.term.flush();
  }

  private _renderPane(pane: Pane, isActive: boolean, highlighter: Highlighter): string {
    let out = '';
    const { x, y, width, height } = pane;
    if (width <= 0 || height <= 0) return '';

    // Title bar (row 0 of pane = screen row y)
    out += T.moveTo(y + 1, x + 1);
    out += T.bgRgb(isActive ? THEME.titleActiveBg : THEME.titleInactiveBg);
    out += T.fgRgb(isActive ? THEME.titleActiveFg : THEME.titleInactiveFg);
    if (isActive) out += T.bold;

    const name = pane.buffer
      ? ` ${pane.buffer.filePath ?? pane.buffer.name}${pane.buffer.modified ? ' ●' : ''} `
      : ' [No File] ';
    out += fitStr(name, width);
    out += T.reset;

    // Content rows
    const gw = pane.gutterWidth();
    const cw = pane.contentWidth();
    const ch = pane.contentHeight();

    for (let row = 0; row < ch; row++) {
      const lineNum = pane.scrollLine + row;
      const screenRow = y + 1 + row; // +1 for title bar
      out += T.moveTo(screenRow + 1, x + 1); // moveTo is 1-indexed

      const isCursorLine = isActive && pane.buffer !== null && lineNum === pane.cursor.line;

      if (isCursorLine) {
        out += T.bgRgb(THEME.currentLineBg);
      } else {
        out += T.bgRgb(THEME.bg);
      }

      if (pane.buffer && lineNum < pane.buffer.lineCount) {
        // Gutter
        out += T.fgRgb(THEME.gutterFg);
        if (isCursorLine) out += T.bold;
        const numStr = String(lineNum + 1).padStart(gw - 1) + ' ';
        out += numStr;
        out += T.reset;
        if (isCursorLine) out += T.bgRgb(THEME.currentLineBg);

        // Content
        const lineStr = pane.buffer.getLine(lineNum);
        const tokens = highlighter.getTokensForLine(lineNum, pane.buffer);
        out += this._renderLine(
          lineStr, tokens,
          pane.scrollCol, cw,
          isActive, isCursorLine, pane.cursor.col
        );
      } else {
        // Past end of file
        out += T.fgRgb(THEME.gutterFg);
        out += T.dim;
        out += '~'.padEnd(gw);
        out += T.reset;
        if (isCursorLine) out += T.bgRgb(THEME.currentLineBg);
        out += ' '.repeat(Math.max(0, cw));
      }

      out += T.reset;
    }

    return out;
  }

  private _renderLine(
    line: string,
    tokens: LineTokens,
    scrollCol: number,
    visibleWidth: number,
    isActive: boolean,
    isCursorLine: boolean,
    cursorCol: number
  ): string {
    if (visibleWidth <= 0) return '';
    let out = '';

    // Build per-column token type array
    const len = line.length;
    const typeMap: Array<string> = new Array(len).fill('normal');
    for (const tok of tokens) {
      for (let ci = tok.start; ci < tok.start + tok.length && ci < len; ci++) {
        typeMap[ci] = tok.type;
      }
    }

    const visEnd = Math.min(scrollCol + visibleWidth, len);
    let lastType = '';
    let col = scrollCol;

    // Render visible characters
    while (col < visEnd) {
      const isCursor = isActive && isCursorLine && col === cursorCol;
      const tokType = typeMap[col] ?? 'normal';

      if (isCursor) {
        out += T.reset;
        out += T.reverse;
        out += T.fgRgb(THEME.bg);
        out += line[col];
        out += T.reset;
        if (isCursorLine) out += T.bgRgb(THEME.currentLineBg);
        lastType = '';
      } else {
        if (tokType !== lastType) {
          const color = tokenColor(tokType as never);
          out += T.fgRgb(color);
          lastType = tokType;
        }
        out += line[col];
      }
      col++;
    }

    // Padding / cursor after end of line
    const rendered = visEnd - scrollCol;
    const remaining = visibleWidth - rendered;

    if (remaining > 0) {
      if (isActive && isCursorLine && cursorCol >= visEnd && cursorCol - scrollCol < visibleWidth) {
        // Cursor is past end of line — show it as a space
        const spacesBeforeCursor = cursorCol - visEnd;
        out += T.reset;
        if (isCursorLine) out += T.bgRgb(THEME.currentLineBg);
        if (spacesBeforeCursor > 0) out += ' '.repeat(spacesBeforeCursor);
        out += T.reset;
        out += T.reverse;
        out += T.fgRgb(THEME.bg);
        out += ' ';
        out += T.reset;
        if (isCursorLine) out += T.bgRgb(THEME.currentLineBg);
        const afterCursor = remaining - spacesBeforeCursor - 1;
        if (afterCursor > 0) out += ' '.repeat(afterCursor);
      } else {
        out += T.reset;
        if (isCursorLine) out += T.bgRgb(THEME.currentLineBg);
        out += ' '.repeat(remaining);
      }
    }

    return out;
  }

  private _renderSeparators(layout: Layout): string {
    let out = '';
    const seps = layout.separators();

    for (const sep of seps) {
      out += T.fgRgb(THEME.borderInactive);
      out += T.bgRgb(THEME.bg);

      if (sep.type === 'vertical') {
        for (let row = sep.start; row <= sep.end; row++) {
          out += T.moveTo(row + 1, sep.pos + 1);
          out += '│';
        }
      } else {
        // Horizontal
        out += T.moveTo(sep.pos + 1, sep.start + 1);
        out += '─'.repeat(sep.end - sep.start + 1);
      }
      out += T.reset;
    }

    return out;
  }

  private _renderFileBrowser(fb: FileBrowser, layout: Layout, isActive: boolean): string {
    let out = '';
    const bounds = layout.browserBounds();
    const { x, y, w, h } = bounds;
    if (w <= 0 || h <= 0) return '';

    // Title
    out += T.moveTo(y + 1, x + 1);
    out += T.bgRgb(isActive ? THEME.titleActiveBg : THEME.titleInactiveBg);
    out += T.fgRgb(isActive ? THEME.titleActiveFg : THEME.titleInactiveFg);
    if (isActive) out += T.bold;
    out += fitStr(' Files', w);
    out += T.reset;

    fb.adjustScroll(h - 1);

    // Entries
    for (let row = 0; row < h - 1; row++) {
      const entryIdx = fb.scrollOffset + row;
      const entry = fb.entries[entryIdx];
      out += T.moveTo(y + 1 + row + 1, x + 1);

      const isSel = entryIdx === fb.selectedIndex && isActive;
      if (isSel) {
        out += T.bgRgb(THEME.selectionBg);
        out += T.fgRgb(THEME.fg);
      } else {
        out += T.bgRgb(THEME.bgAlt);
        if (entry?.isDir) {
          out += T.fgRgb(THEME.blue);
        } else {
          out += T.fgRgb(THEME.fgDim);
        }
      }

      if (entry) {
        const icon = entry.isDir ? '▸ ' : '  ';
        const displayName = icon + entry.name;
        out += fitStr(displayName, w);
      } else {
        out += ' '.repeat(w);
      }
      out += T.reset;
    }

    return out;
  }

  private _renderSearchPanel(sp: SearchPanel, W: number, H: number): string {
    let out = '';

    // Panel dimensions
    const panelH = Math.min(Math.floor(H * 0.7), 30);
    const panelW = Math.min(W - 4, 90);
    const panelX = Math.floor((W - panelW) / 2);
    const panelY = Math.floor(H * 0.15);

    // Background fill
    out += T.bgRgb(THEME.surface0);
    for (let row = 0; row < panelH; row++) {
      out += T.moveTo(panelY + row + 1, panelX + 1);
      out += ' '.repeat(panelW);
    }

    // Title
    out += T.moveTo(panelY + 1, panelX + 1);
    out += T.bgRgb(THEME.surface1);
    out += T.fgRgb(THEME.blue);
    out += T.bold;
    const title = sp.mode === 'file' ? ' Search in file ' : ' Search project ';
    out += fitStr(title, panelW);
    out += T.reset;

    // Search input
    const inputRow = panelY + 2;
    out += T.moveTo(inputRow + 1, panelX + 1);
    out += T.bgRgb(THEME.surface1);
    out += T.fgRgb(THEME.fg);
    const prompt = '> ';
    const inputDisplay = prompt + sp.needle;
    out += fitStr(inputDisplay, panelW);
    out += T.reset;

    // Separator
    out += T.moveTo(inputRow + 2, panelX + 1);
    out += T.fgRgb(THEME.borderInactive);
    out += T.bgRgb(THEME.surface0);
    out += '─'.repeat(panelW);
    out += T.reset;

    // Results
    if (sp.loading) {
      out += T.moveTo(inputRow + 3, panelX + 1);
      out += T.bgRgb(THEME.surface0);
      out += T.fgRgb(THEME.overlay);
      out += '  Searching...'.padEnd(panelW);
      out += T.reset;
    } else {
      const resultsH = panelH - 4;
      sp.adjustScroll(resultsH);

      for (let row = 0; row < resultsH; row++) {
        const idx = sp.scrollOffset + row;
        const result = sp.results[idx];
        out += T.moveTo(inputRow + 3 + row + 1, panelX + 1);

        if (result) {
          const isSel = idx === sp.selectedIndex;
          if (isSel) {
            out += T.bgRgb(THEME.selectionBg);
            out += T.fgRgb(THEME.fg);
          } else {
            out += T.bgRgb(THEME.surface0);
            out += T.fgRgb(THEME.fgDim);
          }

          const path = sp.getResultPath(result);
          const lineNo = sp.getResultLine(result) + 1;
          const loc = `${basename(path)}:${lineNo}`;
          const snippet = result.snippet.trimStart().slice(0, panelW - loc.length - 4);
          const entry = ` ${loc}  ${snippet}`;
          out += fitStr(entry, panelW);
        } else {
          out += T.bgRgb(THEME.surface0);
          out += ' '.repeat(panelW);
        }
        out += T.reset;
      }
    }

    // Result count
    out += T.moveTo(panelY + panelH, panelX + 1);
    out += T.bgRgb(THEME.surface1);
    out += T.fgRgb(THEME.overlay);
    const countStr = sp.results.length > 0
      ? ` ${sp.results.length} result${sp.results.length === 1 ? '' : 's'}`
      : sp.needle ? '  No results' : '  Type to search';
    out += fitStr(countStr, panelW);
    out += T.reset;

    return out;
  }
}

function fitStr(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width);
  return s.padEnd(width);
}
