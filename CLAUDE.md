# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # install typescript (only dependency)
npm run build      # tsc — compile to dist/
npm run dev        # tsc --watch
npm start          # node dist/index.js (no file arg)
node dist/index.js [file]   # run the editor
```

## Architecture

A TUI text editor in TypeScript targeting Node v22, using raw terminal I/O and ANSI escape sequences. Zero runtime dependencies — only `typescript` as a devDependency. Node.js built-in types are declared locally in `src/globals.d.ts` (no `@types/node`).

```
src/
  globals.d.ts          — ambient Node.js type declarations (no @types/node)
  index.ts              — entry point
  terminal/
    Terminal.ts         — ANSI helpers (static), buffered output (append+flush), resize events
    Input.ts            — raw Uint8Array → KeyEvent[] parser (CSI, SS3, UTF-8, Ctrl+*)
    ScreenBuffer.ts     — Cell type, ScreenBuffer (2D cell grid), DrawContext (stateful draw API)
    Renderer.ts         — virtual-screen diff renderer; renders into _next ScreenBuffer via DrawContext,
                          diffs against _current, emits only changed cells as ANSI sequences
  editor/
    Buffer.ts           — text stored as string[], file I/O via fs/promises; readOnly flag set
                          when file has no write-permission bits
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
    Cache.ts            — chunk-based highlight cache (CHUNK_SIZE=50); invalidateFrom(line) on edit
    Highlighter.ts      — language detection by extension, WeakMap caches per Buffer
    languages/          — javascript.ts, typescript.ts (extends JS), c.ts, cpp.ts (extends C),
                          markdown.ts, html.ts, css.ts
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

Available suites: `startup`, `text_input`, `multipane`, `file_search`, `project_search`, `search_cursor`, `scroll_rendering`, `scroll_rendering_c_code`, `readonly_file`, `file_browser`, `js_transform`, `tab_navigation`.

### Running all tests together

`run-tests.sh` (used inside the Docker images) runs unit tests (sequential + parallel) and all UI suites in one shot and prints a combined pass/fail summary.

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
- `expandTabsFromCol()` in `src/terminal/Renderer.ts` — same rule for search-panel snippet display.
- `TerminalScreen.feed()` in `ui-tests/tests/TerminalScreen.ts` — same rule in the PTY output parser used by UI tests.

The UI test suite `tab_navigation` verifies this behaviour end-to-end: it reads the raw PTY screen content and asserts that every tab-expanded region is exactly `TAB_CHAR_COUNT` space characters wide.

## Important Notes

- **No `@types/node`** — all Node.js types are hand-declared in `src/globals.d.ts`. When adding code that uses new Node.js APIs, add the declaration there first.
- **`Buffer` naming** — our text buffer class is `Buffer` in `editor/Buffer.ts`. The stdin callback in `Editor.ts` uses `Uint8Array` (Node's Buffer is a Uint8Array subclass) to avoid the name collision.
- **Highlight cache invalidation** — always call `highlighter.invalidateFrom(line, buf)` after any buffer mutation that changes token boundaries (insert, delete, newline).
- **ESM imports** — all intra-project imports must use `.js` extensions (NodeNext module resolution).
- **`Buffer.save()` auto-mkdir** — `save()` calls `mkdir(dirname(filePath), { recursive: true })` before writing, so saving to a new path with missing parent directories works automatically.
- **`searchProject` API** — signature is `(needle, startDir, onResults, signal, maxResults?)`. Pass a mutable `{ cancelled: boolean }` object as the signal; set `.cancelled = true` to abort. `onResults` is called with partial results every 20 files and once on completion.
