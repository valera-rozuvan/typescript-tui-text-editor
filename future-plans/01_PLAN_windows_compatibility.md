# Windows Compatibility Plan

Target: make `node-text-editor` run correctly on Windows 10+ (Windows Terminal or modern
`cmd.exe`/PowerShell with VT processing) while keeping Linux behaviour unchanged.

Node.js version target: v22 (same as Linux).

---

## Summary of findings

| # | File(s) | Issue | Severity |
|---|---------|-------|----------|
| 1 | `src/terminal/Terminal.ts:9` | `SIGWINCH` does not exist on Windows — resize is never detected | Critical |
| 2 | `src/editor/Buffer.ts:11,20,104` | CRLF not stripped on read; files saved with LF-only | Major |
| 3 | `src/editor/Editor.ts:113` | `SIGTERM` is a no-op on Windows — cleanup never runs | Major |
| 4 | `ui-tests/pty/pty.c` | `forkpty()` / POSIX PTY API — does not exist on Windows | Critical |
| 5 | `ui-tests/pty/binding.gyp` | `gyp` target only handles Linux linker flags; no Windows path | Critical |
| 6 | `src/search/ProjectSearch.ts:44` | Dotfile filter hides files whose names start with `.`; harmless but Windows has no such convention | Minor |
| 7 | (all path display sites) | `path.join()` returns `\` on Windows — displayed paths look different | Minor |

Issues **not** present (confirming no action needed):

* `process.stdin.setRawMode()` — Node.js v22 implements this via `uv_tty_set_mode` on Windows; it works.
* ANSI escape sequences in output — Node.js v22 automatically enables `ENABLE_VIRTUAL_TERMINAL_PROCESSING` on Windows TTY handles, so ANSI codes render correctly in Windows Terminal and modern `conhost.exe`.
* `process.stdout.columns` / `.rows` — works on Windows.
* `access()`, `readFile()`, `writeFile()`, `mkdir()` — fully cross-platform in Node.js.
* `SIGINT` — emitted correctly on Windows from Ctrl+C.

---

## Fix 1 — Terminal resize detection (Critical)

**File:** `src/terminal/Terminal.ts`

**Problem:** `process.on('SIGWINCH', cb)` fires on POSIX when the terminal is resized.
Windows does not have `SIGWINCH`; the listener is silently ignored, so the layout never
updates when the window is resized.

**Fix:** Add a second listener for `process.stdout`'s `'resize'` event, which Node.js
emits cross-platform (including Windows) when the TTY dimensions change.

```ts
// Terminal.ts constructor — replace the current SIGWINCH-only block with:
constructor() {
  this._updateSize();

  // POSIX resize signal
  process.on('SIGWINCH', () => {
    this._updateSize();
    for (const cb of this._resizeCallbacks) cb();
  });

  // Windows (and a harmless extra on POSIX) — emitted by Node.js v12+
  process.stdout.on('resize', () => {
    this._updateSize();
    for (const cb of this._resizeCallbacks) cb();
  });
}
```

Both listeners may fire on Linux (the `'resize'` event is emitted alongside `SIGWINCH` in
recent Node.js versions); `_updateSize()` is idempotent, so double-firing is harmless.

---

## Fix 2 — CRLF line-ending handling (Major)

**File:** `src/editor/Buffer.ts`

**Problem (read side):** `content.split('\n')` at lines 11 and 20 does not strip `\r`.
Opening a Windows-format file (CRLF) leaves a trailing `\r` on every line, which renders
as a visible character and corrupts cursor positions.

**Problem (write side):** `lines.join('\n') + '\n'` at line 104 always writes LF-only.
This is fine for a cross-platform editor that treats LF as canonical, but CRLF files opened
and re-saved will have their line endings silently changed.

**Fix (two-part):**

### 2a — Strip `\r` on read (normalize to LF in memory)

```ts
// Buffer.ts — static fromFile(), replace the content.split('\n') line:
const raw = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const lines = raw.split('\n');
```

Apply the same normalization in the `Buffer` constructor:

```ts
// Buffer.ts — constructor
constructor(content = '') {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  this.lines = normalized === '' ? [''] : normalized.split('\n');
}
```

### 2b — Preserve original line endings on save (optional, recommended)

Track whether the file was originally CRLF so it is saved back in the same format.
This prevents spurious diffs in git for Windows-format files.

```ts
// Buffer.ts — add a field:
lineEnding: '\r\n' | '\n' = '\n';

// In fromFile(), after reading:
buf.lineEnding = content.includes('\r\n') ? '\r\n' : '\n';

// In toString():
toString(): string {
  return this.lines.join(this.lineEnding) + this.lineEnding;
}
```

`save()` calls `toString()` so no changes are needed there.

---

## Fix 3 — SIGTERM handler guard (Major)

**File:** `src/editor/Editor.ts:113`

**Problem:** `SIGTERM` is a no-op on Windows. Registering a handler does not cause Node.js
to throw, but the handler will never execute, so `disableRawMode()` and `showCursor` are
skipped when the process is terminated from outside on Windows.

**Fix:** Guard with a platform check.

```ts
// Editor.ts — start(), replace the two signal lines:
process.on('SIGINT', () => this.quit());
if (process.platform !== 'win32') {
  process.on('SIGTERM', () => this.quit());
}
```

On Windows, Ctrl+C sends SIGINT, which is handled. External termination via Task Manager
or `taskkill /F` bypasses all signal handlers on any OS, so there is nothing further to do.

---

## Fix 4 — UI test PTY addon (Critical)

**Files:** `ui-tests/pty/pty.c`, `ui-tests/pty/binding.gyp`

**Problem:** The addon wraps `forkpty()` (POSIX) plus related APIs (`waitpid`, `SIGTERM`,
`TIOCSWINSZ`, `O_NONBLOCK`). None of these exist on Windows. The addon will not compile
and the UI test suite cannot run at all on Windows.

**Approach:** Use conditional compilation to build a Windows implementation alongside the
existing POSIX implementation, keeping a single `binding.gyp`.

### 4a — Implement `pty_win.c` using Windows ConPTY

Create `ui-tests/pty/pty_win.c` that exports the same N-API surface
(`spawn`, `write`, `read`, `resize`, `kill`, `waitpid`, `close`) implemented with:

* `CreatePseudoConsole` / `ClosePseudoConsole` (Windows 10 build 1809+, i.e. `conpty`)
* `CreateProcess` with `STARTUPINFOEX` and the attached ConPTY
* Named pipes (`CreateNamedPipe` / `CreatePipe`) for stdin/stdout of the child
* `ReadFile` / `WriteFile` for PTY I/O
* `WaitForSingleObject` + `GetExitCodeProcess` to implement `waitpid`
* `TerminateProcess` to implement `kill`

The ConPTY input/output pipe handles are the Windows equivalent of the POSIX master fd.

### 4b — Update `binding.gyp` for platform selection

```json
{
  "targets": [
    {
      "target_name": "pty_native",
      "conditions": [
        ["OS=='win'", {
          "sources": ["pty_win.c"],
          "libraries": []
        }],
        ["OS=='linux'", {
          "sources": ["pty.c"],
          "libraries": ["-lutil"]
        }],
        ["OS=='mac'", {
          "sources": ["pty.c"],
          "libraries": []
        }]
      ]
    }
  ]
}
```

### 4c — Isolate platform-only helpers in the test TypeScript layer

The TypeScript wrapper that loads the addon (`ui-tests/pty/index.ts` or equivalent) should
remain platform-agnostic; only the C layer differs.

**Scope note:** Implementing `pty_win.c` is the largest single task in this plan.
It requires Windows SDK headers (`windows.h`, `processthreadsapi.h`) and at minimum a
Windows machine or cross-compilation toolchain to verify. Estimate: ~300–400 lines of C.

---

## Fix 5 — Minor: path display normalisation (Minor)

**Files:** `src/ui/StatusBar.ts`, `src/terminal/Renderer.ts` (anywhere a `filePath` is
displayed to the user)

**Problem:** On Windows, `path.resolve()` returns backslash-separated paths. The status
bar and search results will show `C:\Users\…\file.ts` instead of `C:/Users/…/file.ts`.
This is not functionally broken but may surprise Linux-oriented users who are also using
WSL.

**Fix (optional):** Add a small helper and apply it only in display contexts.

```ts
// src/utils/displayPath.ts
export function displayPath(p: string): string {
  return process.platform === 'win32' ? p.replace(/\\/g, '/') : p;
}
```

Use `displayPath(filePath)` wherever a path is shown in the UI rather than `filePath`
directly.

---

## Implementation order

Work through the items in this order to unblock testing at each step:

1. **Fix 1** — `SIGWINCH` + `'resize'` event: one-line change, immediately testable on
   Windows by resizing the terminal.
2. **Fix 3** — `SIGTERM` guard: one-line change, minimal risk.
3. **Fix 2** — CRLF normalization: affects `Buffer.ts`; add unit tests for the
   `\r\n` round-trip before committing.
4. **Fix 4** — ConPTY addon: largest item; implement `pty_win.c` and update `binding.gyp`;
   test the full UI suite on Windows.
6. **Fix 6** — Path display: purely cosmetic; do last.

---

## Testing strategy

### Runtime (Fixes 1–3, 6)

After each fix, manually test on Windows in Windows Terminal:
- Resize the window → layout should reflow.
- Open, edit, and save a file that uses CRLF → no `\r` artefacts in the display.
- Open a CRLF file, save it, and verify it still has CRLF (`xxd` or PowerShell
  `Format-Hex`).
- Kill the process from Task Manager or `taskkill` — no regression on Linux.

### Unit tests (Fix 2)

Add test cases to the existing unit-test suite:
- `Buffer` constructed from `"foo\r\nbar\r\n"` → two lines, no `\r` in either.
- `Buffer.lineEnding` is `'\r\n'` for CRLF input, `'\n'` for LF input.
- `Buffer.toString()` round-trips the original line ending.

### UI tests (Fixes 4, 5)

Once the ConPTY addon is built:
- Run `npm run ui-test:build` on Windows (PowerShell, no Git Bash).
- Run `npm run ui-test` — all existing suites should pass unchanged because the N-API
  surface is identical to the POSIX version.

---

## What is explicitly out of scope

* **Classic `cmd.exe` without VT processing** — Node.js v22 enables
  `ENABLE_VIRTUAL_TERMINAL_PROCESSING` automatically on Windows TTY handles. Supporting
  legacy `cmd.exe` on Windows 7/8 is not a goal.
* **WSL** — WSL runs a Linux kernel; the existing code works there without any changes.
* **Cross-compilation** — The ConPTY addon must be compiled on a Windows host with the
  Windows SDK; cross-compiling from Linux is not covered by this plan.
