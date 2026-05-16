# Undo History — Implementation Plan

## Overview

Linear checkpoint-based undo history. Each buffer accumulates checkpoints automatically (3 s idle) and on save. The user opens a side panel listing all checkpoints; navigating the list previews each checkpoint in the source pane live. Choosing one reverts the buffer and starts new history from that point.

---

## New Files

### `src/editor/UndoHistory.ts`

The data model — lives entirely here, no UI concerns.

```
interface UndoCheckpoint {
  id: number;              // auto-increment, for display
  timestamp: number;       // Date.now()
  lines: string[];         // full snapshot of buffer.lines (defensive copy)
  cursorLine: number;
  cursorCol: number;
}

class UndoHistory {
  private checkpoints: UndoCheckpoint[] = [];
  private nextId = 1;

  // Snapshot current state. Drops all checkpoints after the current head
  // (called when new edits happen after a revert, enforcing linearity).
  checkpoint(lines: readonly string[], cursorLine: number, cursorCol: number): void

  // Returns the checkpoint at index (for preview or revert).
  get(index: number): UndoCheckpoint | undefined

  // Reverts: discards checkpoints[index+1..N] (forward history only),
  // keeping checkpoints[0..index]. The checkpoint at `index` becomes the
  // new head; future checkpoint() calls grow from there. Returns the
  // target snapshot, or null if index is out of range.
  revertTo(index: number): UndoCheckpoint | null

  get list(): readonly UndoCheckpoint[]   // oldest → newest order
  get count(): number
}
```

`revertTo` enforces linearity by discarding forward history. The reverted checkpoint remains in the list as the new head — no extra snapshot is needed after the revert.

---

### `src/ui/UndoPanel.ts`

State for the checkpoint-list panel — mirrors the shape of `SearchPanel.ts`.

```
class UndoPanel {
  active = false;
  targetBuffer: Buffer | null = null;   // whose history to show
  selectedIndex: number = 0;            // index into history.list
  scrollOffset: number = 0;
  previewLines: string[] | null = null; // set on navigation; renderer reads this

  open(buf: Buffer): void      // resets selection to last (most recent) checkpoint
  close(): void
  moveUp(): void               // toward newer checkpoints (visually up = toward top where newest lives); updates previewLines
  moveDown(): void             // toward older checkpoints (visually down = toward bottom where oldest lives); updates previewLines
  adjustScroll(visibleHeight: number): void
  get selected(): UndoCheckpoint | null
  private _syncPreview(): void // copies selected checkpoint's lines to previewLines
}
```

`previewLines` is the key: setting it here lets the renderer show checkpoint content in the source pane without touching `buf.lines`.

---

## Modified Files

### `src/constants.ts`

Add:
```ts
export const UNDO_CHECKPOINT_MS = 3000;
```

---

### `src/editor/Buffer.ts`

Add one field, initialized in the constructor:
```ts
readonly undoHistory = new UndoHistory();
```

**Do not** take a checkpoint in the constructor — `fromFile()` calls `new Buffer()` internally (producing a `['']` placeholder), so a constructor snapshot would always create a spurious empty-buffer entry.

**Initial checkpoint in `fromFile()`:** after the `_materializeSync()` call for small files (i.e., the `buf._lineOffsets.length < LAZY_THRESHOLD` branch), call:
```ts
buf.undoHistory.checkpoint([...buf._lines], 0, 0);
```

For large files (`_fullyLoaded = false`), skip the initial checkpoint — materialising the entire file just for an undo snapshot defeats lazy loading. For these buffers the first checkpoint is created by the idle timer after the first edit.

No changes to mutation methods (`insert`, `deleteChar`, etc.) — the `Editor` owns when to snapshot.

---

### `src/ui/StatusBar.ts`

Add `'undo'` to the `EditorMode` union:
```ts
export type EditorMode = 'edit' | 'filebrowser' | 'search' | 'jstransform' | 'undo';
```

Add an early-return branch at the top of `renderStatusBar` (before the `modeStr` calculation, alongside the existing `filebrowser` branch):
```ts
if (mode === 'undo') {
  ctx.setBold(true);
  ctx.write('UNDO HISTORY   ↑↓ navigate   Enter = revert   Esc = cancel'
    .slice(0, termWidth).padEnd(termWidth));
  ctx.reset();
  return;
}
```

---

### `src/ui/Layout.ts`

Add undo panel geometry alongside the existing browser panel:

```ts
undoPanelVisible = false;
undoPanelWidth = 44;          // wide enough for timestamp + label

toggleUndoPanel(): void       // mirrors toggleBrowser()
undoPanelBounds(): { x, y, w, h }
```

`_recompute()` shrinks the pane area from the right by `undoPanelWidth` when `undoPanelVisible`, exactly as it already does for the browser on the left. The undo panel always anchors to the right edge. `separators()` does not need to be updated — the renderer draws the panel border directly (same pattern as `_renderFileBrowser`).

> **Note:** If the browser is configured on the right side (`browserSide = 'right'`) and the undo panel is open simultaneously, the two panels will overlap. This is an acceptable limitation for the initial implementation.

---

### `src/editor/Editor.ts`

**New members:**
```ts
private undoPanel = new UndoPanel();
private _undoTimer: ReturnType<typeof setTimeout> | null = null;
```

**Timer helpers:**
```ts
private _resetUndoTimer(buf: Buffer, cursorLine: number, cursorCol: number): void {
  if (this._undoTimer) clearTimeout(this._undoTimer);
  this._undoTimer = setTimeout(() => {
    buf.undoHistory.checkpoint([...buf.lines], cursorLine, cursorCol);
  }, UNDO_CHECKPOINT_MS);
}
```

Called at the end of every mutation branch in `handleEditKey` (enter, backspace, delete, tab, printable char). Pass the pane's cursor position at the time of the edit so the checkpoint remembers where the cursor was.

**On save (Ctrl+S):** call `buf.undoHistory.checkpoint(...)` immediately (skip the timer), then cancel the pending timer.

**`render()` call:** add `this.undoPanel` to the `renderer.render(...)` call:
```ts
private render(): void {
  this.renderer.render(
    this.layout,
    this.fileBrowser,
    this.searchPanel,
    this.jsTransformPanel,
    this.undoPanel,       // new
    this.highlighter,
    this.mode,
    this.message
  );
}
```

**`handleKey()` dispatch:** add the undo case alongside the existing mode cases:
```ts
case 'undo': this.handleUndoKey(ev); break;
```

**New key binding — `Ctrl+U` in edit mode:**
```ts
case 'u': {
  const buf = this.layout.activePane.buffer;
  if (!buf || buf.undoHistory.count === 0) return;
  this.undoPanel.open(buf);
  this.layout.toggleUndoPanel();   // shows the panel, narrows panes
  this.mode = 'undo';
  return;
}
```

**New mode handler — `handleUndoKey(ev)`:**

| Key | Context | Action |
|-----|---------|--------|
| `↑` | undo mode | `undoPanel.moveUp()` → renderer shows `previewLines` in source pane |
| `↓` | undo mode | `undoPanel.moveDown()` → same |
| `Enter` | undo mode | Revert: see below |
| `Esc` / `Ctrl+U` | undo mode | Cancel: `undoPanel.close()`, `layout.toggleUndoPanel()`, `mode = 'edit'` |

**Revert flow (Enter in undo mode):**
1. `const cp = undoPanel.selected`; if null, cancel.
2. `buf.undoHistory.revertTo(undoPanel.selectedIndex)` — discards forward history; `cp` is now the head.
3. `buf.lines = [...cp.lines]` — replace live content (uses the existing `set lines` setter).
4. `buf.modified = true`.
5. Move the pane cursor to `cp.cursorLine / cp.cursorCol`, clamp to new line count.
6. `highlighter.invalidateFrom(0, buf)` — full highlight cache bust.
7. `undoPanel.close()`, `layout.toggleUndoPanel()`, `mode = 'edit'`.

No extra `checkpoint()` call after revert — `cp` already sits at the head of history; the next idle timer or save will add the next entry naturally.

---

### `src/terminal/Renderer.ts`

**1. Add `undoPanel: UndoPanel` to `render()` signature** (after `jsTransformPanel`).

**2. Update `isActive` calculation** to include the undo panel (parallel to `searchPanel.active` and `jsTransformPanel.active`):
```ts
const isActive = i === layout.activePaneIndex
  && !layout.browserFocused
  && !searchPanel.active
  && !jsTransformPanel.active
  && !undoPanel.active;   // new
```

**3. Pane content override:** `_renderPane` currently uses `pane.buffer.getLine(lineNum)` and `pane.buffer.lineCount`. When previewing a checkpoint, these must be redirected to `undoPanel.previewLines`. Introduce local helpers at the top of `_renderPane`:

```ts
const previewActive =
  undoPanel.active &&
  undoPanel.targetBuffer === pane.buffer &&
  undoPanel.previewLines !== null;

const effectiveLineCount = previewActive
  ? undoPanel.previewLines!.length
  : (pane.buffer?.lineCount ?? 0);

const getEffectiveLine = (n: number): string =>
  previewActive
    ? (undoPanel.previewLines![n] ?? '')
    : (pane.buffer?.getLine(n) ?? '');
```

Replace every `pane.buffer.lineCount` with `effectiveLineCount` and every `pane.buffer.getLine(lineNum)` with `getEffectiveLine(lineNum)` inside `_renderPane`. No buffer mutation required.

> **Known limitation:** `highlighter.getTokensForLine(lineNum, pane.buffer)` is left unchanged — it still pulls from the live buffer's highlight cache. This means syntax colouring during preview may not match the preview content exactly. Acceptable for the initial implementation; fixing it would require a separate highlight cache per checkpoint, which is out of scope.

**4. Draw the undo panel:** when `undoPanel.active`, draw into `layout.undoPanelBounds()`. Each row shows one checkpoint (newest at top):

```
 #12  14:32:05  (128 lines)
 #11  14:31:44  (127 lines)   ← selected row, reverse-video
 #10  14:28:03  (127 lines)
  …
```

Call `undoPanel.adjustScroll(visibleHeight)` before the render loop (same pattern as `sp.adjustScroll(resultsH)` in `_renderSearchPanel`) so the selected row stays in view after terminal resize.

The display order is **newest at top**: iterate `history.list` in reverse (from `count - 1` down to `scrollOffset`) so that the most recent checkpoint occupies visual row 0. `selectedIndex` is an index into `history.list` (0 = oldest, `count-1` = newest); the visual row of the selected item is `(count - 1 - selectedIndex) - scrollOffset`.

`scrollOffset` lives in display-index space: display-index 0 is the newest checkpoint, display-index `count-1` is the oldest.

---

## Key Binding Summary (additions)

| Key | Context | Action |
|-----|---------|--------|
| `Ctrl+U` | edit mode | Open undo history panel |
| `↑` / `↓` | undo mode | Navigate checkpoints (live preview) |
| `Enter` | undo mode | Revert to selected checkpoint |
| `Esc` / `Ctrl+U` | undo mode | Cancel, close panel |

---

## Checkpoint Lifecycle

```
file loaded (small)  →  checkpoint #0 (original content)
file loaded (large)  →  no initial checkpoint (lazy; first checkpoint after first idle)
edit, edit, edit     →  _undoTimer restarted after each keystroke
3 s of idle          →  checkpoint #N created automatically
Ctrl+S save          →  checkpoint #N created immediately, timer cancelled
Ctrl+U → navigate    →  previewLines swapped in renderer (buf.lines untouched)
Enter (revert)       →  buf.lines ← checkpoint.lines
                         forward history discarded (checkpoints[index+1..N] dropped)
                         checkpoint[index] is now the head
                         new edits grow from here via idle timer
```

---

## What Is Not Covered (out of scope)

- Per-change granularity (character-level undo/redo) — checkpoints are coarse-grained by design.
- Multiple buffers open in the same pane: the undo panel is always tied to the buffer that was active when `Ctrl+U` was pressed.
- Memory cap on checkpoint count — acceptable for now; can add a max-N eviction policy later if needed.
- The undo panel does not itself have a dedicated `Buffer` object — it is a synthetic overlay, consistent with `SearchPanel` and `FileBrowser`.
- Buffer switching (Alt+←/→, Ctrl+N) while in undo mode is not explicitly handled — pressing those keys in undo mode will be ignored (the key dispatch routes to `handleUndoKey` which only handles ↑↓/Enter/Esc/Ctrl+U).
