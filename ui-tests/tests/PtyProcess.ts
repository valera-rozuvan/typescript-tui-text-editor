import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const _require = createRequire(import.meta.url);
const _dirname = dirname(fileURLToPath(import.meta.url));

interface PtyNative {
  spawn(execPath: string, args: string[], cols: number, rows: number): { fd: number; pid: number };
  write(fd: number, data: Buffer): void;
  read(fd: number): Buffer | null;
  resize(fd: number, cols: number, rows: number): void;
  kill(pid: number, signal?: number): void;
  waitpid(pid: number, nonblocking?: boolean): { exited: boolean; code: number };
  close(fd: number): void;
}

const native = _require(
  join(_dirname, '../pty/build/Release/pty_native.node')
) as PtyNative;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class PtyProcess {
  private fd: number;
  private pid: number;
  private _closed = false;

  readonly cols: number;
  readonly rows: number;

  constructor(execPath: string, args: string[] = [], cols = 120, rows = 30) {
    this.cols = cols;
    this.rows = rows;
    const result = native.spawn(execPath, args, cols, rows);
    this.fd = result.fd;
    this.pid = result.pid;
  }

  write(data: string | Buffer): void {
    if (this._closed) return;
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    native.write(this.fd, buf);
  }

  /* Non-blocking read — returns null when no data is available. */
  readSync(): string | null {
    if (this._closed) return null;
    const chunk = native.read(this.fd);
    if (chunk === null || chunk.length === 0) return null;
    return chunk.toString('utf8');
  }

  /*
   * Accumulates all output until the PTY is silent for `idleMs` milliseconds,
   * or `maxWaitMs` elapses in total.  Uses a 15 ms event-loop yield between
   * polls so callers can use async/await naturally.
   */
  async readOutput(idleMs = 250, maxWaitMs = 6000): Promise<string> {
    let result = '';
    const deadline = Date.now() + maxWaitMs;
    let lastDataAt = -1;

    while (Date.now() < deadline) {
      const chunk = this.readSync();
      if (chunk !== null) {
        result += chunk;
        lastDataAt = Date.now();
      } else {
        if (lastDataAt >= 0 && Date.now() - lastDataAt >= idleMs) break;
        await sleep(15);
      }
    }
    return result;
  }

  isAlive(): boolean {
    if (this._closed) return false;
    const { exited } = native.waitpid(this.pid, true);
    return !exited;
  }

  resize(cols: number, rows: number): void {
    if (!this._closed) native.resize(this.fd, cols, rows);
  }

  kill(signal = 15): void {
    if (!this._closed) {
      try { native.kill(this.pid, signal); } catch {}
    }
  }

  close(): void {
    if (!this._closed) {
      this._closed = true;
      try { native.close(this.fd); } catch {}
    }
  }

  /* Send SIGTERM + SIGKILL then block until the child exits. */
  cleanup(): void {
    if (this._closed) return;
    try { native.kill(this.pid, 15); } catch {}
    try { native.kill(this.pid, 9); } catch {}
    try { native.waitpid(this.pid, false); } catch {}
    this.close();
  }
}
