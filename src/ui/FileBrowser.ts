import { readdirSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';

export interface DirEntry {
  name: string;
  isDir: boolean;
  fullPath: string;
}

export class FileBrowser {
  currentDir: string;
  entries: DirEntry[] = [];
  selectedIndex = 0;
  scrollOffset = 0;

  constructor(startDir: string) {
    this.currentDir = resolve(startDir);
    this.load();
  }

  load(): void {
    try {
      const items = readdirSync(this.currentDir);
      const entries: DirEntry[] = [];

      for (const name of items) {
        if (name.startsWith('.') && name !== '..') continue; // hide dotfiles
        try {
          const fullPath = join(this.currentDir, name);
          const stat = statSync(fullPath);
          entries.push({ name, isDir: stat.isDirectory(), fullPath });
        } catch {
          // skip unreadable entries
        }
      }

      // Sort: dirs first, then files, both alphabetically
      entries.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      // Add parent dir entry
      const parent = dirname(this.currentDir);
      if (parent !== this.currentDir) {
        entries.unshift({ name: '..', isDir: true, fullPath: parent });
      }

      this.entries = entries;
      this.selectedIndex = 0;
      this.scrollOffset = 0;
    } catch {
      this.entries = [];
    }
  }

  get selected(): DirEntry | null {
    return this.entries[this.selectedIndex] ?? null;
  }

  moveUp(): void {
    if (this.selectedIndex > 0) this.selectedIndex--;
    this.adjustScroll(0);
  }

  moveDown(): void {
    if (this.selectedIndex < this.entries.length - 1) this.selectedIndex++;
    this.adjustScroll(0);
  }

  adjustScroll(visibleHeight: number): void {
    if (visibleHeight <= 0) return;
    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex;
    }
    if (this.selectedIndex >= this.scrollOffset + visibleHeight) {
      this.scrollOffset = this.selectedIndex - visibleHeight + 1;
    }
  }

  navigateInto(): boolean {
    const sel = this.selected;
    if (!sel || !sel.isDir) return false;
    this.currentDir = sel.fullPath;
    this.load();
    return true;
  }

  goUp(): void {
    const parent = dirname(this.currentDir);
    if (parent !== this.currentDir) {
      const prevDir = this.currentDir;
      this.currentDir = parent;
      this.load();
      // Try to select the directory we came from
      const idx = this.entries.findIndex(e => e.fullPath === prevDir);
      if (idx >= 0) this.selectedIndex = idx;
    }
  }
}
