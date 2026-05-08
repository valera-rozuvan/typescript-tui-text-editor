// Node.js node:-prefixed module declarations for unit tests

declare module 'node:assert/strict' {
  namespace assert {
    function equal(actual: unknown, expected: unknown, message?: string | Error): void;
    function notEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    function deepEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    function deepStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    function ok(value: unknown, message?: string | Error): asserts value;
    function throws(fn: () => void, message?: string | Error): void;
    function rejects(fn: () => Promise<unknown>, message?: string | Error): Promise<void>;
    function fail(message?: string | Error): never;
    function match(value: string, regExp: RegExp): void;
  }
  export = assert;
}

declare module 'node:path' {
  export function basename(path: string, ext?: string): string;
  export function dirname(path: string): string;
  export function extname(path: string): string;
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
  export function relative(from: string, to: string): string;
  export function isAbsolute(path: string): boolean;
}

declare module 'node:os' {
  export function homedir(): string;
  export function tmpdir(): string;
  export function availableParallelism(): number;
}

declare module 'node:fs/promises' {
  export function readFile(path: string, encoding: 'utf8'): Promise<string>;
  export function writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>;
  export function mkdir(path: string, options: { recursive: boolean }): Promise<string | undefined>;
  export function mkdtemp(prefix: string): Promise<string>;
  export function rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
}

declare module 'node:fs' {
  export interface Stats {
    isFile(): boolean;
    isDirectory(): boolean;
    size: number;
  }
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function writeFileSync(path: string, data: string, encoding?: 'utf8'): void;
  export function statSync(path: string): Stats;
  export function existsSync(path: string): boolean;
  export function mkdtempSync(prefix: string): string;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): string | undefined;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
}
