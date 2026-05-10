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
- `src/editor/Buffer.ts` (~lines 90, 100)
- `src/ui/JsTransformPanel.ts` (~line 40)
- `src/editor/Cursor.ts` (~line 56, slight variant)

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
- `src/search/FileSearch.ts` (appears twice)
- `src/search/ProjectSearch.ts` (appears twice)

**Repeated code:**
```typescript
results.sort((a, b) => b.score - a.score);
```

---

## Summary

| Priority | Duplication | Files affected |
|----------|-------------|----------------|
| High | `push()` helper | 5+ tokenizer files |
| High | `adjustScroll()` | 3 UI components |
| Medium | Block/line comment parsing | `javascript.ts`, `c.ts` |
| Medium | String literal parsing | `javascript.ts`, `c.ts`, `html.ts`, `css.ts` |
| Medium | Identifier classification prelude | `javascript.ts`, `c.ts` |
| Low | Selection reset pattern | `SearchPanel.ts` (internal) |
| Low | Indentation extraction | `Buffer.ts`, `JsTransformPanel.ts`, `Cursor.ts` |
| Low | Sort-by-score | `FileSearch.ts`, `ProjectSearch.ts` |
