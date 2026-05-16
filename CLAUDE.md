# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # install typescript (only dependency)
npm run build      # tsc — compile to dist/
npm run dev        # tsc --watch
npm start          # node dist/index.js (no file arg)
node dist/index.js [file]   # run the editor
npm run clean      # delete dist/, unit-tests/dist/, ui-tests/dist/, ui-tests/pty/build/, docker-logs/, node_modules/
```

## Architecture

A TUI text editor in TypeScript targeting Node v22, using raw terminal I/O and ANSI escape sequences. Zero runtime dependencies — only `typescript` as a devDependency. Node.js built-in types are declared locally in `src/globals.d.ts` (no `@types/node`).

```
src/
  globals.d.ts          — ambient Node.js type declarations (no @types/node)
  index.ts              — entry point
  util.ts               — pure stateless utilities: fitStr, expandTabs, clampScroll, sortByScore,
                          getIndent, getIndentLength, deleteCharBefore, insertNewlineWithIndent
  terminal/
    Terminal.ts         — ANSI helpers (static), buffered output (append+flush), resize events
    Input.ts            — raw Uint8Array → KeyEvent[] parser (CSI, SS3, UTF-8, Ctrl+*)
    ScreenBuffer.ts     — Cell type, ScreenBuffer (2D cell grid), DrawContext (stateful draw API)
    Renderer.ts         — virtual-screen diff renderer; renders into _next ScreenBuffer via DrawContext,
                          diffs against _current, emits only changed cells as ANSI sequences
  editor/
    Buffer.ts           — text buffer; small files (< LAZY_THRESHOLD=5000 lines) eagerly loaded
                          into string[]; large files keep an fd open and serve getLine() via
                          readSync + LRU cache (CACHE_SIZE=2000); materializes to string[] on first
                          mutation or full lines access; call close() when removing from openBuffers
    Cursor.ts           — line/col movement with desiredCol for up/down navigation
    Editor.ts           — event loop, key dispatch across edit/filebrowser/search/jstransform modes
  ui/
    Layout.ts           — pane geometry for single/hsplit2/vsplit2/quad + file browser side panel
    Pane.ts             — viewport/scroll into a Buffer; gutter width; cursor screen coords
    FileBrowser.ts      — directory listing with readdirSync, keyboard nav
    SearchPanel.ts      — search state (needle, results, selection); two modes: file and project
    StatusBar.ts        — bottom status row renderer
    JsTransformPanel.ts — inline JS code editor for applying line-by-line transforms to the active
                          buffer; own cursor/scroll state; opened via Alt+J in edit mode
  highlight/
    tokens.ts           — TokenType, Token, TokenizerState, Tokenizer interface, Catppuccin Mocha theme
    Cache.ts            — chunk-based highlight cache (CHUNK_SIZE=50); coarse tokenizer-state
                          checkpoints every CHECKPOINT_INTERVAL=100 chunks (5000 lines); background
                          build via setImmediate for large files — getTokensForLine returns [] (plain
                          text) while pending; fires setRedrawCallback when viewport chunk is ready;
                          invalidateFrom(line) on edit purges chunks + downstream checkpoints
    Highlighter.ts      — language detection by extension, WeakMap caches per Buffer
    languages/          — javascript.ts, typescript.ts (extends JS), c.ts, cpp.ts (extends C),
                          markdown.ts, html.ts, css.ts;
                          util.ts — shared tokenizer helpers: push, scanBlockComment,
                          scanLineComment, scanStringLiteral, scanIdentifierContext, scanNumber
  search/
    FuzzyMatcher.ts     — subsequence fuzzy match with consecutive/word-boundary scoring
    FileSearch.ts       — fuzzy search across open buffers
    ProjectSearch.ts    — walks up to .git/ root, reads files, fuzzy matches line by line;
                          searchProject() takes an onResults callback + cancellation signal for
                          incremental/non-blocking results
```

## Key Bindings

| Key | Action |
|-----|--------|
| Ctrl+S | Save file |
| Ctrl+Q | Quit |
| Ctrl+B | Toggle file browser |
| Ctrl+F | In-file fuzzy search |
| Ctrl+P | Project-wide search |
| Ctrl+N | Next pane |
| Ctrl+Shift+N | Previous pane (requires Kitty keyboard protocol) |
| Ctrl+W | Close active pane buffer |
| Alt+→ | Next open buffer in active pane |
| Alt+← | Previous open buffer in active pane |
| Alt+J | Open JS Transform Panel |
| Alt+J (in JS Transform) | Run transform & close panel |
| Alt+C (in JS Transform) | Cancel / close panel |
| Alt+1/2/3/4 | Layout: single / hsplit2 / vsplit2 / quad |
| Ctrl+←/→ | Word navigation |
| Ctrl+Home/End | File start/end |
| Arrow keys | Move cursor |
| Home/End | Line start/end |
| Page Up/Down | Scroll page |
| Tab | Insert a literal tab character (`\t`) |

## Testing

### Unit tests

```bash
npm test              # compile tests + run sequentially
npm run test:parallel # compile tests + run in parallel
```

Tests are TypeScript files in `unit-tests/tests/*.test.ts`, compiled by a dedicated `unit-tests/tsconfig.json` to `unit-tests/dist/`. The runner (`unit-tests/runner.mjs`) discovers compiled `*.test.js` files there. Each test file exports `suite: string` and `tests: TestCase[]` (from `unit-tests/tests/types.ts`).

Node.js `node:`-prefixed built-in types for tests live in `unit-tests/globals.d.ts` (separate from `src/globals.d.ts`). When a test uses a new Node.js API, add its declaration there.

### UI tests (end-to-end)

```bash
npm run ui-test:build                              # build N-API PTY addon + compile TS tests (first-time / after PTY changes)
npm run ui-test                                    # compile TypeScript tests + run all suites
npm run ui-test:debug                             # compile + run all suites in debug mode
npm run ui-test:suite <name>                      # compile + run one suite
npm run ui-test:suite:debug <name>                # compile + run one suite in debug mode
node ui-tests/runner.mjs --no-build               # skip recompilation, run all suites
node ui-tests/runner.mjs --suite <name>           # run one suite
node ui-tests/runner.mjs --debug --suite <name>   # step-through debug mode
```

UI tests spawn the editor inside a real PTY (via a C N-API addon wrapping `forkpty`), inject keystrokes, and assert on screen content and saved file contents. They live in `ui-tests/tests/NN_name.test.ts` and are auto-discovered by the runner.

Available suites: `startup`, `text_input`, `multipane`, `file_search`, `project_search`, `search_cursor`, `scroll_rendering`, `scroll_rendering_c_code`, `readonly_file`, `file_browser`, `js_transform`, `tab_navigation`, `multi_pane`.

### Running all tests together

`scripts/run-tests.mjs` (used inside the Docker images and via `npm run all-tests`) runs unit tests (sequential + parallel) and all UI suites in one shot and prints a combined pass/fail summary.

## Rendering Model

The renderer uses a **virtual-screen diff** approach to minimise terminal I/O:

1. **`_next: ScreenBuffer`** — each `render()` call resets this to blank cells and writes the full desired frame into it via `DrawContext` (stateful: position + fg/bg/bold/dim/reverse).
2. **`_current: ScreenBuffer`** — holds the last frame that was actually sent to the terminal.
3. **Diff** — `_diffOutput()` walks every cell; for each cell where `next ≠ current` it emits `moveTo + style + char`. Consecutive changed cells on the same row with the same style are batched (no redundant `moveTo` or style sequences).
4. **Swap** — after flushing, `_current.copyFrom(_next)` so the next diff is against the just-painted frame.
5. **First render / resize** — `_needsClear = true` causes a `clearScreen` to be prepended and `_current.markDirty()` (sentinel cells) to force every cell to be re-emitted.

`StatusBar.ts` accepts a `DrawContext` directly (not the old `Terminal`-based string return) so it participates in the same cell-grid system.

## Tab Expansion

Tab characters use **fixed-width expansion**: every `\t` always expands to exactly `TAB_CHAR_COUNT` (8) spaces, regardless of the current screen column. This differs from standard terminal tab-stop behaviour (which snaps to the next multiple of 8).

The constant lives in `src/constants.ts` and is imported wherever tabs are rendered:

- `DrawContext.write()` in `src/terminal/ScreenBuffer.ts` — expands `\t` to `TAB_CHAR_COUNT` spaces when writing cells into the virtual screen buffer.
- `expandTabs()` in `src/util.ts` — same rule for search-panel snippet display (called from `Renderer.ts`).
- `TerminalScreen.feed()` in `ui-tests/tests/TerminalScreen.ts` — same rule in the PTY output parser used by UI tests.

The UI test suite `tab_navigation` verifies this behaviour end-to-end: it reads the raw PTY screen content and asserts that every tab-expanded region is exactly `TAB_CHAR_COUNT` space characters wide.

## Important Notes

- **No `@types/node`** — all Node.js types are hand-declared in `src/globals.d.ts`. When adding code that uses new Node.js APIs, add the declaration there first.
- **`Buffer` naming** — our text buffer class is `Buffer` in `editor/Buffer.ts`. The stdin callback in `Editor.ts` uses `Uint8Array` (Node's Buffer is a Uint8Array subclass) to avoid the name collision.
- **Highlight cache invalidation** — always call `highlighter.invalidateFrom(line, buf)` after any buffer mutation that changes token boundaries (insert, delete, newline).
- **ESM imports** — all intra-project imports must use `.js` extensions (NodeNext module resolution).
- **`Buffer.save()` auto-mkdir** — `save()` calls `mkdir(dirname(filePath), { recursive: true })` before writing, so saving to a new path with missing parent directories works automatically.
- **`searchProject` API** — signature is `(needle, startDir, onResults, signal, maxResults?)`. Pass a mutable `{ cancelled: boolean }` object as the signal; set `.cancelled = true` to abort. `onResults` is called with partial results every 20 files and once on completion.
- **Buffer lazy loading** — files ≥ 5000 lines keep an open fd and serve `getLine()` via `readSync` + LRU cache; they materialize (all lines loaded into memory, fd closed) automatically on first mutation or when the `lines` getter is accessed. Always call `buf.close()` when removing a buffer from `openBuffers` to release the fd (important on Windows, which locks open files).
- **HighlightCache redraw callback** — when opening a buffer, call `highlighter.getCache(buf).setRedrawCallback(() => this.render())`; when closing it, call `setRedrawCallback(null)`. The callback fires when the background tokenizer build reaches the checkpoint covering the current viewport, replacing the initial plain-text render with highlighted output.
- **FileSearch and lazy buffers** — `searchInBuffer` calls `buf.materialize()` before iterating lines. Without this, a search over a large lazy buffer would issue one `readSync` per cache miss (~1 M calls for a 1 M-line file).

---

## Windows Platform

The editor supports Windows 10 build 1809+ natively. This section documents every Windows-specific code path, why it exists, and how it works.

### What works without changes

Node.js v22 on Windows handles several things transparently:

- `process.stdin.setRawMode()` — implemented via `uv_tty_set_mode`; works identically to POSIX.
- ANSI escape sequences — Node.js automatically calls `SetConsoleMode` with `ENABLE_VIRTUAL_TERMINAL_PROCESSING` on Windows TTY handles, so all colour and cursor ANSI codes render correctly in Windows Terminal and modern `conhost.exe`.
- `process.stdout.columns` / `.rows` — works on Windows.
- All `fs/promises` APIs (`readFile`, `writeFile`, `mkdir`, `stat`) — fully cross-platform in Node.js.
- `SIGINT` — emitted correctly on Windows from Ctrl+C.

### Terminal resize — `src/terminal/Terminal.ts`

**Problem:** `SIGWINCH` is a POSIX signal. Node.js does not deliver it on Windows, so `process.on('SIGWINCH', ...)` is silently ignored. Without a resize handler the layout freezes at the initial window size.

**Fix:** `Terminal.ts` registers two resize listeners in the constructor:

```ts
// POSIX resize signal (Linux / macOS)
process.on('SIGWINCH', () => {
  this._updateSize();
  for (const cb of this._resizeCallbacks) cb();
});

// Windows (and harmless duplicate on POSIX) — Node.js v12+
process.stdout.on('resize', () => {
  this._updateSize();
  for (const cb of this._resizeCallbacks) cb();
});
```

`process.stdout` emits `'resize'` cross-platform whenever the TTY dimensions change. On Linux and macOS both listeners may fire; `_updateSize()` is idempotent so double-firing is harmless.

**globals.d.ts** — `process.stdout.on(event: 'resize', ...)` and `process.stdout.on(event: string, ...)` must be declared here because the project uses hand-written ambient types instead of `@types/node`.

### SIGTERM guard — `src/editor/Editor.ts`

**Problem:** Registering a `SIGTERM` handler does not throw on Windows, but the handler is never called. `SIGTERM` is only meaningful on POSIX.

**Fix:** The `start()` method guards the registration:

```ts
process.on('SIGINT', () => this.quit());
if (process.platform !== 'win32') {
  process.on('SIGTERM', () => this.quit());
}
```

`process.platform` is declared in `src/globals.d.ts` as `string`.

### CRLF line-ending handling — `src/editor/Buffer.ts`

**Problem:** Windows files conventionally use `\r\n` line endings. `content.split('\n')` leaves a trailing `\r` on every line, which renders as a visible character and corrupts cursor positions.

**Fix (read side, constructor):** The constructor normalises the in-memory string before splitting:

```ts
const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
this._lines = normalized === '' ? [''] : normalized.split('\n');
```

The double replace — `\r\n` first, bare `\r` second — handles CRLF (Windows), CR-only (old Mac OS 9), and mixed-ending files in one pass.

**Fix (read side, `fromFile`):** `fromFile` now uses a streaming byte-scan (`openSync` + `readSync` in 64 KB chunks) to build the line-offset index without loading the whole file. CRLF detection is done on the first decoded chunk:

```ts
const sample = new TextDecoder('utf-8').decode(chunkBuf.subarray(0, bytesRead));
buf.lineEnding = sample.includes('\r\n') ? '\r\n' : '\n';
```

`getLine()` strips `\r?\n$` from each byte range it reads so `\r` never appears in line content regardless of file encoding.

**Fix (write side):** `Buffer` carries a `lineEnding: '\r\n' | '\n'` field (default `'\n'`). `fromFile` detects the original style from the first chunk (see above).

`toString()` uses it when joining:

```ts
toString(): string {
  return this.lines.join(this.lineEnding) + this.lineEnding;
}
```

`save()` calls `toString()`, so CRLF files are saved back as CRLF with no extra code. New buffers created via the constructor default to `'\n'`; set `buf.lineEnding = '\r\n'` manually if you need CRLF output from an in-memory buffer.

**Unit tests** — `unit-tests/tests/buffer-crlf.test.ts` covers: constructor normalisation, `fromFile` detection, `toString` round-trip for both CRLF and LF files, and manually overriding `lineEnding`.

### Path display normalisation — `src/utils/displayPath.ts`

**Problem:** `path.resolve()` on Windows returns backslash-separated paths (`C:\Users\…\file.ts`). These look foreign in the status bar and search results for users accustomed to forward slashes.

**Fix:** A small helper converts separators only in display contexts:

```ts
export function displayPath(p: string): string {
  return process.platform === 'win32' ? p.replace(/\\/g, '/') : p;
}
```

It is imported and called in:

- `src/ui/StatusBar.ts` — wraps `buf.filePath` before rendering the status line.
- `src/ui/SearchPanel.ts` — wraps `result.filePath` in `getResultPath()`.

File I/O is never routed through `displayPath`; it is used exclusively where a string is written to the virtual screen buffer.

### UI test PTY addon — `ui-tests/pty/`

The UI tests spawn the editor inside a pseudo-terminal and assert on screen content. The POSIX implementation (`pty.c`) wraps `forkpty()`, which does not exist on Windows. A separate Windows implementation (`pty_win.c`) uses **anonymous pipes with `STARTF_USESTDHANDLES`** to capture the child's stdin/stdout directly.

#### Why pipes instead of ConPTY

Windows 10 build 1809+ introduced `CreatePseudoConsole` (ConPTY), but when the parent process is also Node.js, ConPTY does not correctly isolate the child's console: the child's stdout flows to the parent process's console (bypassing the ConPTY output pipe) instead of through `hOutRead`. Simple anonymous pipes avoid this problem entirely and work reliably.

The editor does not need a real PTY to function inside the test harness:
- `process.stdout.isTTY` is `undefined` (not a terminal), so `setRawMode` is skipped and the editor still renders via `process.stdout.write()`.
- Terminal dimensions are supplied via `COLUMNS` and `LINES` environment variables (set in `build_env_block()`); `Terminal._updateSize()` falls back to these when `process.stdout.columns/rows` are `undefined`.
- Keystrokes written to the stdin pipe are delivered to `process.stdin` 'data' events immediately (no line-buffering for a pipe).

#### Session table

`pty_win.c` maintains a global table of up to 64 active sessions:

```c
typedef struct {
    BOOL   active;
    HANDLE hPipeWrite; // parent writes here → child's stdin pipe
    HANDLE hPipeRead;  // parent reads here  ← child's stdout pipe
    HANDLE hProcess;   // child process handle
    HANDLE hThread;    // child thread handle
    DWORD  dwPid;      // Windows process ID
} PtySession;
```

`spawn()` returns `{ fd, pid }` where `fd` is a 1-based index into this table (not a real file descriptor) and `pid` is the Windows process ID from `CreateProcess`.

#### Pipe topology

```
parent hPipeWrite → hStdinRead  (child reads stdin from here)
                    hStdinWrite ← closed in child (not needed)

child hStdoutWrite → hStdoutRead ← parent hPipeRead
```

Two anonymous pipes are created. The child-side ends (`hStdinRead`, `hStdoutWrite`) are passed via `STARTUPINFOEXW.hStdInput/hStdOutput/hStdError` and marked inheritable. The parent-side ends (`hPipeWrite`, `hPipeRead`) are made non-inheritable. After `CreateProcessW`, the child-side ends are closed in the parent.

#### Non-blocking read

POSIX `read()` with `O_NONBLOCK` returns `EAGAIN` when no data is available. The Windows equivalent is `PeekNamedPipe()` to check the byte count first:

```c
DWORD available = 0;
if (!PeekNamedPipe(s->hPipeRead, NULL, 0, NULL, &available, NULL) || available == 0) {
    return null; // no data
}
ReadFile(s->hPipeRead, buf, min(available, sizeof(buf)), &n, NULL);
```

#### Process creation with pipe-based stdio

`CreateProcessW` uses `STARTF_USESTDHANDLES` and `PROC_THREAD_ATTRIBUTE_HANDLE_LIST` to pass exactly the child-side pipe handles, preventing all other parent handles from being inherited:

```c
HANDLE inherit_list[2] = { hStdinRead, hStdoutWrite };
// ... initialize attr_list, add PROC_THREAD_ATTRIBUTE_HANDLE_LIST ...

STARTUPINFOEXW si = { 0 };
si.StartupInfo.cb         = sizeof(si);
si.StartupInfo.dwFlags    = STARTF_USESTDHANDLES;
si.StartupInfo.hStdInput  = hStdinRead;
si.StartupInfo.hStdOutput = hStdoutWrite;
si.StartupInfo.hStdError  = hStdoutWrite; // merge stderr
si.lpAttributeList        = attr_list;

CreateProcessW(NULL, wcmd, NULL, NULL, TRUE /* bInheritHandles */,
    EXTENDED_STARTUPINFO_PRESENT | CREATE_UNICODE_ENVIRONMENT | CREATE_NO_WINDOW,
    env_block, wcwd, (LPSTARTUPINFOW)&si, &pi);
```

`bInheritHandles = TRUE` is required for `STARTF_USESTDHANDLES` to deliver the pipe handles to the child. `PROC_THREAD_ATTRIBUTE_HANDLE_LIST` limits which parent handles are actually inherited.

The command line is built as a wide string (`WCHAR *`) from the `execPath` and `args[]` array; args containing spaces are quoted. `CreateProcessW` is used (not `CreateProcessA`) so UTF-8 paths survive the conversion.

#### Terminal dimensions (COLUMNS / LINES env vars)

`build_env_block(cols, rows)` builds a Unicode environment block that inherits the parent's environment minus `COLUMNS`, `LINES`, `TERM`, and `COLORTERM`, then appends:

```
COLUMNS=<cols>
LINES=<rows>
TERM=xterm-256color
COLORTERM=truecolor
```

`Terminal._updateSize()` in the editor falls back to these when `process.stdout.columns`/`rows` are `undefined`:

```ts
private _updateSize(): void {
  const envCols = parseInt(process.env['COLUMNS'] ?? '', 10);
  const envRows = parseInt(process.env['LINES'] ?? '', 10);
  this._width  = process.stdout.columns
    ?? (Number.isFinite(envCols) && envCols > 0 ? envCols : 80);
  this._height = process.stdout.rows
    ?? (Number.isFinite(envRows) && envRows > 0 ? envRows : 24);
}
```

#### binding.gyp — platform-conditional compilation

```json
"conditions": [
  ["OS=='win'",   { "sources": ["pty_win.c"], "libraries": [] }],
  ["OS=='linux'", { "sources": ["pty.c"],     "libraries": ["-lutil"] }],
  ["OS=='mac'",   { "sources": ["pty.c"],     "libraries": [] }]
]
```

`node-gyp` selects the correct source file automatically. The Windows build links against the default Windows SDK libraries (no extra `-l` flags needed).

#### Building on Windows

The Windows SDK (included with Visual Studio or "Build Tools for Visual Studio") provides the necessary headers and libraries. `node-gyp` on Windows uses MSVC or Clang-CL automatically if Visual Studio is installed. Run:

```powershell
npm run ui-test:build   # invokes node ui-tests/build.mjs
```

### Unit test runner — `unit-tests/runner.mjs`

**Problem:** Node.js ESM `import()` on Windows rejects bare absolute paths like `C:\Users\…\buffer.test.js` with: `Only URLs with a scheme in: file, data, and node are supported`. Windows drive letters (`C:`) look like URL schemes to the parser.

**Fix:** Convert each test file path to a `file://` URL before passing it to `import()`:

```js
import { pathToFileURL } from 'node:url';
// …
.map(f => pathToFileURL(resolve(join(testsDir, f))).href)
```

`pathToFileURL` produces `file:///C:/Users/…/buffer.test.js`, which the ESM loader accepts on all platforms.
