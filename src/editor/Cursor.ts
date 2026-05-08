import { Buffer } from './Buffer.js';

export class Cursor {
  line = 0;
  col = 0;
  desiredCol = 0;

  clamp(buf: Buffer): void {
    this.line = Math.max(0, Math.min(this.line, buf.lineCount - 1));
    this.col = Math.max(0, Math.min(this.col, buf.getLine(this.line).length));
  }

  moveUp(buf: Buffer, count = 1): void {
    this.line = Math.max(0, this.line - count);
    this.col = Math.min(this.desiredCol, buf.getLine(this.line).length);
  }

  moveDown(buf: Buffer, count = 1): void {
    this.line = Math.min(buf.lineCount - 1, this.line + count);
    this.col = Math.min(this.desiredCol, buf.getLine(this.line).length);
  }

  moveLeft(buf: Buffer): void {
    if (this.col > 0) {
      this.col--;
    } else if (this.line > 0) {
      this.line--;
      this.col = buf.getLine(this.line).length;
    }
    this.desiredCol = this.col;
  }

  moveRight(buf: Buffer): void {
    const lineLen = buf.getLine(this.line).length;
    if (this.col < lineLen) {
      this.col++;
    } else if (this.line < buf.lineCount - 1) {
      this.line++;
      this.col = 0;
    }
    this.desiredCol = this.col;
  }

  moveToLineStart(): void {
    this.col = 0;
    this.desiredCol = 0;
  }

  moveToLineEnd(buf: Buffer): void {
    this.col = buf.getLine(this.line).length;
    this.desiredCol = this.col;
  }

  moveToFirstNonSpace(buf: Buffer): void {
    const l = buf.getLine(this.line);
    this.col = l.match(/^\s*/)?.[0].length ?? 0;
    this.desiredCol = this.col;
  }

  moveWordRight(buf: Buffer): void {
    let { line, col } = this;
    const l = buf.getLine(line);
    while (col < l.length && /\w/.test(l[col])) col++;
    while (col < l.length && !/\w/.test(l[col])) col++;
    if (col === l.length && line < buf.lineCount - 1) {
      line++;
      col = 0;
    }
    this.line = line;
    this.col = col;
    this.desiredCol = col;
  }

  moveWordLeft(buf: Buffer): void {
    let { line, col } = this;
    if (col === 0 && line > 0) {
      line--;
      col = buf.getLine(line).length;
    }
    const l = buf.getLine(line);
    while (col > 0 && !/\w/.test(l[col - 1])) col--;
    while (col > 0 && /\w/.test(l[col - 1])) col--;
    this.line = line;
    this.col = col;
    this.desiredCol = col;
  }

  setPos(line: number, col: number): void {
    this.line = line;
    this.col = col;
    this.desiredCol = col;
  }

  updateDesiredCol(): void {
    this.desiredCol = this.col;
  }
}
