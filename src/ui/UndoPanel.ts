import type { Buffer } from '../editor/Buffer.js';
import type { UndoCheckpoint } from '../editor/UndoHistory.js';

export class UndoPanel {
  active = false;
  targetBuffer: Buffer | null = null;
  selectedIndex: number = 0;
  scrollOffset: number = 0;
  previewLines: string[] | null = null;

  open(buf: Buffer): void {
    this.active = true;
    this.targetBuffer = buf;
    this.selectedIndex = Math.max(0, buf.undoHistory.count - 1);
    this.scrollOffset = 0;
    this._syncPreview();
  }

  close(): void {
    this.active = false;
    this.targetBuffer = null;
    this.previewLines = null;
    this.scrollOffset = 0;
  }

  // Move toward newer checkpoints (visually up, toward top where newest lives).
  moveUp(): void {
    if (!this.targetBuffer) return;
    if (this.selectedIndex < this.targetBuffer.undoHistory.count - 1) {
      this.selectedIndex++;
    }
    this._syncPreview();
  }

  // Move toward older checkpoints (visually down, toward bottom where oldest lives).
  moveDown(): void {
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
    }
    this._syncPreview();
  }

  adjustScroll(visibleHeight: number): void {
    if (!this.targetBuffer || visibleHeight <= 0) return;
    const count = this.targetBuffer.undoHistory.count;
    if (count === 0) return;
    // Display index 0 = newest (selectedIndex = count-1), display index count-1 = oldest.
    const displayIndex = (count - 1) - this.selectedIndex;
    if (displayIndex < this.scrollOffset) {
      this.scrollOffset = displayIndex;
    } else if (displayIndex >= this.scrollOffset + visibleHeight) {
      this.scrollOffset = displayIndex - visibleHeight + 1;
    }
  }

  get selected(): UndoCheckpoint | null {
    if (!this.targetBuffer) return null;
    return this.targetBuffer.undoHistory.get(this.selectedIndex) ?? null;
  }

  private _syncPreview(): void {
    const cp = this.selected;
    this.previewLines = cp ? [...cp.lines] : null;
  }
}
