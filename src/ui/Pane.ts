import { Buffer } from '../editor/Buffer.js';
import { Cursor } from '../editor/Cursor.js';

export class Pane {
  buffer: Buffer | null = null;
  cursor = new Cursor();
  scrollLine = 0;
  scrollCol = 0;

  // Screen-space rect (0-indexed)
  x = 0;
  y = 0;
  width = 80;
  height = 24;

  gutterWidth(): number {
    if (!this.buffer) return 4;
    return Math.max(3, String(this.buffer.lineCount).length) + 1;
  }

  contentWidth(): number {
    return this.width - this.gutterWidth();
  }

  // Height of content area (excluding title bar)
  contentHeight(): number {
    return Math.max(0, this.height - 1);
  }

  scrollToCursor(): void {
    const ch = this.contentHeight();
    const cw = this.contentWidth();

    if (this.cursor.line < this.scrollLine) {
      this.scrollLine = this.cursor.line;
    }
    if (this.cursor.line >= this.scrollLine + ch) {
      this.scrollLine = this.cursor.line - ch + 1;
    }

    if (this.cursor.col < this.scrollCol) {
      this.scrollCol = this.cursor.col;
    }
    if (this.cursor.col >= this.scrollCol + cw) {
      this.scrollCol = this.cursor.col - cw + 1;
    }
  }

  // Cursor position within content area (0-indexed, relative to pane)
  cursorPaneX(): number {
    return this.gutterWidth() + this.cursor.col - this.scrollCol;
  }

  cursorPaneY(): number {
    return 1 + this.cursor.line - this.scrollLine; // +1 for title bar
  }

  // Absolute screen position (0-indexed)
  cursorAbsX(): number { return this.x + this.cursorPaneX(); }
  cursorAbsY(): number { return this.y + this.cursorPaneY(); }

  isCursorVisible(): boolean {
    const px = this.cursorPaneX();
    const py = this.cursorPaneY();
    return px >= this.gutterWidth() && px < this.width &&
           py >= 1 && py < this.height;
  }
}
