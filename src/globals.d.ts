// Minimal Node.js ambient type declarations (no @types/node required)

declare const process: {
  argv: string[];
  cwd(): string;
  exit(code?: number): never;
  env: Record<string, string | undefined>;
  stdin: {
    isTTY: boolean;
    setRawMode(mode: boolean): void;
    resume(): void;
    pause(): void;
    on(event: 'data',    listener: (data: Uint8Array) => void): typeof process.stdin;
    on(event: 'end',     listener: () => void): typeof process.stdin;
    on(event: string,    listener: (...args: unknown[]) => void): typeof process.stdin;
  };
  stdout: {
    write(data: string): boolean;
    columns?: number;
    rows?: number;
  };
  stderr: {
    write(data: string): boolean;
  };
  on(event: 'SIGTERM' | 'SIGINT' | 'SIGWINCH', listener: () => void): typeof process;
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

declare module 'fs' {
  export interface Stats {
    isFile(): boolean;
    isDirectory(): boolean;
    size: number;
  }
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function statSync(path: string): Stats;
  export function existsSync(path: string): boolean;
}

declare module 'fs/promises' {
  export function readFile(path: string, encoding: 'utf8'): Promise<string>;
  export function writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>;
  export function mkdir(path: string, options: { recursive: boolean }): Promise<string | undefined>;
}

declare module 'path' {
  export function basename(path: string, ext?: string): string;
  export function dirname(path: string): string;
  export function extname(path: string): string;
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
  export function relative(from: string, to: string): string;
  export function isAbsolute(path: string): boolean;
}

declare module 'os' {
  export function homedir(): string;
  export function tmpdir(): string;
}
