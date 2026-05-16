# Plan: Reduce Code Duplication in `src/`

Findings from a scan of all TypeScript source files under `src/`. Each section
describes a repeated pattern, which files contain it, and a representative
excerpt.

---

## 1. `push()` helper — defined 7 times identically

The exact same 3-line function appears independently in every language tokenizer.

**Files:**
- `src/highlight/languages/javascript.ts`
- `src/highlight/languages/typescript.ts` (inherits JS, but file also carries it)
- `src/highlight/languages/c.ts`
- `src/highlight/languages/cpp.ts` (inherits C, but file also carries it)
- `src/highlight/languages/html.ts`
- `src/highlight/languages/css.ts`
- `src/highlight/languages/markdown.ts`

**Repeated code:**
```typescript
function push(tokens: Token[], type: TokenType, start: number, length: number): void {
  if (length > 0) tokens.push({ type, start, length });
}
```

---

## 2. Block comment parsing — identical in JS and C

The `inBlockComment` continuation loop is character-for-character identical in
both tokenizers: locate `*/`, emit a comment token for the consumed range, reset
the flag, otherwise consume the rest of the line.

**Files:**
- `src/highlight/languages/javascript.ts` (~lines 25–36)
- `src/highlight/languages/c.ts` (~lines 32–42)

**Repeated code:**
```typescript
if (st.inBlockComment) {
  const end = line.indexOf('*/', i);
  if (end === -1) {
    push(tokens, 'comment', i, line.length - i);
    i = line.length;
  } else {
    push(tokens, 'comment', i, end + 2 - i);
    i = end + 2;
    st.inBlockComment = false;
  }
  continue;
}
```

---

## 3. Line comment (`//`) parsing — identical in JS and C

**Files:**
- `src/highlight/languages/javascript.ts` (~lines 58–62)
- `src/highlight/languages/c.ts` (~lines 45–49)

**Repeated code:**
```typescript
if (line[i] === '/' && line[i + 1] === '/') {
  push(tokens, 'comment', i, line.length - i);
  i = line.length;
  continue;
}
```

---

## 4. String literal parsing — identical in 4 tokenizers

The quote-walking loop with backslash escape handling is copy-pasted across four
language files.

**Files:**
- `src/highlight/languages/javascript.ts` (~lines 99–110)
- `src/highlight/languages/c.ts` (~lines 78–88)
- `src/highlight/languages/html.ts` (~lines 64–70)
- `src/highlight/languages/css.ts` (~lines 56–66)

**Repeated code:**
```typescript
if (line[i] === '"' || line[i] === "'") {
  const quote = line[i];
  let j = i + 1;
  while (j < line.length && line[j] !== quote) {
    if (line[j] === '\\') j++;
    j++;
  }
  if (j < line.length) j++;
  push(tokens, 'string', i, j - i);
  i = j;
  continue;
}
```

---

## 5. Identifier classification prelude — near-identical in JS and C

Both tokenizers compute `isCall` (peek ahead for `(`) and `afterDot` (scan left
for `.`) using the same loop structure before dispatching to keyword/type/function
token types. The C version additionally checks `>` to handle `->` member access.

**Files:**
- `src/highlight/languages/javascript.ts` (~lines 148–158)
- `src/highlight/languages/c.ts` (~lines 121–131)

**Repeated code (JS version):**
```typescript
let k = j;
while (k < line.length && line[k] === ' ') k++;
const isCall = line[k] === '(';

let prevNonSpace = '';
for (let p = i - 1; p >= 0; p--) {
  if (line[p] !== ' ' && line[p] !== '\t') { prevNonSpace = line[p]; break; }
}
const afterDot = prevNonSpace === '.';
```

---

## 6. Number literal parsing — near-identical in JS and C

Hex / octal / decimal-with-exponent branches follow the same structure. Minor
difference: JS allows `_` digit separators in the regex; C does not.

**Files:**
- `src/highlight/languages/javascript.ts` (~lines 113–140)
- `src/highlight/languages/c.ts` (~lines 91–113)

**Repeated code (hex branch):**
```typescript
// JavaScript
if (line[j] === '0' && (line[j + 1] === 'x' || line[j + 1] === 'X')) {
  j += 2;
  while (j < line.length && /[0-9a-fA-F_]/.test(line[j])) j++;
}

// C (same shape, no underscore)
if (line[j] === '0' && /[xX]/.test(line[j + 1] ?? '')) {
  j += 2;
  while (j < line.length && /[0-9a-fA-F]/.test(line[j])) j++;
}
```

---

## 7. `adjustScroll()` — identical in 3 UI components

**Files:**
- `src/ui/FileBrowser.ts` (~lines 71–79)
- `src/ui/SearchPanel.ts` (~lines 71–79)
- `src/ui/JsTransformPanel.ts` (~lines 109–117)

**Repeated code:**
```typescript
adjustScroll(visibleHeight: number): void {
  if (visibleHeight <= 0) return;
  if (this.selectedIndex < this.scrollOffset) {
    this.scrollOffset = this.selectedIndex;
  }
  if (this.selectedIndex >= this.scrollOffset + visibleHeight) {
    this.scrollOffset = this.selectedIndex - visibleHeight + 1;
  }
}
```

Note: `JsTransformPanel` uses `cursorLine`/`scrollLine` instead of
`selectedIndex`/`scrollOffset`, but the arithmetic is identical.

---

## 8. Selection state reset — repeated internally in `SearchPanel`

`selectedIndex` and `scrollOffset` are reset to `0` in four separate methods of
the same class instead of being extracted into a private helper.

**File:** `src/ui/SearchPanel.ts` (methods: `open`, `appendChar`, `deleteChar`, `setResults`)

**Repeated code:**
```typescript
this.selectedIndex = 0;
this.scrollOffset = 0;
```

---

## 9. Indentation extraction — near-identical in 3 files

**Files:**
- `src/editor/Buffer.ts` (`insertNewline`, ~line 201)
- `src/ui/JsTransformPanel.ts` (`insertNewline`, ~line 40)
- `src/editor/Cursor.ts` (`moveToFirstNonSpace`, ~line 56 — length variant)

**Repeated code:**
```typescript
// Buffer.ts / JsTransformPanel.ts
const indent = l.match(/^(\s*)/)?.[1] ?? '';

// Cursor.ts (variant — reads length instead of the string)
this.col = l.match(/^\s*/)?.[0].length ?? 0;
```

---

## 10. Search result sorting — identical in 2 search files

**Files:**
- `src/search/FileSearch.ts` (appears twice: `searchInBuffer` and `searchInBuffers`)
- `src/search/ProjectSearch.ts` (appears twice: mid-search yield and final sort)

**Repeated code:**
```typescript
results.sort((a, b) => b.score - a.score);
```

---

## 11. Tab expansion — two independent implementations

Both files implement the same fixed-width tab replacement using `TAB_CHAR_COUNT`,
but in different contexts: `DrawContext.write()` expands tabs cell-by-cell into
the screen buffer; `expandTabsFromCol()` in `Renderer.ts` produces a plain string.
Critically, `expandTabsFromCol`'s `_startCol` parameter is never used (the
underscore prefix suppresses the TypeScript warning), making both implementations
produce identical visible output.

**Files:**
- `src/terminal/ScreenBuffer.ts` — `DrawContext.write()`, ~lines 151–156
- `src/terminal/Renderer.ts` — `expandTabsFromCol()`, ~lines 580–590

**Repeated logic:**
```typescript
// ScreenBuffer.ts (cell-write form)
if (text[i] === '\t') {
  const nextStop = this._col + TAB_CHAR_COUNT;
  for (let c = this._col; c < nextStop; c++) {
    this._buf.set(this._row, c, { char: ' ', ... });
  }
  this._col = nextStop;
}

// Renderer.ts (string form — _startCol unused)
function expandTabsFromCol(text: string, _startCol: number): string {
  let out = '';
  for (const ch of text) {
    if (ch === '\t') out += ' '.repeat(TAB_CHAR_COUNT);
    else out += ch;
  }
  return out;
}
```

The string-form logic can be extracted to `src/util.ts` as `expandTabs(text)`.
`DrawContext.write()` must retain its cell-write loop but can delegate tab-width
to the same constant without sharing code.

---

## 12. `deleteCharBefore` logic — nearly identical in `Buffer` and `JsTransformPanel`

Both implement the same two-branch backspace: delete one character within the
current line, or merge the current line onto the end of the previous one.

**Files:**
- `src/editor/Buffer.ts` — `deleteCharBefore(line, col)`, ~lines 178–195
- `src/ui/JsTransformPanel.ts` — `deleteCharBefore()`, ~lines 47–60

**Repeated logic:**
```typescript
// Buffer.ts
if (col > 0) {
  lines[line] = l.slice(0, col - 1) + l.slice(col);
  return { line, col: col - 1 };
} else if (line > 0) {
  const prev = lines[line - 1];
  lines[line - 1] = prev + lines[line];
  lines.splice(line, 1);
  return { line: line - 1, col: prev.length };
}

// JsTransformPanel.ts (same logic, different variable names)
if (cursorCol > 0) {
  lines[cursorLine] = line.slice(0, cursorCol - 1) + line.slice(cursorCol);
  cursorCol -= 1;
} else if (cursorLine > 0) {
  const prevLine = lines[cursorLine - 1];
  lines[cursorLine - 1] = prevLine + curLine;
  lines.splice(cursorLine, 1);
  cursorLine -= 1;
  cursorCol = prevLine.length;
}
```

Can be extracted as a pure function
`deleteCharBefore(lines: string[], line: number, col: number): { line: number; col: number }`
in `src/util.ts`.

---

## 13. `insertNewline` with auto-indent — nearly identical in `Buffer` and `JsTransformPanel`

Both implement the same split-and-carry-indent logic for the Enter key.

**Files:**
- `src/editor/Buffer.ts` — `insertNewline(line, col)`, ~lines 197–206
- `src/ui/JsTransformPanel.ts` — `insertNewline()`, ~lines 36–44

**Repeated logic:**
```typescript
// Buffer.ts
const indent = l.match(/^(\s*)/)?.[1] ?? '';
const after = l.slice(col);
lines[line] = l.slice(0, col);
lines.splice(line + 1, 0, indent + after);

// JsTransformPanel.ts (identical shape)
const indent = line.match(/^(\s*)/)?.[1] ?? '';
const after = line.slice(cursorCol);
lines[cursorLine] = before;
lines.splice(cursorLine + 1, 0, indent + after);
```

Can be extracted as a pure function
`insertNewlineWithIndent(lines: string[], line: number, col: number): { line: number; col: number }`
in `src/util.ts`. This also resolves item 9 (indentation extraction) for the
`Buffer` and `JsTransformPanel` call sites.

---

## 14. Pane state reset — 5 identical 3-liners in `Editor.ts`

The cursor-and-scroll reset that loads a fresh buffer into a pane appears
verbatim five times in the same file.

**File:** `src/editor/Editor.ts`

**Occurrences (line numbers approximate):**
| Method | Lines |
|--------|-------|
| `openFile()` | 56–58 |
| `openBuffer()` | 65–67 |
| `_cycleBuffer()` else branch | 105–107 |
| `handleBrowserKey()` enter case | 416–418 |
| `_closeActivePane()` | 627–629 |

**Repeated code:**
```typescript
pane.cursor.setPos(0, 0);
pane.scrollLine = 0;
pane.scrollCol = 0;
```

Should be extracted as a private `_resetPaneState(pane: Pane): void` method on
`Editor`, or as a `resetPane(pane: Pane)` free function in `src/util.ts` since
`Pane` is a simple data object.

---

## 15. Buffer load + highlight wiring — 3 times in `Editor.ts`

Every code path that opens a file from disk performs the same three-step setup:
notify the highlighter of the new path, register the buffer, and attach the
redraw callback.

**File:** `src/editor/Editor.ts`

**Occurrences (line numbers approximate):**
| Call site | Lines |
|-----------|-------|
| `openFile()` | 51–53 |
| `handleBrowserKey()` enter case | 412–414 |
| `_jumpToResult()` project-search branch | 543–545 |

**Repeated code:**
```typescript
this.highlighter.onFilePathChange(buf);
this._registerBuffer(buf);
this.highlighter.getCache(buf).setRedrawCallback(() => this.render());
targetPane.buffer = buf;
```

Should be extracted as a private `_loadBufferIntoPane(buf: Buffer, pane: Pane): void`
method on `Editor` that encapsulates these four lines plus the pane reset (item 14),
consolidating 7 repeated lines into a single call site.

---

## 16. Panel geometry constants — duplicated in `Renderer.ts`

The `panelW`, `panelX`, `panelY` (and `panelH`) constants are computed
independently in two places for each modal panel: once inside the cursor-
positioning block in `render()` and again inside the dedicated `_render*Panel()`
method. Any geometry change requires updating both locations.

**File:** `src/terminal/Renderer.ts`

**Search panel — two independent computations:**
```typescript
// In render() cursor-positioning block (~lines 93–95)
const panelW = Math.min(W - 4, 90);
const panelX = Math.floor((W - panelW) / 2);
const panelY = Math.floor(H * 0.15);

// In _renderSearchPanel() (~lines 411–414) — identical
const panelH = Math.min(Math.floor(H * 0.7), 30);
const panelW = Math.min(W - 4, 90);
const panelX = Math.floor((W - panelW) / 2);
const panelY = Math.floor(H * 0.15);
```

**JS Transform panel — same pattern (~lines 101–103 vs 510–513).**

Fix: extract `searchPanelGeometry(W, H)` and `jsTransformPanelGeometry(W, H)`
helper functions (private to `Renderer.ts`, or returned as an object) so
geometry is computed once and shared.

---

## 17. Title bar style setup — identical in two `Renderer.ts` methods

The three-line active/inactive title style is repeated verbatim in
`_renderPane()` and `_renderFileBrowser()`.

**File:** `src/terminal/Renderer.ts`

**Occurrence 1 — `_renderPane()` (~lines 207–209):**
```typescript
ctx.setBg(isActive ? THEME.titleActiveBg : THEME.titleInactiveBg);
ctx.setFg(isActive ? THEME.titleActiveFg : THEME.titleInactiveFg);
if (isActive) ctx.setBold(true);
```

**Occurrence 2 — `_renderFileBrowser()` (~lines 368–370):** identical.

Fix: extract a private `_applyTitleBarStyle(ctx: DrawContext, isActive: boolean): void`
helper on `Renderer`.

---

## Summary

| # | Priority | Duplication | Files affected |
|---|----------|-------------|----------------|
| 1 | High | `push()` helper | 7 tokenizer files |
| 7 | High | `adjustScroll()` | 3 UI components |
| 14 | High | Pane state reset | `Editor.ts` (5×) |
| 15 | High | Buffer load + highlight wiring | `Editor.ts` (3×) |
| 2 | Medium | Block comment parsing | `javascript.ts`, `c.ts` |
| 3 | Medium | Line comment parsing | `javascript.ts`, `c.ts` |
| 4 | Medium | String literal parsing | `javascript.ts`, `c.ts`, `html.ts`, `css.ts` |
| 5 | Medium | Identifier classification prelude | `javascript.ts`, `c.ts` |
| 6 | Medium | Number literal parsing | `javascript.ts`, `c.ts` |
| 11 | Medium | Tab expansion | `ScreenBuffer.ts`, `Renderer.ts` |
| 12 | Medium | `deleteCharBefore` logic | `Buffer.ts`, `JsTransformPanel.ts` |
| 13 | Medium | `insertNewline` with auto-indent | `Buffer.ts`, `JsTransformPanel.ts` |
| 9 | Low | Indentation extraction | `Buffer.ts`, `JsTransformPanel.ts`, `Cursor.ts` |
| 10 | Low | Sort-by-score | `FileSearch.ts`, `ProjectSearch.ts` (×2 each) |
| 8 | Low | Selection reset pattern | `SearchPanel.ts` (internal, 4×) |
| 16 | Low | Panel geometry constants | `Renderer.ts` (internal) |
| 17 | Low | Title bar style setup | `Renderer.ts` (internal) |

---

## Implementation plan: `src/util.ts`

A new file `src/util.ts` is created as the single home for all pure, stateless
utility functions that are currently duplicated across two or more files. The
file has no imports from `src/` (it may import from `src/constants.ts` only) so
it sits at the bottom of the dependency graph and can be imported anywhere
without creating circular dependencies.

### Functions to migrate to `src/util.ts`

#### String / display helpers

```typescript
// Replaces the local fitStr() in src/terminal/Renderer.ts.
// Used by Renderer and (after refactor) StatusBar for column-constrained output.
export function fitStr(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width);
  return s.padEnd(width);
}

// Replaces expandTabsFromCol() in src/terminal/Renderer.ts (the _startCol
// parameter was never used). DrawContext.write() keeps its cell-write loop
// but shares the constant via TAB_CHAR_COUNT from src/constants.ts.
export function expandTabs(text: string): string {
  let out = '';
  for (const ch of text) {
    out += ch === '\t' ? ' '.repeat(TAB_CHAR_COUNT) : ch;
  }
  return out;
}
```

#### Scroll clamping (resolves items 7 and 8)

```typescript
// Pure functional replacement for the adjustScroll() method body.
// Callers update their own offset field with the returned value.
// FileBrowser, SearchPanel, and JsTransformPanel all use this.
export function clampScroll(
  index: number,
  offset: number,
  visibleHeight: number
): number {
  if (visibleHeight <= 0) return offset;
  if (index < offset) return index;
  if (index >= offset + visibleHeight) return index - visibleHeight + 1;
  return offset;
}
```

#### Sorting (resolves item 10)

```typescript
// In-place descending sort by score. Replaces the four identical
// results.sort((a, b) => b.score - a.score) calls across FileSearch and
// ProjectSearch.
export function sortByScore<T extends { score: number }>(results: T[]): void {
  results.sort((a, b) => b.score - a.score);
}
```

#### Indentation helpers (resolves items 9, and the indent sub-expression in 13)

```typescript
// Returns the leading whitespace string. Replaces l.match(/^(\s*)/)?.[1] ?? ''
// in Buffer.insertNewline and JsTransformPanel.insertNewline.
export function getIndent(line: string): string {
  return line.match(/^(\s*)/)?.[1] ?? '';
}

// Returns the leading whitespace length. Replaces l.match(/^\s*/)?.[0].length ?? 0
// in Cursor.moveToFirstNonSpace and Buffer.indentAt.
export function getIndentLength(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
}
```

#### Text-buffer line operations (resolves items 12 and 13)

These are pure functions that operate on a `string[]` value and return a new
`{ line, col }` position. `Buffer` and `JsTransformPanel` both maintain a
`string[]` lines array and an integer cursor position, so the same function
works for both without coupling to either class.

```typescript
// Resolves item 12. Replaces the deleteCharBefore logic in Buffer.ts and
// JsTransformPanel.ts. Mutates lines in place; returns new cursor position.
export function deleteCharBefore(
  lines: string[],
  line: number,
  col: number
): { line: number; col: number } {
  if (col > 0) {
    const l = lines[line];
    lines[line] = l.slice(0, col - 1) + l.slice(col);
    return { line, col: col - 1 };
  }
  if (line > 0) {
    const prev = lines[line - 1];
    lines[line - 1] = prev + lines[line];
    lines.splice(line, 1);
    return { line: line - 1, col: prev.length };
  }
  return { line, col };
}

// Resolves items 9 and 13. Replaces insertNewline logic in Buffer.ts and
// JsTransformPanel.ts. Mutates lines in place; returns new cursor position
// (start of the auto-indented new line).
export function insertNewlineWithIndent(
  lines: string[],
  line: number,
  col: number
): { line: number; col: number } {
  const l = lines[line];
  const indent = getIndent(l);
  const after = l.slice(col);
  lines[line] = l.slice(0, col);
  lines.splice(line + 1, 0, indent + after);
  return { line: line + 1, col: indent.length };
}
```

### Functions that stay local (not migrated to `src/util.ts`)

| Item | Location | Why |
|------|----------|-----|
| `rgbEqual()` | `Renderer.ts` | Only used in `_diffOutput()`; no other caller |
| `push()` + tokenizer helpers (items 1–6) | → `src/highlight/languages/util.ts` | Depend on `Token`/`TokenType`/`TokenizerState` types; unrelated to general utils |
| Pane reset (item 14) | `Editor.ts` private method | Operates on `Pane` objects held by `Editor`; extract as `_resetPane(pane)` private method |
| Buffer load + highlight wiring (item 15) | `Editor.ts` private method | Encapsulates `Editor`-owned state (`highlighter`, `openBuffers`, render callback); extract as `_loadBufferIntoPane(buf, pane)` private method |
| Panel geometry (item 16) | `Renderer.ts` private helpers | Geometry formulas reference local layout constants; extract as two private methods `_searchPanelGeometry(W, H)` and `_jsTransformPanelGeometry(W, H)` |
| Title bar style (item 17) | `Renderer.ts` private helper | Wraps `DrawContext` + `THEME`; extract as `_applyTitleStyle(ctx, isActive)` private method |
| Selection reset (item 8) | `SearchPanel.ts` private method | Single-class internal; extract as `_resetSelection()` private method |

### Separate tokenizer utility file: `src/highlight/languages/util.ts`

All tokenizer-specific helpers (items 1–6) depend on `Token`, `TokenType`, and
`TokenizerState` from `src/highlight/tokens.ts`. They belong together in a
dedicated file rather than in the general `src/util.ts`:

```typescript
// src/highlight/languages/util.ts
import type { Token, TokenType, TokenizerState } from '../tokens.js';

export function push(
  tokens: Token[], type: TokenType, start: number, length: number
): void { ... }                                         // item 1

export function scanBlockComment(
  line: string, i: number, tokens: Token[], state: TokenizerState
): { i: number; continued: boolean } { ... }            // item 2

export function scanLineComment(
  line: string, i: number, tokens: Token[]
): number { ... }                                       // item 3

export function scanStringLiteral(
  line: string, i: number, tokens: Token[]
): number { ... }                                       // item 4

export function scanIdentifierContext(
  line: string, identStart: number, identEnd: number
): { isCall: boolean; afterDot: boolean } { ... }       // item 5
```

Number literal parsing (item 6) is parameterised differently between JS (allows
`_`) and C (does not), so it is better handled by two thin wrappers that call a
shared `scanNumber(line, i, allowSeparator)` helper in this same file.

### Migration order

1. Create `src/util.ts` with `fitStr`, `expandTabs`, `clampScroll`, `sortByScore`,
   `getIndent`, `getIndentLength`.
2. Create `src/highlight/languages/util.ts` with `push`, `scanBlockComment`,
   `scanLineComment`, `scanStringLiteral`, `scanIdentifierContext`, `scanNumber`.
3. Update all language tokenizers to import from `../util.js`; delete their local
   `push` definitions.
4. Update `Renderer.ts`: replace `fitStr` and `expandTabsFromCol` with imports
   from `../../util.js`.
5. Update `FileBrowser.ts`, `SearchPanel.ts`, `JsTransformPanel.ts`: replace
   `adjustScroll` bodies with `this.scrollOffset = clampScroll(...)` using the
   imported helper; delete the method or reduce it to a one-liner.
6. Update `FileSearch.ts` and `ProjectSearch.ts`: replace all four
   `results.sort(...)` calls with `sortByScore(results)`.
7. Update `Buffer.ts`: replace `insertNewline` body with `insertNewlineWithIndent`
   from `src/util.ts`; replace `deleteCharBefore` body with the util version;
   replace inline indent regex with `getIndent`/`getIndentLength`.
8. Update `JsTransformPanel.ts`: same as step 7 for its `insertNewline` and
   `deleteCharBefore`.
9. Update `Cursor.ts`: replace inline indent-length regex with `getIndentLength`.
10. Add private helpers to `Editor.ts` (`_resetPane`, `_loadBufferIntoPane`);
    collapse the five pane-reset sites and three buffer-load sites.
11. Add private helpers to `Renderer.ts` (`_applyTitleStyle`,
    `_searchPanelGeometry`, `_jsTransformPanelGeometry`); collapse the two title
    sites and duplicated geometry computations.
12. Add `_resetSelection()` private method to `SearchPanel.ts`; collapse the four
    `selectedIndex = 0; scrollOffset = 0` sites.
