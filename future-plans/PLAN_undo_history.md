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

  // Reverts: keeps checkpoints[0..index] only, returns the target snapshot.
  // New history will grow from here on the next checkpoint() call.
  revertTo(index: number): UndoCheckpoint | null

  get list(): readonly UndoCheckpoint[]   // oldest → newest order
  get count(): number
}
```

The `revertTo` truncation enforces linearity: forward history is discarded, the reverted state becomes the new head.

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
  moveUp(): void               // toward older checkpoints; updates previewLines
  moveDown(): void             // toward newer checkpoints; updates previewLines
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

Take an **initial checkpoint** at the end of the constructor and at the end of `fromFile()`, so the "original state" is always checkpoint #0. No other changes — mutation methods (`insert`, `deleteChar`, etc.) stay as-is; the `Editor` owns when to snapshot.

---

### `src/ui/StatusBar.ts`

Add `'undo'` to the `EditorMode` union. Display a hint line when the mode is `'undo'`:

```
UNDO HISTORY   ↑↓ navigate   Enter = revert   Esc = cancel
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

`_recompute()` shrinks the pane area from the right by `undoPanelWidth` when `undoPanelVisible`, exactly as it already does for the browser on the left. The undo panel always anchors to the right edge.

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
2. `buf.undoHistory.revertTo(undoPanel.selectedIndex)` — truncates forward history.
3. `buf.lines = [...cp.lines]` — replace live content.
4. `buf.modified = true`.
5. Move the pane cursor to `cp.cursorLine / cp.cursorCol`, clamp to new line count.
6. `highlighter.invalidateFrom(0, buf)` — full highlight cache bust.
7. `undoPanel.close()`, `layout.toggleUndoPanel()`, `mode = 'edit'`.
8. Immediately call `buf.undoHistory.checkpoint(buf.lines, ...)` so the reverted state is itself a checkpoint and new edits grow from here.

---

### `src/terminal/Renderer.ts`

Two additions:

**1. Accept `undoPanel: UndoPanel` in `render()`.**

**2. Pane content override:** in the section that draws pane lines, check:
```ts
const lines =
  undoPanel.active &&
  undoPanel.targetBuffer === pane.buffer &&
  undoPanel.previewLines !== null
    ? undoPanel.previewLines
    : pane.buffer.lines;
```
Use `lines` everywhere the renderer currently reads `pane.buffer.lines`. This makes preview transparent — no buffer mutation required.

**3. Draw the undo panel:** when `undoPanel.active`, draw into `undoPanelBounds()`. Each row shows one checkpoint (newest at top):

```
 #12  14:32:05  (128 lines)
 #11  14:31:44  (127 lines)   ← selected row, reverse-video
 #10  14:28:03  (127 lines)
  …
```

The panel has its own scroll offset managed by `UndoPanel.adjustScroll()`.

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
file loaded        →  checkpoint #0 (original content)
edit, edit, edit   →  _undoTimer restarted after each keystroke
3 s of idle        →  checkpoint #N created automatically
Ctrl+S save        →  checkpoint #N created immediately, timer cancelled
Ctrl+U → navigate  →  previewLines swapped in renderer (buf.lines untouched)
Enter (revert)     →  buf.lines ← checkpoint.lines
                       forward history truncated
                       checkpoint #0 (new) = reverted state
                       new edits grow from here
```

---

## What Is Not Covered (out of scope)

- Per-change granularity (character-level undo/redo) — checkpoints are coarse-grained by design.
- Multiple buffers open in the same pane: the undo panel is always tied to the buffer that was active when `Ctrl+U` was pressed.
- Memory cap on checkpoint count — acceptable for now; can add a max-N eviction policy later if needed.
- The undo panel does not itself have a dedicated `Buffer` object — it is a synthetic overlay, consistent with `SearchPanel` and `FileBrowser`.
