import { Pane } from './Pane.js';

export type LayoutMode = 'single' | 'hsplit2' | 'vsplit2' | 'quad';
export type BrowserSide = 'left' | 'right';

export class Layout {
  mode: LayoutMode = 'single';
  panes: Pane[] = [new Pane()];
  activePaneIndex = 0;

  browserVisible = false;
  browserSide: BrowserSide = 'left';
  browserWidth = 32;
  browserFocused = false;

  private _termW = 80;
  private _termH = 24;

  update(w: number, h: number): void {
    this._termW = w;
    this._termH = h;
    this._recompute();
  }

  setMode(mode: LayoutMode): void {
    const prevPanes = this.panes.slice();
    this.mode = mode;

    // Preserve existing panes, add new ones inheriting the active buffer
    const needed = mode === 'quad' ? 4 : mode === 'single' ? 1 : 2;
    while (prevPanes.length < needed) {
      const newPane = new Pane();
      newPane.buffer = prevPanes[this.activePaneIndex]?.buffer ?? null;
      prevPanes.push(newPane);
    }
    this.panes = prevPanes.slice(0, needed);

    if (this.activePaneIndex >= this.panes.length) {
      this.activePaneIndex = this.panes.length - 1;
    }
    this._recompute();
  }

  toggleBrowser(side?: BrowserSide): void {
    if (side !== undefined) this.browserSide = side;
    this.browserVisible = !this.browserVisible;
    this.browserFocused = this.browserVisible;
    this._recompute();
  }

  get activePane(): Pane {
    return this.panes[this.activePaneIndex];
  }

  nextPane(): void {
    this.activePaneIndex = (this.activePaneIndex + 1) % this.panes.length;
  }

  prevPane(): void {
    this.activePaneIndex = (this.activePaneIndex - 1 + this.panes.length) % this.panes.length;
  }

  browserBounds(): { x: number; y: number; w: number; h: number } {
    const h = this._termH - 1; // minus status bar
    const x = this.browserSide === 'left' ? 0 : this._termW - this.browserWidth;
    return { x, y: 0, w: this.browserWidth, h };
  }

  get termW(): number { return this._termW; }
  get termH(): number { return this._termH; }

  private _recompute(): void {
    const W = this._termW;
    const H = this._termH - 1; // bottom row = status bar

    let cX = 0;
    let cW = W;

    if (this.browserVisible) {
      if (this.browserSide === 'left') {
        cX = this.browserWidth;
        cW = W - this.browserWidth;
      } else {
        cW = W - this.browserWidth;
      }
    }

    // Ensure at least 1 column wide
    cW = Math.max(1, cW);

    switch (this.mode) {
      case 'single':
        this._setPaneRect(0, cX, 0, cW, H);
        break;

      case 'hsplit2': {
        // Vertical separator at mid point — each pane gets half minus separator
        const sep = Math.floor(cW / 2);
        const leftW = sep - 1;
        const rightW = cW - sep;
        this._setPaneRect(0, cX, 0, Math.max(1, leftW), H);
        this._setPaneRect(1, cX + sep, 0, Math.max(1, rightW), H);
        break;
      }

      case 'vsplit2': {
        const sep = Math.floor(H / 2);
        const topH = sep - 1;
        const botH = H - sep;
        this._setPaneRect(0, cX, 0, cW, Math.max(1, topH));
        this._setPaneRect(1, cX, sep, cW, Math.max(1, botH));
        break;
      }

      case 'quad': {
        const hSep = Math.floor(cW / 2);
        const vSep = Math.floor(H / 2);
        const leftW  = hSep - 1;
        const rightW = cW - hSep;
        const topH   = vSep - 1;
        const botH   = H - vSep;
        this._setPaneRect(0, cX, 0, Math.max(1, leftW), Math.max(1, topH));
        this._setPaneRect(1, cX + hSep, 0, Math.max(1, rightW), Math.max(1, topH));
        this._setPaneRect(2, cX, vSep, Math.max(1, leftW), Math.max(1, botH));
        this._setPaneRect(3, cX + hSep, vSep, Math.max(1, rightW), Math.max(1, botH));
        break;
      }
    }
  }

  private _setPaneRect(idx: number, x: number, y: number, w: number, h: number): void {
    if (idx >= this.panes.length) return;
    const p = this.panes[idx];
    p.x = x; p.y = y; p.width = w; p.height = h;
  }

  // Separator positions for drawing borders
  separators(): Array<{ type: 'vertical' | 'horizontal'; pos: number; start: number; end: number }> {
    const seps: Array<{ type: 'vertical' | 'horizontal'; pos: number; start: number; end: number }> = [];
    const H = this._termH - 1;
    let cX = 0;
    let cW = this._termW;

    if (this.browserVisible) {
      if (this.browserSide === 'left') { cX = this.browserWidth; cW -= this.browserWidth; }
      else { cW -= this.browserWidth; }
    }

    if (this.mode === 'hsplit2' || this.mode === 'quad') {
      const sep = Math.floor(cW / 2);
      seps.push({ type: 'vertical', pos: cX + sep - 1, start: 0, end: H - 1 });
    }
    if (this.mode === 'vsplit2' || this.mode === 'quad') {
      const sep = Math.floor(H / 2);
      seps.push({ type: 'horizontal', pos: sep - 1, start: cX, end: cX + cW - 1 });
    }
    if (this.browserVisible) {
      const bx = this.browserSide === 'left' ? this.browserWidth - 1 : this._termW - this.browserWidth - 1;
      seps.push({ type: 'vertical', pos: bx, start: 0, end: H - 1 });
    }
    return seps;
  }
}
