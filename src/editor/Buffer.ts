import { writeFile, mkdir, stat } from 'fs/promises';
import { openSync, readSync, closeSync } from 'fs';
import { basename, dirname } from 'path';

const LAZY_THRESHOLD = 5000; // lines: files below this are loaded eagerly
const CACHE_SIZE = 2000;     // max LRU line cache entries for lazy buffers
const SCAN_CHUNK = 65536;    // 64 KB per scan pass

export class Buffer {
  private _lines: string[] = [''];
  private _fd: number | null = null;
  private _lineOffsets: number[] = [];
  private _fileSize: number = 0;
  private _lineCache: Map<number, string> = new Map();
  private _fullyLoaded: boolean = true;

  filePath: string | null = null;
  modified = false;
  readOnly = false;
  lineEnding: '\r\n' | '\n' = '\n';

  constructor(content = '') {
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    this._lines = normalized === '' ? [''] : normalized.split('\n');
    this._fullyLoaded = true;
  }

  // ── public lines getter/setter ──────────────────────────────────────────────
  // All external callers (Editor.ts, unit tests) use buf.lines; the getter
  // transparently materializes a lazy buffer on first access.

  get lines(): string[] {
    if (!this._fullyLoaded) this._materializeSync();
    return this._lines;
  }

  set lines(val: string[]) {
    this._lines = val;
    this._fullyLoaded = true;
    if (this._fd !== null) { closeSync(this._fd); this._fd = null; }
    this._lineCache.clear();
  }

  // ── factory ─────────────────────────────────────────────────────────────────

  static async fromFile(filePath: string): Promise<Buffer> {
    const buf = new Buffer();
    buf.filePath = filePath;

    try {
      const fd = openSync(filePath, 'r');
      buf._lineOffsets = [0]; // line 0 always starts at byte 0

      const chunkBuf = new Uint8Array(SCAN_CHUNK);
      let pos = 0;
      let totalSize = 0;
      let lineEndingDetected = false;

      // Streaming scan: find every 0x0A byte to record line-start offsets.
      // Peak memory: one 64 KB chunk, not the whole file.
      while (true) {
        const bytesRead = readSync(fd, chunkBuf, 0, SCAN_CHUNK, pos);
        if (bytesRead === 0) break;
        if (!lineEndingDetected) {
          const sample = new TextDecoder('utf-8').decode(chunkBuf.subarray(0, bytesRead));
          buf.lineEnding = sample.includes('\r\n') ? '\r\n' : '\n';
          lineEndingDetected = true;
        }
        for (let i = 0; i < bytesRead; i++) {
          if (chunkBuf[i] === 0x0A) {
            buf._lineOffsets.push(totalSize + i + 1);
          }
        }
        totalSize += bytesRead;
        pos += bytesRead;
      }
      buf._fileSize = totalSize;

      // Files ending with \n produce a phantom entry (offset === fileSize).
      // Removing it mirrors the eager-mode `lines.pop()` for trailing empty element.
      if (buf._lineOffsets.length > 1 &&
          buf._lineOffsets[buf._lineOffsets.length - 1] === buf._fileSize) {
        buf._lineOffsets.pop();
      }
      if (buf._lineOffsets.length === 0) buf._lineOffsets = [0];

      try {
        const s = await stat(filePath);
        if ((s.mode & 0o222) === 0) buf.readOnly = true;
      } catch { /* non-fatal */ }

      buf._fd = fd;
      buf._fullyLoaded = false;

      // Below the threshold, materialize immediately so the fd is not left open
      // and the buffer behaves identically to eager mode for small files.
      if (buf._lineOffsets.length < LAZY_THRESHOLD) {
        buf._materializeSync();
      }

    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      buf._lines = [''];
      buf._fullyLoaded = true;
    }

    return buf;
  }

  // ── accessors ────────────────────────────────────────────────────────────────

  get lineCount(): number {
    if (this._fullyLoaded) return this._lines.length;
    return this._lineOffsets.length;
  }

  getLine(n: number): string {
    if (this._fullyLoaded) return this._lines[n] ?? '';
    if (n < 0 || n >= this._lineOffsets.length) return '';

    // LRU cache hit: move to MRU end
    const cached = this._lineCache.get(n);
    if (cached !== undefined) {
      this._lineCache.delete(n);
      this._lineCache.set(n, cached);
      return cached;
    }

    // Cache miss: synchronous random-access read from the open fd.
    // Callers on the render path (Renderer, Pane, HighlightCache) are synchronous,
    // so this must remain synchronous.
    const start = this._lineOffsets[n];
    const end = this._lineOffsets[n + 1] ?? this._fileSize;
    const len = end - start;
    if (len <= 0) {
      this._lineCache.set(n, '');
      return '';
    }
    const rawBuf = new Uint8Array(len);
    readSync(this._fd!, rawBuf, 0, len, start);
    // Strip the trailing \n (and optional \r) included in the byte range
    const line = new TextDecoder('utf-8').decode(rawBuf).replace(/\r?\n$/, '');

    this._lineCache.set(n, line);
    if (this._lineCache.size > CACHE_SIZE) {
      // Evict least-recently-used (Map preserves insertion order)
      const lruKey = this._lineCache.keys().next().value as number;
      this._lineCache.delete(lruKey);
    }
    return line;
  }

  get name(): string {
    return this.filePath ? basename(this.filePath) : '[No Name]';
  }

  // ── mutation methods ─────────────────────────────────────────────────────────
  // Each method materializes the buffer on first mutation so subsequent accesses
  // operate entirely on the in-memory _lines array.

  insert(line: number, col: number, text: string): void {
    if (!this._fullyLoaded) this._materializeSync();
    if (line >= this._lines.length) return;
    const l = this._lines[line];
    this._lines[line] = l.slice(0, col) + text + l.slice(col);
    this.modified = true;
  }

  deleteChar(line: number, col: number): void {
    if (!this._fullyLoaded) this._materializeSync();
    if (line >= this._lines.length) return;
    const l = this._lines[line];
    if (col < 0 || col >= l.length) return;
    this._lines[line] = l.slice(0, col) + l.slice(col + 1);
    this.modified = true;
  }

  deleteCharBefore(line: number, col: number): { line: number; col: number } {
    if (!this._fullyLoaded) this._materializeSync();
    if (col > 0) {
      const l = this._lines[line];
      this._lines[line] = l.slice(0, col - 1) + l.slice(col);
      this.modified = true;
      return { line, col: col - 1 };
    } else if (line > 0) {
      const prev = this._lines[line - 1];
      const cur = this._lines[line];
      const newCol = prev.length;
      this._lines[line - 1] = prev + cur;
      this._lines.splice(line, 1);
      this.modified = true;
      return { line: line - 1, col: newCol };
    }
    return { line, col };
  }

  insertNewline(line: number, col: number): void {
    if (!this._fullyLoaded) this._materializeSync();
    if (line >= this._lines.length) return;
    const l = this._lines[line];
    const indent = l.match(/^(\s*)/)?.[1] ?? '';
    const after = l.slice(col);
    this._lines[line] = l.slice(0, col);
    this._lines.splice(line + 1, 0, indent + after);
    this.modified = true;
  }

  indentAt(line: number): number {
    const l = this.getLine(line);
    return l.match(/^(\s*)/)?.[1].length ?? 0;
  }

  // ── serialisation ────────────────────────────────────────────────────────────

  toString(): string {
    return this.lines.join(this.lineEnding) + this.lineEnding;
  }

  async save(): Promise<void> {
    if (!this.filePath) return;
    // Materialize before writing so the fd is closed on Windows (file lock)
    // and the full content is available for toString().
    if (!this._fullyLoaded) this._materializeSync();
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, this.toString(), 'utf8');
    this.modified = false;
  }

  // ── lifecycle ────────────────────────────────────────────────────────────────

  /** Force full load into memory now. No-op if already loaded. */
  materialize(): void {
    if (!this._fullyLoaded) this._materializeSync();
  }

  /** Release the open file descriptor. Call when the buffer is removed from all panes. */
  close(): void {
    if (this._fd !== null) { closeSync(this._fd); this._fd = null; }
    this._lineCache.clear();
  }

  // ── private ──────────────────────────────────────────────────────────────────

  private _materializeSync(): void {
    if (this._fullyLoaded) return;
    const count = this._lineOffsets.length;
    const result: string[] = new Array(count);
    for (let n = 0; n < count; n++) {
      const cached = this._lineCache.get(n);
      if (cached !== undefined) {
        result[n] = cached;
        continue;
      }
      const start = this._lineOffsets[n];
      const end = this._lineOffsets[n + 1] ?? this._fileSize;
      const len = end - start;
      if (len <= 0) {
        result[n] = '';
        continue;
      }
      const rawBuf = new Uint8Array(len);
      readSync(this._fd!, rawBuf, 0, len, start);
      result[n] = new TextDecoder('utf-8').decode(rawBuf).replace(/\r?\n$/, '');
    }
    this._lines = result;
    this._fullyLoaded = true;
    if (this._fd !== null) { closeSync(this._fd); this._fd = null; }
    this._lineCache.clear();
  }
}
