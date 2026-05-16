export interface UndoCheckpoint {
  id: number;
  timestamp: number;
  lines: string[];
  cursorLine: number;
  cursorCol: number;
}

export class UndoHistory {
  private _checkpoints: UndoCheckpoint[] = [];
  private _nextId = 1;

  checkpoint(lines: readonly string[], cursorLine: number, cursorCol: number): void {
    this._checkpoints.push({
      id: this._nextId++,
      timestamp: Date.now(),
      lines: [...lines],
      cursorLine,
      cursorCol,
    });
  }

  get(index: number): UndoCheckpoint | undefined {
    return this._checkpoints[index];
  }

  revertTo(index: number): UndoCheckpoint | null {
    if (index < 0 || index >= this._checkpoints.length) return null;
    this._checkpoints = this._checkpoints.slice(0, index + 1);
    return this._checkpoints[index];
  }

  get list(): readonly UndoCheckpoint[] {
    return this._checkpoints;
  }

  get count(): number {
    return this._checkpoints.length;
  }
}
