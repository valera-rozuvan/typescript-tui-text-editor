// Module-level resize dispatch — exactly one listener on process.stdout and one
// on SIGWINCH regardless of how many Terminal instances exist.  This prevents
// the MaxListeners warning when tests (or other code) create multiple instances.
const _instances = new Set<Terminal>();
let _resizeListenersInstalled = false;

function _installResizeListeners(): void {
  if (_resizeListenersInstalled) return;
  _resizeListenersInstalled = true;
  const dispatch = () => {
    for (const t of _instances) t._onResize();
  };
  process.on('SIGWINCH', dispatch);          // POSIX
  process.stdout.on('resize', dispatch);     // Windows + POSIX (Node.js v12+)
}

export class Terminal {
  private _width = 80;
  private _height = 24;
  private _buf = '';
  private _resizeCallbacks: Array<() => void> = [];

  constructor() {
    this._updateSize();
    _instances.add(this);
    _installResizeListeners();
  }

  /** Called by the module-level resize dispatcher. Not part of the public API. */
  _onResize(): void {
    this._updateSize();
    for (const cb of this._resizeCallbacks) cb();
  }

  private _updateSize(): void {
    const envCols = parseInt(process.env['COLUMNS'] ?? '', 10);
    const envRows = parseInt(process.env['LINES'] ?? '', 10);
    this._width  = process.stdout.columns
      ?? (Number.isFinite(envCols) && envCols > 0 ? envCols : 80);
    this._height = process.stdout.rows
      ?? (Number.isFinite(envRows) && envRows > 0 ? envRows : 24);
  }

  get width(): number { return this._width; }
  get height(): number { return this._height; }

  onResize(cb: () => void): void {
    this._resizeCallbacks.push(cb);
  }

  enableRawMode(): void {
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
  }

  disableRawMode(): void {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
  }

  append(s: string): void { this._buf += s; }

  flush(): void {
    if (this._buf.length > 0) {
      process.stdout.write(this._buf);
      this._buf = '';
    }
  }

  write(s: string): void {
    process.stdout.write(s);
  }

  static get hideCursor(): string { return '\x1b[?25l'; }
  static get showCursor(): string { return '\x1b[?25h'; }
  static get clearScreen(): string { return '\x1b[2J\x1b[H'; }
  static get clearToEOL(): string { return '\x1b[K'; }
  static get reset(): string { return '\x1b[0m'; }
  static get bold(): string { return '\x1b[1m'; }
  static get dim(): string { return '\x1b[2m'; }
  static get italic(): string { return '\x1b[3m'; }
  static get underline(): string { return '\x1b[4m'; }
  static get reverse(): string { return '\x1b[7m'; }

  static moveTo(row: number, col: number): string {
    return `\x1b[${row};${col}H`;
  }

  static fg(r: number, g: number, b: number): string {
    return `\x1b[38;2;${r};${g};${b}m`;
  }

  static bg(r: number, g: number, b: number): string {
    return `\x1b[48;2;${r};${g};${b}m`;
  }

  static fgRgb(rgb: [number,number,number]): string {
    return Terminal.fg(rgb[0], rgb[1], rgb[2]);
  }

  static bgRgb(rgb: [number,number,number]): string {
    return Terminal.bg(rgb[0], rgb[1], rgb[2]);
  }
}
