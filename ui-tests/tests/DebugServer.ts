import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlink } from 'node:fs/promises';
import type { Server, Socket } from 'node:net';
import type { TerminalScreen } from './TerminalScreen.js';

type DebugMessage =
  | { type: 'step'; suite: string; test: string; action: string; screen: string[]; cursor: { row: number; col: number } }
  | { type: 'test_pass'; suite: string; test: string }
  | { type: 'test_fail'; suite: string; test: string; error: string }
  | { type: 'done' };

export class DebugServer {
  private _server: Server;
  private _socket: Socket | null = null;
  private _socketPath: string;
  private _suite = '';
  private _test = '';
  private _runToEnd = false;
  private _runAll = false;
  private _nextResolve: (() => void) | null = null;
  private _connectResolve: (() => void) | null = null;
  private _connectReject: ((e: Error) => void) | null = null;
  private _incomingBuf = '';

  constructor() {
    this._socketPath = join(tmpdir(), `node-text-editor-ui-debug-${process.pid}.sock`);
    this._server = createServer(this._onConnection.bind(this));
  }

  get path(): string { return this._socketPath; }

  async start(): Promise<void> {
    try { await unlink(this._socketPath); } catch {}
    return new Promise((resolve, reject) => {
      this._server.listen(this._socketPath, resolve as () => void);
      this._server.on('error', reject);
    });
  }

  waitForObserver(timeoutMs = 60000): Promise<void> {
    if (this._socket) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this._connectResolve = resolve;
      this._connectReject = reject;
      setTimeout(() => {
        this._connectReject?.(new Error(`No observer connected within ${timeoutMs}ms`));
        this._connectResolve = null;
        this._connectReject = null;
      }, timeoutMs);
    });
  }

  setContext(suite: string, test: string): void {
    this._suite = suite;
    this._test = test;
    this._runToEnd = false;
  }

  async notifyStep(action: string, screen: TerminalScreen): Promise<void> {
    if (!this._socket || this._runAll) return;
    const rows: string[] = [];
    for (let r = 0; r < screen.rows; r++) rows.push(screen.getLine(r));
    this._send({
      type: 'step',
      suite: this._suite,
      test: this._test,
      action,
      screen: rows,
      cursor: screen.getCursor(),
    });
    if (!this._runToEnd) {
      await this._waitForNext();
    }
  }

  notifyTestPass(suite: string, test: string): void {
    this._send({ type: 'test_pass', suite, test });
  }

  notifyTestFail(suite: string, test: string, error: string): void {
    this._send({ type: 'test_fail', suite, test, error });
  }

  notifyDone(): void {
    this._send({ type: 'done' });
  }

  async close(): Promise<void> {
    this._socket?.destroy();
    this._socket = null;
    await new Promise<void>(resolve => this._server.close(() => resolve()));
    try { await unlink(this._socketPath); } catch {}
  }

  private _onConnection(socket: Socket): void {
    this._socket = socket;
    this._connectResolve?.();
    this._connectResolve = null;
    this._connectReject = null;

    socket.on('data', (data: Buffer) => {
      this._incomingBuf += data.toString('utf8');
      const lines = this._incomingBuf.split('\n');
      this._incomingBuf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try { this._handleObserverMsg(JSON.parse(line)); } catch {}
      }
    });

    socket.on('close', () => {
      this._socket = null;
      this._runAll = true;
      this._nextResolve?.();
      this._nextResolve = null;
    });
  }

  private _handleObserverMsg(msg: { type: string }): void {
    if (msg.type === 'next') {
      this._nextResolve?.();
      this._nextResolve = null;
    } else if (msg.type === 'run') {
      this._runToEnd = true;
      this._nextResolve?.();
      this._nextResolve = null;
    } else if (msg.type === 'run_all') {
      this._runAll = true;
      this._nextResolve?.();
      this._nextResolve = null;
    }
  }

  private _waitForNext(): Promise<void> {
    return new Promise(resolve => { this._nextResolve = resolve; });
  }

  private _send(msg: DebugMessage): void {
    if (!this._socket) return;
    try { this._socket.write(JSON.stringify(msg) + '\n'); } catch {}
  }
}
