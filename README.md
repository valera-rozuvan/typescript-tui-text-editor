# node.js text editor

A terminal UI (TUI) text editor written in TypeScript, built entirely from scratch, with no runtime dependencies.

Idea behind using Node.js is that scripting using JavaScript can be built in relatively easy.

This thing was built from the ground up using Claude Code.

During the development, a human (me, Valera) is used for testing.

For all issues found, automated tests (both unit tests and UI tests) are added to catch regressions in the future.

This is mostly for my own use, I do not expect anyone else to pick up this editor, since, practically, anyone can develop their own text editor using AI.

This is public only for convenience - I can install it using NPM on an system I work on (and everywhere I work - I have Node.js available.)

Available from [NPM @valera_rozuvan/vted](https://www.npmjs.com/package/@valera_rozuvan/vted); install via:

```shell
npm install -g @valera_rozuvan/vted

# Now you should have 'vted' command available!
# Try:
#   vted new_file.txt
```

## Features

- **Multi-pane editing** — up to 4 panes simultaneously (single, horizontal split, vertical split, quad); each pane holds multiple open buffers, cycled with `Alt+←/→`
- **File browser** — toggle a directory navigator on the left or right side
- **Fuzzy search** — search within open files or across the entire project tree
- **Project search** — walks up from the current file to the nearest `.git/` root, then recursively searches all files with fuzzy matching and result previews
- **JS Transform Panel** — press `Alt+J` to open an inline JavaScript editor; write a function that receives each line and returns the transformed result, then `Alt+J` again to apply it to the active buffer; `Alt+C` to cancel
- **Syntax highlighting** — JavaScript, TypeScript, C, C++, Markdown, HTML, CSS; chunk-based cache invalidated on edit
- **True-color theme** — Catppuccin Mocha palette via RGB ANSI escape sequences
- **Read-only mode** — automatically detected from file permissions; the editor displays a read-only indicator and blocks writes

## Platform support

The editor runs on **Linux**, **macOS**, and **Windows 10 build 1809 (October 2018 Update) or later**.

On Windows, use **Windows Terminal** or any modern console host. Node.js v22 automatically enables `ENABLE_VIRTUAL_TERMINAL_PROCESSING` on Windows TTY handles, so ANSI colours and escape sequences render correctly without any extra configuration.

Key Windows-specific behaviours:

- **CRLF files** — files with Windows line endings (`\r\n`) are read correctly. The editor normalises them to `\n` in memory, then writes them back as `\r\n` on save, preserving the original line-ending style.
- **Terminal resize** — Node.js does not deliver `SIGWINCH` on Windows. The editor also listens for `process.stdout`'s `'resize'` event (emitted by Node.js v12+ on all platforms), so the layout reflows correctly when the window is resized.
- **`make-exec`** — `npm run make-exec` prepends the `#!/usr/bin/env node` shebang to `dist/index.js` on all platforms, but skips `chmod +x` on Windows (meaningless there). Run with `node dist/index.js` as usual.
- **UI tests** — the native PTY addon uses the Windows **ConPTY** API (`CreatePseudoConsole`) on Windows instead of POSIX `forkpty`. Building it requires the Windows SDK, which ships with Visual Studio or the "Desktop development with C++" workload in Build Tools for Visual Studio.
- **WSL** — inside WSL, Node.js sees a Linux environment; no Windows-specific code paths are taken.

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

To remove all build artifacts and dependencies:

```bash
npm run clean   # deletes dist/, unit-tests/dist/, ui-tests/dist/, ui-tests/pty/build/, node_modules/
```

After `clean`, run `npm install` and `npm run build` (plus `npm run ui-test:build` if you need the UI tests) to restore everything.

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
| `Tab` | Insert a literal tab character (`\t`) |

In the **file browser**: arrows navigate, `Enter` opens a file or enters a directory, `Backspace` goes up a directory, `Tab` returns focus to the editor without closing the browser, `Escape` closes it.

In **search**: type to filter results, `↑/↓` to navigate, `Enter` to jump to the selected result, `Escape` to close.

## Note on imports for Node.js TypeScript source files

All intra-project imports use `.js` extensions, even though the source files are `.ts`:

```ts
import { Cursor } from './Cursor.js';   // source file is Cursor.ts
```

This is required by `"moduleResolution": "NodeNext"` in `tsconfig.json`. TypeScript with this setting does not rewrite import paths during compilation — it emits them verbatim into the compiled output in `dist/`. At runtime, Node.js resolves the `.js` path against the compiled file, which is correct.

If imports used `.ts` extensions instead, TypeScript would emit `import './Cursor.ts'` into the compiled JS, which Node.js would reject at runtime because no `.ts` file exists in `dist/`.

TypeScript's type checker understands that a `.js` import path resolves to the corresponding `.ts` source file, so type-checking works correctly despite the apparent mismatch.

The alternative — using `"moduleResolution": "bundler"` — would allow omitting extensions entirely, but requires adding a bundler (webpack, esbuild, etc.), which would conflict with this project's zero-runtime-dependency goal.

## Running all tests locally

To run the full test suite (unit tests sequential, unit tests parallel, and all UI suites) in one command:

```bash
npm run all-tests
```

This invokes `scripts/run-tests.mjs`, which runs the three commands in sequence and prints a combined pass/fail summary. Exit code is `0` when all commands pass, `1` otherwise.

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

## Docker

Run the full test suite (unit tests + UI tests) inside an isolated Debian container
without installing Node.js or any build tools on the host.

### Install Docker on Debian/Ubuntu

```bash
# Remove any old Docker packages
sudo apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# Add Docker's official GPG key and repository
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io

# (optional) run docker without sudo
sudo usermod -aG docker "$USER"
newgrp docker
```

On **Ubuntu** replace `debian` with `ubuntu` in the repository URL above, or use:

```bash
sudo apt-get install -y docker.io   # simpler, slightly older version
```

Verify the installation:

```bash
docker --version        # Docker version 24.x or newer
docker run hello-world  # should print a "Hello from Docker!" message
```

### Build the Docker image

From the repository root:

```bash
docker build -f Dockerfile_v26 -t node-text-editor-node-v26 .
```

The image installs Node.js version 26.x, compiles the project, builds the native PTY addon,
and compiles all test suites.  This takes roughly 2–4 minutes on first run; subsequent
builds are faster thanks to layer caching.

**NOTE**: There are also Dockerfiles available for versions v18.x, v20.x, v22.x, and
v24.x; just update the Dockerfile name appropriately. 

### Run all tests

```bash
docker run --rm node-text-editor-node-v26
```

The container runs `scripts/run-tests.mjs` (also available locally as `npm run all-tests`),
which executes three commands in sequence:

| # | Command | What it tests |
|---|---------|---------------|
| 1 | `node unit-tests/runner.mjs` | All unit test suites, sequential |
| 2 | `node unit-tests/runner.mjs --parallel` | Same suites, parallel (exercises the worker-thread runner) |
| 3 | `node ui-tests/runner.mjs --no-build` | All 12 end-to-end UI test suites |

At the end the container prints:

```
════════════════════════════════════════════════════════
FINAL SUMMARY
════════════════════════════════════════════════════════
Commands run:    3
Commands passed: 3
Commands failed: 0
════════════════════════════════════════════════════════
All commands passed.
```

The container exits with code `0` when every command passes, `1` otherwise.

### Multi-version test script

`scripts/docker-test-all.mjs` automates the full build-and-test cycle across all
supported Node.js versions in one command:

```bash
node scripts/docker-test-all.mjs
# or via npm
npm run docker-tests
```

What the script does, in order:

1. **Removes** any existing `node-text-editor-node-v*` Docker images so every
   build starts from a clean slate.
2. **Builds** each versioned image (`Dockerfile_v18` → `Dockerfile_v26`)
   silently, saving the full log to `docker-logs/build_v<N>.log`.
3. **Runs** the full test suite inside each successfully built container
   silently, saving the full log to `docker-logs/run_v<N>.log`.
4. **Prints a summary chart** after all versions finish.

All docker output goes to the log files only. The terminal shows a live
elapsed-time counter for each step (updated every second via `\r`), then
replaces it with the final result when the step completes:

```
════════════════════════════════════════════════════════
 Building and testing all versions
════════════════════════════════════════════════════════

  build  Dockerfile_v18        2m14s     PASS
  test   Dockerfile_v18        1m32s     PASS  3/3 cmds

  build  Dockerfile_v20        1m58s     PASS
  test   Dockerfile_v20        1m29s     PASS  3/3 cmds

  ...

════════════════════════════════════════════════════════
 RESULTS SUMMARY
════════════════════════════════════════════════════════

  Node.js    Build     Build time    Tests     Cmds passed    Cmds failed
  ---------  --------  ------------  --------  -------------  ------------
  v18        PASS      2m14s         PASS      3              0
  v20        PASS      1m58s         PASS      3              0
  v22        PASS      2m03s         PASS      3              0
  v24        PASS      2m11s         PASS      3              0
  v26        PASS      2m07s         PASS      3              0

  Versions tested:     5
  Versions all-pass:   5
  Versions with fails: 0
```

The script exits with code `0` when every version passes all tests, `1` when
any version fails to build or has test failures.  Logs in `docker-logs/` are
retained after the run for post-mortem inspection; the directory is listed in
`.gitignore`.

### Run a single UI test suite

```bash
docker run --rm node-text-editor \
  node ui-tests/runner.mjs --no-build --suite startup
```

Available suite names: `startup`, `text_input`, `multipane`, `file_search`,
`project_search`, `search_cursor`, `scroll_rendering`, `scroll_rendering_c_code`,
`readonly_file`, `file_browser`, `js_transform`, `tab_navigation`.

---

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
    pty.c                            N-API C addon (POSIX forkpty wrapper — Linux/macOS)
    pty_win.c                        N-API C addon (Windows ConPTY wrapper)
    binding.gyp                      node-gyp build config (platform-conditional)
  tests/
    PtyProcess.ts                    TypeScript wrapper around the native addon
    TerminalScreen.ts                VT100 parser / virtual screen grid
    helpers.ts                       EditorTest class, key constants, temp-file utils
    01_startup.test.ts               Startup and initial render tests
    02_text_input.test.ts            Typing, saving, cursor position tests
    03_multipane.test.ts             Pane splitting and switching tests
    04_file_search.test.ts           In-file fuzzy search tests
    05_project_search.test.ts        Project-wide search tests
    06_search_cursor.test.ts         Search panel cursor tracking tests
    07_scroll_rendering.test.ts      Scroll and re-render tests
    08_scroll_rendering-c-code.test.ts  Scroll rendering with C syntax highlighting
    09_readonly_file.test.ts         Read-only file indicator tests
    10_file_browser.test.ts          File browser navigation tests
    11_js_transform.test.ts          JS transform modal tests
    12_tab_navigation.test.ts        Tab character rendering and cursor movement tests
  runner.mjs               Test runner
  build.mjs                Cross-platform build script
  README.md                Architecture and usage documentation
  PLAN.md                  Step-by-step implementation plan
```

## License

This project is licensed under the MIT license. See [LICENSE](LICENSE) for more information.

Copyright (c) 2026 [Valera Rozuvan](https://valera.rozuvan.net/)

