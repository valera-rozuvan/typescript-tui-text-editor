# node.js text editor

A terminal UI (TUI) text editor written in TypeScript, built entirely from scratch with no runtime dependencies.

## Features

- **Multi-pane editing** — up to 4 panes simultaneously (single, horizontal split, vertical split, quad)
- **File browser** — toggle a directory navigator on the left or right side
- **Fuzzy search** — search within open files or across the entire project tree
- **Project search** — walks up from the current file to the nearest `.git/` root, then recursively searches all files with fuzzy matching and result previews
- **Syntax highlighting** — JavaScript, TypeScript, C, C++, Markdown, HTML, CSS; chunk-based cache invalidated on edit
- **True-color theme** — Catppuccin Mocha palette via RGB ANSI escape sequences

## Dependencies

Only one dev dependency: `typescript`. Everything else is written from scratch using Node.js built-ins.

## Usage

```bash
npm install
npm run build
node dist/index.js [file]   # opens file, or starts with empty buffer
```

Optionally, make the compiled output directly executable:

```bash
npm run make-exec   # adds #!/usr/bin/env node shebang and chmod +x dist/index.js
./dist/index.js [file]
```

Run `make-exec` once after each `npm run build`. It is idempotent — running it multiple times is safe.

## Key Bindings

| Key | Action |
|-----|--------|
| `Ctrl+S` | Save file |
| `Ctrl+Q` | Quit |
| `Ctrl+B` | Toggle file browser |
| `Ctrl+F` | Fuzzy search in open files |
| `Ctrl+P` | Fuzzy search across project |
| `Ctrl+N` | Switch to next pane |
| `Ctrl+Shift+N` | Switch to previous pane |
| `Ctrl+W` | Close active pane buffer |
| `Alt+→` | Next open buffer in active pane |
| `Alt+←` | Previous open buffer in active pane |
| `Alt+1` | Single pane layout |
| `Alt+2` | Two panes side by side |
| `Alt+3` | Two panes top/bottom |
| `Alt+4` | Four pane quad layout |
| `Ctrl+←/→` | Move by word |
| `Ctrl+Home/End` | Jump to file start/end |
| `Home / End` | Line start/end |
| `Page Up/Down` | Scroll page |
| `Tab` | Insert 2 spaces |

In the **file browser**: arrows navigate, `Enter` opens a file or enters a directory, `Backspace` goes up a directory, `Tab` returns focus to the editor without closing the browser, `Escape` closes it.

In **search**: type to filter results, `↑/↓` to navigate, `Enter` to jump to the selected result, `Escape` to close.

## Unit Tests

### Structure

Tests live in `unit-tests/` alongside the project source:

```
unit-tests/
  runner.mjs          # test runner (also the worker script for parallel mode)
  tsconfig.json       # compiles tests to unit-tests/dist/
  globals.d.ts        # node:-prefixed built-in type declarations for tests
  tests/
    types.ts          # TestCase interface shared by all test files
    buffer.test.ts
    cursor.test.ts
    input.test.ts
    terminal.test.ts
    layout.test.ts
    pane.test.ts
    file-browser.test.ts
    search-panel.test.ts
    fuzzy-matcher.test.ts
    file-search.test.ts
    project-search.test.ts
    tokens.test.ts
    cache.test.ts
    highlighter.test.ts
    lang-javascript.test.ts
    lang-typescript.test.ts
    lang-c.test.ts
    lang-cpp.test.ts
    lang-markdown.test.ts
    lang-html.test.ts
    lang-css.test.ts
```

Each test file exports two values:

```ts
import type { TestCase } from './types.js';

export const suite = 'Human-readable suite name';

export const tests: TestCase[] = [
  {
    name: 'description of what is being tested',
    fn: async () => {
      // use Node.js assert — fn may be sync or async
    },
  },
];
```

Tests import from the compiled `dist/` output, so **`npm run build` must be run before the tests**. No additional packages are required — only Node.js built-ins (`node:assert/strict`, `node:worker_threads`, `node:fs`, etc.) are used.

### Test runner

`unit-tests/runner.mjs` is a self-contained runner built on `node:worker_threads`. It:

- Compiles `unit-tests/tests/*.test.ts` to `unit-tests/dist/` via `unit-tests/tsconfig.json`.
- Discovers every `*.test.js` file inside `unit-tests/dist/` automatically.
- Runs each suite in an isolated worker thread.
- Collects pass/fail counts and prints a summary.
- Exits with code `0` when all tests pass, `1` when any fail.

The same file is both the main-thread orchestrator and the per-worker script (detected via `isMainThread`).

### Running the tests

```bash
# Build source first (required once; re-run after source changes)
npm run build

# Sequential (default) — compiles tests then runs them
npm test

# Parallel — auto-detects CPU count
npm run test:parallel

# Parallel with explicit thread count
node unit-tests/runner.mjs --parallel --threads 8
```

The `--threads N` flag is only meaningful together with `--parallel`. Without `--parallel` tests always run sequentially regardless of `--threads`.

## UI Tests

End-to-end tests that run the full editor inside a pseudo-terminal, inject
keystrokes, and assert on screen content and saved file contents.

### How it works

A C native addon (`ui-tests/pty/pty.c`, built with N-API via `node-gyp`)
wraps POSIX `forkpty()` to spawn the editor in a real PTY.  A lightweight
TypeScript VT100 parser (`TerminalScreen`) reconstructs the virtual screen
from the ANSI output so tests can make content assertions without a full
terminal emulator.  See [`ui-tests/README.md`](ui-tests/README.md) for the
full design description.

### Prerequisites

A standard C build toolchain (`gcc`, `make`, `python3`) — these ship with
`build-essential` on Debian/Ubuntu.  `node-gyp` is fetched on-demand by
`npx`; no new npm dependencies are added to `package.json`.

### Building and running

```bash
# Build the native PTY addon and compile the TypeScript tests, then run
npm run ui-test

# Build only (first-time setup)
npm run ui-test:build

# Run without recompiling (after first build)
node ui-tests/runner.mjs --no-build
```

### Structure

```
ui-tests/
  pty/
    pty.c                  N-API C addon (forkpty wrapper)
    binding.gyp            node-gyp build config
  tests/
    PtyProcess.ts          TypeScript wrapper around the native addon
    TerminalScreen.ts      VT100 parser / virtual screen grid
    helpers.ts             EditorTest class, key constants, temp-file utils
    01_startup.test.ts     Startup and initial render tests
    02_text_input.test.ts  Typing, saving, cursor position tests
    03_multipane.test.ts   Pane splitting and switching tests
  runner.mjs               Test runner
  build.sh                 One-shot build script
  README.md                Architecture and usage documentation
  PLAN.md                  Step-by-step implementation plan
```
