/* Minimal Node.js ambient type declarations for the ui-tests TypeScript compilation. */

/* ── Global Node.js types ──────────────────────────────────────────────────── */

declare class Buffer extends Uint8Array {
  static from(data: string, encoding?: string): Buffer;
  static from(data: ArrayBuffer | Uint8Array | Buffer | number[]): Buffer;
  toString(encoding?: string): string;
  get length(): number;
}

declare const process: {
  argv: string[];
  execPath: string;
  pid: number;
  platform: string;
  cwd(): string;
  exit(code?: number): never;
  env: Record<string, string | undefined>;
  stdin: {
    isTTY: boolean;
    setRawMode(mode: boolean): void;
    resume(): void;
    pause(): void;
    on(event: string, listener: (...args: unknown[]) => void): typeof process.stdin;
  };
  stdout: {
    write(data: string): boolean;
    columns?: number;
    rows?: number;
  };
  stderr: {
    write(data: string): boolean;
  };
  on(event: string, listener: (...args: unknown[]) => void): typeof process;
};

declare function setTimeout(fn: () => void, ms: number): symbol;
declare function clearTimeout(id: symbol | null): void;

declare namespace NodeJS {
  interface ErrnoException extends Error {
    code?: string;
    errno?: number;
    syscall?: string;
    path?: string;
  }
}

/* NodeRequire is referenced by createRequire return type */
interface NodeRequire {
  (id: string): unknown;
}

/* ── node: prefixed built-in modules ──────────────────────────────────────── */

declare module 'node:module' {
  function createRequire(filename: string | URL): NodeRequire;
  export { createRequire };
}

declare module 'node:url' {
  function fileURLToPath(url: string | URL): string;
  export { fileURLToPath };
}

declare module 'node:path' {
  export function basename(path: string, ext?: string): string;
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:fs' {
  export interface Stats {
    isFile(): boolean;
    isDirectory(): boolean;
    size: number;
  }
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function writeFileSync(path: string, data: string, encoding?: 'utf8'): void;
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): string | undefined;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  export function mkdtempSync(prefix: string): string;
  export function chmodSync(path: string, mode: number): void;
}

declare module 'node:fs/promises' {
  export function unlink(path: string): Promise<void>;
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>;
}

declare module 'node:net' {
  interface Socket {
    write(data: string | Buffer): boolean;
    destroy(): void;
    on(event: 'data', listener: (data: Buffer) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }
  interface Server {
    listen(path: string, callback?: () => void): this;
    close(callback?: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }
  function createServer(connectionListener?: (socket: Socket) => void): Server;
  export { createServer, Server, Socket };
}

declare module 'node:assert/strict' {
  namespace assert {
    function equal(actual: unknown, expected: unknown, message?: string | Error): void;
    function ok(value: unknown, message?: string | Error): asserts value;
    function fail(message?: string | Error): never;
  }
  export = assert;
}
