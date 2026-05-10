import { readFile, writeFile, mkdir, stat } from 'fs/promises';
import { basename, dirname } from 'path';

export class Buffer {
  lines: string[];
  filePath: string | null = null;
  modified = false;
  readOnly = false;

  constructor(content = '') {
    this.lines = content === '' ? [''] : content.split('\n');
  }

  static async fromFile(filePath: string): Promise<Buffer> {
    const buf = new Buffer();
    buf.filePath = filePath;
    let fileExists = true;
    try {
      const content = await readFile(filePath, 'utf8');
      const lines = content.split('\n');
      // Files typically end with \n, which creates a trailing empty element — remove it
      if (lines.length > 1 && lines[lines.length - 1] === '') {
        lines.pop();
      }
      buf.lines = lines.length > 0 ? lines : [''];
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      buf.lines = [''];
      fileExists = false;
    }
    if (fileExists) {
      try {
        const s = await stat(filePath);
        // Check mode bits directly: root bypasses access() W_OK checks,
        // so we treat a file with no write bits as read-only regardless of UID.
        if ((s.mode & 0o222) === 0) buf.readOnly = true;
      } catch {
        // stat failure is non-fatal; leave readOnly = false
      }
    }
    return buf;
  }

  get lineCount(): number { return this.lines.length; }

  getLine(n: number): string {
    return this.lines[n] ?? '';
  }

  get name(): string {
    return this.filePath ? basename(this.filePath) : '[No Name]';
  }

  insert(line: number, col: number, text: string): void {
    if (line >= this.lines.length) return;
    const l = this.lines[line];
    this.lines[line] = l.slice(0, col) + text + l.slice(col);
    this.modified = true;
  }

  deleteChar(line: number, col: number): void {
    if (line >= this.lines.length) return;
    const l = this.lines[line];
    if (col < 0 || col >= l.length) return;
    this.lines[line] = l.slice(0, col) + l.slice(col + 1);
    this.modified = true;
  }

  // Delete char before cursor (backspace). Returns new cursor position.
  deleteCharBefore(line: number, col: number): { line: number; col: number } {
    if (col > 0) {
      const l = this.lines[line];
      this.lines[line] = l.slice(0, col - 1) + l.slice(col);
      this.modified = true;
      return { line, col: col - 1 };
    } else if (line > 0) {
      const prev = this.lines[line - 1];
      const cur = this.lines[line];
      const newCol = prev.length;
      this.lines[line - 1] = prev + cur;
      this.lines.splice(line, 1);
      this.modified = true;
      return { line: line - 1, col: newCol };
    }
    return { line, col };
  }

  // Insert newline at position. Cursor should move to (line+1, 0) after this.
  insertNewline(line: number, col: number): void {
    if (line >= this.lines.length) return;
    const l = this.lines[line];
    // Carry forward indentation from current line
    const indent = l.match(/^(\s*)/)?.[1] ?? '';
    const after = l.slice(col);
    this.lines[line] = l.slice(0, col);
    this.lines.splice(line + 1, 0, indent + after);
    this.modified = true;
  }

  // How many leading spaces the newline inserts (to position cursor after indent)
  indentAt(line: number): number {
    const l = this.lines[line];
    return l.match(/^(\s*)/)?.[1].length ?? 0;
  }

  toString(): string {
    return this.lines.join('\n') + '\n';
  }

  async save(): Promise<void> {
    if (!this.filePath) return;
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, this.toString(), 'utf8');
    this.modified = false;
  }
}
