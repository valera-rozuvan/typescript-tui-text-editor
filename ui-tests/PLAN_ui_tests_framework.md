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
- `build.mjs`: convenience script that runs `node-gyp` then `tsc`.
- `package.json` gains `"ui-test"` and `"ui-test:build"` scripts.

---

## Step 7 — Documentation

- `ui-tests/README.md`: explains the architecture and how to run tests.
- Root `README.md`: adds a *UI Tests* section.

---

---

## Step 8 — Debug Step-Through Observer

**Goal:** Make test failures easier to diagnose by letting a developer attach
a second terminal to a running test session and observe the virtual PTY screen
state at each step, with the ability to pause and advance one interaction at a
time.

**Motivation:** When a UI test fails the only feedback is the
`screen.dump()` snapshot captured at the point of the assertion.  It is
impossible to see what the screen looked like after earlier steps, or to watch
the editor respond to each keystroke in real time.  A separate observer
terminal solves this without changing how tests are written.

### Architecture

```
Terminal 1  node ui-tests/runner.mjs --debug
               ↓  starts DebugServer (Unix socket)
               ↓  waits for observer to connect
               ↓  per step: sends screen → blocks on "next"

Terminal 2  node ui-tests/observer.mjs <socket-path>
               ↓  connects to socket
               ↓  renders virtual screen after each step
               ↓  keypresses send next / run / run_all back to runner
```

Communication uses **newline-delimited JSON over a Unix domain socket**
(`node:net`).  No new npm dependencies.

### Key decisions

**Unix domain socket, not a pipe or HTTP.**  A socket is bidirectional
(observer can send `next` back to the runner) and local-only.  A named pipe
would need two files for bidirectional traffic.  HTTP/WebSocket would be
heavier than needed.

**ES module live binding for the singleton.**  `tests/debug.ts` exports
`let activeDebugServer`.  In Node.js ESM, re-assigning an exported `let`
from within the exporting module is immediately visible to all importers
(live bindings).  The runner imports `setDebugServer` and calls it *before*
any test file is loaded, so every subsequent `import { activeDebugServer }`
in `helpers.ts` sees the live value — no global variable, no environment
variable, no monkey-patching.

**Step granularity: after `start()` and `keys()` only.**  These are the
only points where the screen state changes.  Pausing after every assertion
would add noise without additional information.

**`_runToEnd` and `_runAll` flags.**  When the observer sends `run`, the
server sets `_runToEnd = true` for the current test (reset by `setContext`
at the start of the next test).  `run_all` sets `_runAll = true` for the
remainder of the session.  If the observer disconnects, `_runAll` is set
automatically so the runner finishes without hanging.

**`_describeSeq` in helpers.**  Raw byte sequences like `\x11` are logged
as human-readable names (`CTRL_Q`) by iterating over the `KEY` map.
Unknown sequences fall back to `JSON.stringify`.

**Observer is plain JS (`observer.mjs`), not TypeScript.**  It has no
dependencies on the compiled test code and does not need to be rebuilt.
Keeping it as a self-contained `.mjs` file means it can be run immediately
after `--debug` output appears without a build step.

### Protocol

**Runner → Observer:**

| Message | When sent |
|---------|-----------|
| `{ type: "step", suite, test, action, screen, cursor }` | After each `start()` or `keys()` call |
| `{ type: "test_pass", suite, test }` | After a test case passes |
| `{ type: "test_fail", suite, test, error }` | After a test case fails |
| `{ type: "done" }` | After all suites have run |

**Observer → Runner:**

| Message | Effect |
|---------|--------|
| `{ type: "next" }` | Advance one step |
| `{ type: "run" }` | Finish current test without pausing |
| `{ type: "run_all" }` | Finish all remaining tests without pausing |

### Files added / modified

| File | Change |
|------|--------|
| `tests/debug.ts` | New — live-binding singleton |
| `tests/DebugServer.ts` | New — socket server, step/continue state machine |
| `observer.mjs` | New — observer CLI |
| `tests/helpers.ts` | Added `activeDebugServer?.notifyStep(…)` in `start()` and `keys()`; added `_describeSeq` helper |
| `runner.mjs` | Added `--debug` flag, `DebugServer` lifecycle, `setContext`/notify calls around each test case |
| `globals.d.ts` | Added `process.pid`, `node:net`, and `node:fs/promises` type declarations |

---

## Decisions Deferred / Out of Scope

- Parallel UI test execution is intentionally omitted: running multiple
  editor instances simultaneously requires careful PTY management and adds
  complexity without meaningful speed benefit at the current test count.
- macOS support is acknowledged in the C code (`#ifdef __APPLE__`) but not
  actively tested.
- The virtual screen parser does not handle scrolling regions, alternate
  screen buffers, or wide (CJK) characters — none of which the editor uses.
