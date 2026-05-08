import { resolve, dirname } from 'path';
import { Terminal } from '../terminal/Terminal.js';
import { parseKeys } from '../terminal/Input.js';
import type { KeyEvent } from '../terminal/Input.js';
import { Renderer } from '../terminal/Renderer.js';
import { Buffer } from './Buffer.js';
import { Layout } from '../ui/Layout.js';
import { FileBrowser } from '../ui/FileBrowser.js';
import { SearchPanel } from '../ui/SearchPanel.js';
import { Highlighter } from '../highlight/Highlighter.js';
import type { EditorMode } from '../ui/StatusBar.js';
import { searchInBuffers } from '../search/FileSearch.js';
import { searchProject } from '../search/ProjectSearch.js';
import type { FileSearchResult } from '../search/FileSearch.js';
import type { ProjectSearchResult } from '../search/ProjectSearch.js';

export class Editor {
  private term = new Terminal();
  private layout = new Layout();
  private fileBrowser: FileBrowser;
  private searchPanel = new SearchPanel();
  private highlighter = new Highlighter();
  private renderer: Renderer;
  private mode: EditorMode = 'edit';
  private message = '';
  private messageTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private _projectSearchCancel: { cancelled: boolean } | null = null;

  // All buffers opened during this session, in order of first open.
  private openBuffers: Buffer[] = [];
  // Saved cursor/scroll position per buffer so cycling restores state.
  private bufferCursorState = new Map<Buffer, { line: number; col: number; scrollLine: number; scrollCol: number }>();

  constructor() {
    this.fileBrowser = new FileBrowser(process.cwd());
    this.renderer = new Renderer(this.term);
    this.term.onResize(() => {
      this.layout.update(this.term.width, this.term.height);
      this.render();
    });
  }

  async openFile(filePath: string): Promise<void> {
    const absPath = resolve(filePath);
    const buf = await Buffer.fromFile(absPath);
    this.highlighter.onFilePathChange(buf);
    this._registerBuffer(buf);
    const pane = this.layout.activePane;
    pane.buffer = buf;
    pane.cursor.setPos(0, 0);
    pane.scrollLine = 0;
    pane.scrollCol = 0;
  }

  openBuffer(buf: Buffer): void {
    this._registerBuffer(buf);
    const pane = this.layout.activePane;
    pane.buffer = buf;
    pane.cursor.setPos(0, 0);
    pane.scrollLine = 0;
    pane.scrollCol = 0;
  }

  private _registerBuffer(buf: Buffer): void {
    if (!this.openBuffers.includes(buf)) {
      this.openBuffers.push(buf);
    }
  }

  private _cycleBuffer(direction: 1 | -1): void {
    if (this.openBuffers.length <= 1) return;
    const pane = this.layout.activePane;
    const cur = pane.buffer;
    // Save current cursor/scroll state.
    if (cur) {
      this.bufferCursorState.set(cur, {
        line: pane.cursor.line,
        col: pane.cursor.col,
        scrollLine: pane.scrollLine,
        scrollCol: pane.scrollCol,
      });
    }
    const idx = cur ? this.openBuffers.indexOf(cur) : -1;
    const newIdx = idx === -1
      ? (direction > 0 ? 0 : this.openBuffers.length - 1)
      : (idx + direction + this.openBuffers.length) % this.openBuffers.length;
    const next = this.openBuffers[newIdx];
    if (next === cur) return;
    pane.buffer = next;
    this.highlighter.onFilePathChange(next);
    const saved = this.bufferCursorState.get(next);
    if (saved) {
      pane.cursor.setPos(saved.line, saved.col);
      pane.scrollLine = saved.scrollLine;
      pane.scrollCol = saved.scrollCol;
    } else {
      pane.cursor.setPos(0, 0);
      pane.scrollLine = 0;
      pane.scrollCol = 0;
    }
  }

  start(): void {
    this.running = true;
    this.layout.update(this.term.width, this.term.height);
    this.term.enableRawMode();

    process.on('SIGTERM', () => this.quit());
    process.on('SIGINT', () => this.quit());

    process.stdin.on('data', (data: Uint8Array) => {
      const events = parseKeys(data);
      for (const ev of events) {
        this.handleKey(ev);
      }
    });

    process.stdin.on('end', () => this.quit());

    // Initial render
    this.render();
  }

  private quit(): void {
    this.running = false;
    this.term.disableRawMode();
    this.term.write(Terminal.showCursor);
    this.term.write(Terminal.clearScreen);
    process.exit(0);
  }

  private showMessage(msg: string, durationMs = 3000): void {
    this.message = msg;
    if (this.messageTimer) clearTimeout(this.messageTimer);
    this.messageTimer = setTimeout(() => {
      this.message = '';
      this.render();
    }, durationMs);
  }

  private render(): void {
    this.renderer.render(
      this.layout,
      this.fileBrowser,
      this.searchPanel,
      this.highlighter,
      this.mode,
      this.message
    );
  }

  private handleKey(ev: KeyEvent): void {
    switch (this.mode) {
      case 'edit':        this.handleEditKey(ev); break;
      case 'filebrowser': this.handleBrowserKey(ev); break;
      case 'search':      this.handleSearchKey(ev); break;
    }
    this.render();
  }

  private handleEditKey(ev: KeyEvent): void {
    const { key, ctrl, alt } = ev;

    if (ctrl) {
      switch (key) {
        case 'q': this.quit(); return;

        case 's': {
          const buf = this.layout.activePane.buffer;
          if (buf) {
            buf.save().then(() => this.showMessage(`Saved: ${buf.name}`)).catch(err => {
              this.showMessage(`Error saving: ${err.message}`);
            });
          }
          return;
        }

        case 'b':
          this.layout.toggleBrowser();
          this.mode = this.layout.browserVisible ? 'filebrowser' : 'edit';
          return;

        case 'f':
          this.searchPanel.open('file');
          this.mode = 'search';
          this._runFileSearch();
          return;

        case 'p':
          this.searchPanel.open('project');
          this.mode = 'search';
          return;

        case 'n': this.layout.nextPane(); return;
        case 'N': this.layout.prevPane(); return;
        case 'w': this._closeActivePane(); return;

        case '1': this.layout.setMode('single'); return;
        case '2': this.layout.setMode('hsplit2'); return;
        case '3': this.layout.setMode('vsplit2'); return;
        case '4': this.layout.setMode('quad'); return;

        case 'left':  {
          const p = this.layout.activePane;
          if (p.buffer) { p.cursor.moveWordLeft(p.buffer); p.scrollToCursor(); }
          return;
        }
        case 'right': {
          const p = this.layout.activePane;
          if (p.buffer) { p.cursor.moveWordRight(p.buffer); p.scrollToCursor(); }
          return;
        }

        case 'home': {
          const p = this.layout.activePane;
          if (p.buffer) { p.cursor.setPos(0, 0); p.scrollToCursor(); }
          return;
        }
        case 'end': {
          const p = this.layout.activePane;
          if (p.buffer) {
            const last = p.buffer.lineCount - 1;
            p.cursor.setPos(last, p.buffer.getLine(last).length);
            p.scrollToCursor();
          }
          return;
        }
      }
      return; // ignore other ctrl combos
    }

    if (alt) {
      switch (key) {
        case 'left':  this._cycleBuffer(-1); return;
        case 'right': this._cycleBuffer(1);  return;
      }
      return; // ignore other alt combos
    }

    const pane = this.layout.activePane;
    const buf = pane.buffer;

    switch (key) {
      case 'up':
        if (buf) { pane.cursor.moveUp(buf); pane.scrollToCursor(); }
        break;
      case 'down':
        if (buf) { pane.cursor.moveDown(buf); pane.scrollToCursor(); }
        break;
      case 'left':
        if (buf) { pane.cursor.moveLeft(buf); pane.scrollToCursor(); }
        break;
      case 'right':
        if (buf) { pane.cursor.moveRight(buf); pane.scrollToCursor(); }
        break;

      case 'home':
        if (buf) { pane.cursor.moveToLineStart(); pane.scrollToCursor(); }
        break;
      case 'end':
        if (buf) { pane.cursor.moveToLineEnd(buf); pane.scrollToCursor(); }
        break;

      case 'pageup':
        if (buf) {
          const pg = pane.contentHeight();
          pane.cursor.moveUp(buf, pg);
          pane.scrollLine = Math.max(0, pane.scrollLine - pg);
          pane.scrollToCursor();
        }
        break;
      case 'pagedown':
        if (buf) {
          const pg = pane.contentHeight();
          pane.cursor.moveDown(buf, pg);
          pane.scrollToCursor();
        }
        break;

      case 'enter':
        if (buf) {
          const { line, col } = pane.cursor;
          buf.insertNewline(line, col);
          // Move cursor to start of new line + indent
          const indent = buf.indentAt(line + 1);
          pane.cursor.setPos(line + 1, indent);
          this.highlighter.invalidateFrom(line, buf);
          pane.scrollToCursor();
        }
        break;

      case 'backspace':
        if (buf) {
          const { line, col } = pane.cursor;
          const newPos = buf.deleteCharBefore(line, col);
          pane.cursor.setPos(newPos.line, newPos.col);
          this.highlighter.invalidateFrom(newPos.line, buf);
          pane.scrollToCursor();
        }
        break;

      case 'delete':
        if (buf) {
          const { line, col } = pane.cursor;
          const lineStr = buf.getLine(line);
          if (col < lineStr.length) {
            buf.deleteChar(line, col);
            this.highlighter.invalidateFrom(line, buf);
          } else if (line < buf.lineCount - 1) {
            // Join with next line
            buf.deleteChar(line, col); // this will join lines since col=len
            // Actually deleteChar won't join — we need to do it differently
            // Merge next line into current
            const nextLine = buf.getLine(line + 1);
            buf.lines[line] = lineStr + nextLine;
            buf.lines.splice(line + 1, 1);
            buf.modified = true;
            this.highlighter.invalidateFrom(line, buf);
          }
          pane.scrollToCursor();
        }
        break;

      case 'tab':
        if (buf) {
          const { line, col } = pane.cursor;
          const spaces = '  '; // 2-space indent
          buf.insert(line, col, spaces);
          pane.cursor.setPos(line, col + spaces.length);
          this.highlighter.invalidateFrom(line, buf);
          pane.scrollToCursor();
        }
        break;

      case 'escape':
        // Clear message or deselect
        this.message = '';
        break;

      default:
        // Printable character insertion
        if (ev.char && ev.char.length > 0 && !ctrl && !alt) {
          if (buf) {
            const { line, col } = pane.cursor;
            buf.insert(line, col, ev.char);
            pane.cursor.setPos(line, col + ev.char.length);
            this.highlighter.invalidateFrom(line, buf);
            pane.scrollToCursor();
          } else {
            // Open a new unnamed buffer on first keypress
            const newBuf = new Buffer('');
            pane.buffer = newBuf;
            const { line, col } = pane.cursor;
            newBuf.insert(line, col, ev.char);
            pane.cursor.setPos(line, col + ev.char.length);
            pane.scrollToCursor();
          }
        }
        break;
    }
  }

  private handleBrowserKey(ev: KeyEvent): void {
    const { key, ctrl } = ev;

    if (key === 'escape' || (ctrl && key === 'b')) {
      this.layout.browserVisible = false;
      this.layout.browserFocused = false;
      this.layout.update(this.term.width, this.term.height);
      this.mode = 'edit';
      return;
    }

    switch (key) {
      case 'up':    this.fileBrowser.moveUp(); break;
      case 'down':  this.fileBrowser.moveDown(); break;

      case 'enter': {
        const sel = this.fileBrowser.selected;
        if (!sel) break;
        if (sel.isDir) {
          this.fileBrowser.navigateInto();
        } else {
          // Capture the target pane now; activePane may change before the async load completes.
          const targetPane = this.layout.activePane;
          this.layout.browserFocused = false;
          this.mode = 'edit';
          Buffer.fromFile(sel.fullPath).then(buf => {
            this.highlighter.onFilePathChange(buf);
            this._registerBuffer(buf);
            targetPane.buffer = buf;
            targetPane.cursor.setPos(0, 0);
            targetPane.scrollLine = 0;
            targetPane.scrollCol = 0;
            this.render();
          }).catch(err => {
            this.showMessage(`Error opening: ${err.message}`);
          });
        }
        break;
      }

      case 'backspace': this.fileBrowser.goUp(); break;

      case 'tab': {
        // Switch focus back to editor pane without closing browser
        this.layout.browserFocused = false;
        this.mode = 'edit';
        break;
      }
    }
  }

  private handleSearchKey(ev: KeyEvent): void {
    const { key, ctrl, char } = ev;

    if (key === 'escape' || (ctrl && key === 'f') || (ctrl && key === 'p')) {
      this.searchPanel.close();
      this.mode = 'edit';
      return;
    }

    switch (key) {
      case 'backspace':
        this.searchPanel.deleteChar();
        this._runSearch();
        break;

      case 'up':
        this.searchPanel.moveUp();
        break;

      case 'down':
        this.searchPanel.moveDown();
        break;

      case 'enter': {
        const result = this.searchPanel.selected;
        if (result) {
          this._jumpToResult(result);
          this.searchPanel.close();
          this.mode = 'edit';
        } else if (this.searchPanel.mode === 'project') {
          this._runProjectSearch();
        }
        break;
      }

      default:
        if (char && char.length > 0 && !ctrl) {
          this.searchPanel.appendChar(char);
          this._runSearch();
        }
        break;
    }
  }

  private _runSearch(): void {
    if (this.searchPanel.mode === 'file') {
      this._runFileSearch();
    } else {
      this._runProjectSearch();
    }
  }

  private _runFileSearch(): void {
    const buffers = this.layout.panes.map(p => p.buffer).filter(Boolean) as Buffer[];
    const results = searchInBuffers(this.searchPanel.needle, buffers);
    this.searchPanel.setResults(results);
  }

  private _runProjectSearch(): void {
    if (this._projectSearchCancel) {
      this._projectSearchCancel.cancelled = true;
    }
    const signal = { cancelled: false };
    this._projectSearchCancel = signal;

    const needle = this.searchPanel.needle;
    if (!needle) return;

    this.searchPanel.loading = true;
    const activeBuffer = this.layout.activePane.buffer;
    const startDir = activeBuffer?.filePath
      ? dirname(resolve(activeBuffer.filePath))
      : process.cwd();

    searchProject(needle, startDir, (results) => {
      if (!signal.cancelled) {
        this.searchPanel.updateResults(results);
        this.render();
      }
    }, signal).then(() => {
      if (!signal.cancelled) {
        this.searchPanel.loading = false;
        this.render();
      }
    }).catch(() => {
      if (!signal.cancelled) {
        this.searchPanel.setResults([]);
        this.render();
      }
    });
  }

  private _jumpToResult(result: FileSearchResult | ProjectSearchResult): void {
    if ('buffer' in result) {
      // File search result — buffer is already open
      const fileResult = result as FileSearchResult;
      const pane = this.layout.panes.find(p => p.buffer === fileResult.buffer) ?? this.layout.activePane;
      pane.cursor.setPos(fileResult.line, fileResult.col);
      pane.scrollToCursor();
    } else {
      // Project search result — need to open file
      const projResult = result as ProjectSearchResult;
      // Capture the target pane now; activePane may change before the async load completes.
      const targetPane = this.layout.activePane;
      Buffer.fromFile(projResult.filePath).then(buf => {
        this.highlighter.onFilePathChange(buf);
        this._registerBuffer(buf);
        targetPane.buffer = buf;
        targetPane.cursor.setPos(projResult.line, projResult.col);
        targetPane.scrollLine = 0;
        targetPane.scrollToCursor();
        this.render();
      }).catch(() => {});
    }
  }

  private _closeActivePane(): void {
    const idx = this.layout.activePaneIndex;
    const pane = this.layout.panes[idx];
    if (pane.buffer?.modified) {
      this.showMessage('Buffer modified! Save (Ctrl+S) before closing.');
      return;
    }
    const closedBuf = pane.buffer;
    pane.buffer = null;
    pane.cursor.setPos(0, 0);
    pane.scrollLine = 0;
    pane.scrollCol = 0;
    // Remove from the open-buffer list if no other pane is showing it.
    if (closedBuf && !this.layout.panes.some(p => p.buffer === closedBuf)) {
      const bIdx = this.openBuffers.indexOf(closedBuf);
      if (bIdx >= 0) this.openBuffers.splice(bIdx, 1);
      this.bufferCursorState.delete(closedBuf);
    }
  }
}
