export class JsTransformPanel {
  active = false;
  lines: string[] = [];
  cursorLine = 0;
  cursorCol = 0;
  scrollLine = 0;

  private static readonly DEFAULT_LINES = [
    'function transform(line, lineNumber) {',
    '  return line;',
    '}',
  ];

  open(): void {
    this.active = true;
    this.lines = [...JsTransformPanel.DEFAULT_LINES];
    this.cursorLine = 1;
    this.cursorCol = this.lines[1].length;
    this.scrollLine = 0;
  }

  close(): void {
    this.active = false;
  }

  getCode(): string {
    return this.lines.join('\n');
  }

  insertChar(ch: string): void {
    const line = this.lines[this.cursorLine];
    this.lines[this.cursorLine] = line.slice(0, this.cursorCol) + ch + line.slice(this.cursorCol);
    this.cursorCol += ch.length;
  }

  insertNewline(): void {
    const line = this.lines[this.cursorLine];
    const before = line.slice(0, this.cursorCol);
    const after = line.slice(this.cursorCol);
    const indent = line.match(/^(\s*)/)?.[1] ?? '';
    this.lines[this.cursorLine] = before;
    this.lines.splice(this.cursorLine + 1, 0, indent + after);
    this.cursorLine += 1;
    this.cursorCol = indent.length;
  }

  deleteCharBefore(): void {
    if (this.cursorCol > 0) {
      const line = this.lines[this.cursorLine];
      this.lines[this.cursorLine] = line.slice(0, this.cursorCol - 1) + line.slice(this.cursorCol);
      this.cursorCol -= 1;
    } else if (this.cursorLine > 0) {
      const prevLine = this.lines[this.cursorLine - 1];
      const curLine = this.lines[this.cursorLine];
      this.lines[this.cursorLine - 1] = prevLine + curLine;
      this.lines.splice(this.cursorLine, 1);
      this.cursorLine -= 1;
      this.cursorCol = prevLine.length;
    }
  }

  moveUp(): void {
    if (this.cursorLine > 0) {
      this.cursorLine -= 1;
      this.cursorCol = Math.min(this.cursorCol, this.lines[this.cursorLine].length);
    }
  }

  moveDown(): void {
    if (this.cursorLine < this.lines.length - 1) {
      this.cursorLine += 1;
      this.cursorCol = Math.min(this.cursorCol, this.lines[this.cursorLine].length);
    }
  }

  moveLeft(): void {
    if (this.cursorCol > 0) {
      this.cursorCol -= 1;
    } else if (this.cursorLine > 0) {
      this.cursorLine -= 1;
      this.cursorCol = this.lines[this.cursorLine].length;
    }
  }

  moveRight(): void {
    const line = this.lines[this.cursorLine];
    if (this.cursorCol < line.length) {
      this.cursorCol += 1;
    } else if (this.cursorLine < this.lines.length - 1) {
      this.cursorLine += 1;
      this.cursorCol = 0;
    }
  }

  moveHome(): void {
    const line = this.lines[this.cursorLine];
    const firstNonWs = line.search(/\S/);
    if (firstNonWs >= 0 && this.cursorCol !== firstNonWs) {
      this.cursorCol = firstNonWs;
    } else {
      this.cursorCol = 0;
    }
  }

  moveEnd(): void {
    this.cursorCol = this.lines[this.cursorLine].length;
  }

  adjustScroll(visibleHeight: number): void {
    if (visibleHeight <= 0) return;
    if (this.cursorLine < this.scrollLine) {
      this.scrollLine = this.cursorLine;
    }
    if (this.cursorLine >= this.scrollLine + visibleHeight) {
      this.scrollLine = this.cursorLine - visibleHeight + 1;
    }
  }
}
