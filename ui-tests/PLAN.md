# UI Test Framework — Implementation Plan

This document records the step-by-step plan used to build the end-to-end
UI test suite for the node-text-editor.

---

## Step 1 — PTY Native Addon (`pty/pty.c` + `pty/binding.gyp`)

**Goal:** Give Node.js the ability to spawn a child process inside a real
pseudo-terminal so that a TUI program behaves exactly as it does in a
user's terminal.

**Key decisions:**
- Use POSIX `forkpty()` (Linux `<pty.h>`, links with `-lutil`) to create a
  master/slave PTY pair and fork the editor into the slave.
- Set the master fd to `O_NONBLOCK` so reads return immediately (`EAGAIN`)
  when no data is available, keeping the Node.js event loop responsive.
- Expose seven N-API functions: `spawn`, `write`, `read`, `resize`, `kill`,
  `waitpid`, `close`.
- `spawn` sets `TERM=xterm-256color` and `COLORTERM=truecolor` in the child
  environment so the editor uses full 24-bit color ANSI output.
- Build with `npx node-gyp configure && npx node-gyp build` (no new npm
  dependency — `node-gyp` is fetched on-demand by `npx`).

**Output:** `pty/build/Release/pty_native.node`

---

## Step 2 — TypeScript PTY Wrapper (`tests/PtyProcess.ts`)

**Goal:** Wrap the native addon in a typed, ergonomic class.

**Key decisions:**
- Load the `.node` addon via `createRequire(import.meta.url)` so the ESM
  test files can call CommonJS-style `require()`.
- `readOutput(idleMs, maxWaitMs)` is `async`: it polls `read()` in a loop,
  yielding via `await sleep(15)` between polls.  This returns all output
  received within an "idle window" of `idleMs` ms without blocking the
  event loop for more than 15 ms at a time.
- `cleanup()` sends SIGTERM then SIGKILL (silently ignoring errors when the
  process has already exited) and blocks on `waitpid` to reap the zombie.

---

## Step 3 — Virtual Terminal Screen (`tests/TerminalScreen.ts`)

**Goal:** Parse the editor's ANSI output and maintain a 2-D character grid
so tests can make assertions about screen content without running a
full terminal emulator.

**Parser scope (the editor only emits these):**
| Sequence | Action |
|---|---|
| `ESC[row;colH` / `ESC[H` | Move cursor (1-indexed) |
| `ESC[2J` | Clear screen, cursor → 0,0 |
| `ESC[K` / `ESC[0K` | Erase to end of line |
| `ESC[…m` (SGR) | Ignored (color/bold) |
| `ESC[?25l/h` | Ignored (cursor visibility) |
| Other CSI / OSC | Silently skipped |

**Key decisions:**
- Every JavaScript character (even multi-byte UTF-8 like `│` or `●`) is
  already one code-point after `Buffer.toString('utf8')`; it occupies
  exactly one grid cell.
- `containsText(text)` scans all rows — simple and sufficient.
- `containsTextInCols(text, colStart, colEnd)` restricts the search to a
  column range, enabling per-pane assertions in split layouts.

---

## Step 4 — Test Helpers (`tests/helpers.ts`)

**Goal:** One ergonomic class (`EditorTest`) that combines `PtyProcess` and
`TerminalScreen` and provides assertion methods with useful failure messages.

**Key decisions:**
- Key-sequence constants (`KEY.CTRL_S`, `KEY.ALT_2`, …) are defined here
  so all test files share the same source of truth.
- `createTempDir()` / `createTempFile()` / `removeTempDir()` encapsulate
  temp-file lifecycle.  Every test that writes to disk creates a fresh
  `mkdtemp` directory and deletes it in a `finally` block.

---

## Step 5 — Test Suites

### `01_startup.test.ts`
- Editor starts with no file → `[No File]` in title and status bars.
- Status bar shows `EDIT` mode.
- Empty buffer rows show `~`.
- Opening a file shows its name and content.
- `Ctrl+Q` quits cleanly.

### `02_text_input.test.ts`
- Typing characters inserts them.
- Status bar tracks cursor position (`1:6` after 5 chars).
- `Ctrl+S` saves and shows `Saved:` message.
- File content on disk matches what was typed.
- Backspace removes the last character.
- Enter splits lines.
- `●` appears after editing; disappears after saving.

### `03_multipane.test.ts`
- `Alt+2` (hsplit2) shows a `│` vertical separator.
- Pane 0 keeps its original file content in the left half of the screen.
- `Ctrl+N` moves focus to the next pane; typing there produces output in
  the right half only.
- Content in each pane is independent; both are visible simultaneously.
- `Ctrl+N` cycles back to pane 0.
- `Alt+3` (vsplit2) shows a `─` horizontal separator.
- `Alt+1` returns to single-pane layout; separator disappears.
- `Alt+4` (quad) shows both separators.
- Status bar reflects the active pane's file after switching.

---

## Step 6 — Runner and Build

- `runner.mjs`: sequential runner that compiles TypeScript and dynamically
  imports `dist/*.test.js` files in sorted order.
- `build.sh`: convenience script that runs `node-gyp` then `tsc`.
- `package.json` gains `"ui-test"` and `"ui-test:build"` scripts.

---

## Step 7 — Documentation

- `ui-tests/README.md`: explains the architecture and how to run tests.
- Root `README.md`: adds a *UI Tests* section.

---

## Decisions Deferred / Out of Scope

- Parallel UI test execution is intentionally omitted: running multiple
  editor instances simultaneously requires careful PTY management and adds
  complexity without meaningful speed benefit at the current test count.
- macOS support is acknowledged in the C code (`#ifdef __APPLE__`) but not
  actively tested.
- The virtual screen parser does not handle scrolling regions, alternate
  screen buffers, or wide (CJK) characters — none of which the editor uses.
