import type { FileSearchResult } from '../search/FileSearch.js';
import type { ProjectSearchResult } from '../search/ProjectSearch.js';
import { displayPath } from '../utils/displayPath.js';
import { clampScroll } from '../util.js';

export type SearchMode = 'file' | 'project';

export type SearchResult = FileSearchResult | ProjectSearchResult;

export class SearchPanel {
  active = false;
  mode: SearchMode = 'file';
  needle = '';
  results: SearchResult[] = [];
  selectedIndex = 0;
  scrollOffset = 0;
  loading = false;

  open(mode: SearchMode): void {
    this.active = true;
    this.mode = mode;
    this.needle = '';
    this.results = [];
    this._resetSelection();
    this.loading = false;
  }

  close(): void {
    this.active = false;
    this.loading = false;
  }

  appendChar(ch: string): void {
    this.needle += ch;
    this._resetSelection();
  }

  deleteChar(): void {
    this.needle = this.needle.slice(0, -1);
    this._resetSelection();
  }

  setResults(results: SearchResult[]): void {
    this.results = results;
    this._resetSelection();
    this.loading = false;
  }

  updateResults(results: SearchResult[]): void {
    this.results = results;
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, results.length - 1));
    this.scrollOffset = 0;
  }

  get selected(): SearchResult | null {
    return this.results[this.selectedIndex] ?? null;
  }

  moveUp(): void {
    if (this.selectedIndex > 0) this.selectedIndex--;
    this.adjustScroll(0);
  }

  moveDown(): void {
    if (this.selectedIndex < this.results.length - 1) this.selectedIndex++;
    this.adjustScroll(0);
  }

  adjustScroll(visibleHeight: number): void {
    this.scrollOffset = clampScroll(this.selectedIndex, this.scrollOffset, visibleHeight);
  }

  private _resetSelection(): void {
    this.selectedIndex = 0;
    this.scrollOffset = 0;
  }

  getResultPath(result: SearchResult): string {
    if ('buffer' in result) return result.buffer.name;
    return displayPath(result.filePath);
  }

  getResultLine(result: SearchResult): number {
    return result.line;
  }
}
