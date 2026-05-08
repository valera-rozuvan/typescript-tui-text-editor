import assert from 'node:assert/strict';
import { Buffer } from '../../dist/editor/Buffer.js';
import { SearchPanel } from '../../dist/ui/SearchPanel.js';
import type { FileSearchResult } from '../../dist/search/FileSearch.js';
import type { ProjectSearchResult } from '../../dist/search/ProjectSearch.js';
import type { TestCase } from './types.js';

export const suite = 'SearchPanel';

function makeFileResult(lineno = 0): FileSearchResult {
  const buf = new Buffer('hello\nworld');
  return { buffer: buf, line: lineno, col: 0, snippet: 'hello', matchIndices: [0] };
}

function makeProjectResult(lineno = 5): ProjectSearchResult {
  return { filePath: '/some/file.ts', line: lineno, col: 0, snippet: 'code', matchIndices: [0] };
}

export const tests: TestCase[] = [
  {
    name: 'open: sets active, resets needle and results',
    fn: () => {
      const sp = new SearchPanel();
      sp.needle = 'old';
      sp.results = [makeFileResult()];
      sp.selectedIndex = 1;
      sp.open('file');
      assert.equal(sp.active, true);
      assert.equal(sp.mode, 'file');
      assert.equal(sp.needle, '');
      assert.equal(sp.results.length, 0);
      assert.equal(sp.selectedIndex, 0);
      assert.equal(sp.loading, false);
    },
  },
  {
    name: 'open: works with project mode',
    fn: () => {
      const sp = new SearchPanel();
      sp.open('project');
      assert.equal(sp.mode, 'project');
    },
  },
  {
    name: 'close: sets active to false',
    fn: () => {
      const sp = new SearchPanel();
      sp.open('file');
      sp.close();
      assert.equal(sp.active, false);
      assert.equal(sp.loading, false);
    },
  },
  {
    name: 'appendChar: adds character to needle and resets selection',
    fn: () => {
      const sp = new SearchPanel();
      sp.open('file');
      sp.selectedIndex = 3;
      sp.appendChar('h');
      sp.appendChar('i');
      assert.equal(sp.needle, 'hi');
      assert.equal(sp.selectedIndex, 0);
      assert.equal(sp.scrollOffset, 0);
    },
  },
  {
    name: 'deleteChar: removes last character from needle',
    fn: () => {
      const sp = new SearchPanel();
      sp.needle = 'hello';
      sp.deleteChar();
      assert.equal(sp.needle, 'hell');
    },
  },
  {
    name: 'deleteChar: no-op on empty needle',
    fn: () => {
      const sp = new SearchPanel();
      sp.needle = '';
      sp.deleteChar();
      assert.equal(sp.needle, '');
    },
  },
  {
    name: 'setResults: stores results and resets selection',
    fn: () => {
      const sp = new SearchPanel();
      sp.selectedIndex = 5;
      const results = [makeFileResult(0), makeFileResult(1)];
      sp.setResults(results);
      assert.equal(sp.results.length, 2);
      assert.equal(sp.selectedIndex, 0);
      assert.equal(sp.scrollOffset, 0);
      assert.equal(sp.loading, false);
    },
  },
  {
    name: 'selected: returns result at selectedIndex',
    fn: () => {
      const sp = new SearchPanel();
      const r0 = makeFileResult(0);
      const r1 = makeFileResult(1);
      sp.setResults([r0, r1]);
      sp.selectedIndex = 1;
      assert.equal(sp.selected, r1);
    },
  },
  {
    name: 'selected: returns null when results is empty',
    fn: () => {
      const sp = new SearchPanel();
      assert.equal(sp.selected, null);
    },
  },
  {
    name: 'moveDown: increments selectedIndex',
    fn: () => {
      const sp = new SearchPanel();
      sp.setResults([makeFileResult(0), makeFileResult(1)]);
      sp.moveDown();
      assert.equal(sp.selectedIndex, 1);
    },
  },
  {
    name: 'moveDown: does not exceed last result',
    fn: () => {
      const sp = new SearchPanel();
      sp.setResults([makeFileResult(0)]);
      sp.moveDown();
      assert.equal(sp.selectedIndex, 0);
    },
  },
  {
    name: 'moveUp: decrements selectedIndex',
    fn: () => {
      const sp = new SearchPanel();
      sp.setResults([makeFileResult(0), makeFileResult(1)]);
      sp.selectedIndex = 1;
      sp.moveUp();
      assert.equal(sp.selectedIndex, 0);
    },
  },
  {
    name: 'moveUp: does not go below 0',
    fn: () => {
      const sp = new SearchPanel();
      sp.setResults([makeFileResult(0)]);
      sp.selectedIndex = 0;
      sp.moveUp();
      assert.equal(sp.selectedIndex, 0);
    },
  },
  {
    name: 'adjustScroll: scrolls down when selection exceeds visible height',
    fn: () => {
      const sp = new SearchPanel();
      sp.setResults(Array.from({ length: 20 }, (_, i) => makeFileResult(i)));
      sp.selectedIndex = 15;
      sp.scrollOffset = 0;
      sp.adjustScroll(10);
      assert.ok(sp.scrollOffset <= 15);
      assert.ok(sp.scrollOffset + 10 > 15);
    },
  },
  {
    name: 'adjustScroll: scrolls up when selection above visible region',
    fn: () => {
      const sp = new SearchPanel();
      sp.setResults(Array.from({ length: 20 }, (_, i) => makeFileResult(i)));
      sp.selectedIndex = 2;
      sp.scrollOffset = 8;
      sp.adjustScroll(10);
      assert.equal(sp.scrollOffset, 2);
    },
  },
  {
    name: 'getResultPath: returns buffer name for FileSearchResult',
    fn: () => {
      const sp = new SearchPanel();
      const r = makeFileResult();
      assert.equal(sp.getResultPath(r), '[No Name]');
    },
  },
  {
    name: 'getResultPath: returns filePath for ProjectSearchResult',
    fn: () => {
      const sp = new SearchPanel();
      const r = makeProjectResult();
      assert.equal(sp.getResultPath(r), '/some/file.ts');
    },
  },
  {
    name: 'getResultLine: returns line number',
    fn: () => {
      const sp = new SearchPanel();
      assert.equal(sp.getResultLine(makeFileResult(7)), 7);
      assert.equal(sp.getResultLine(makeProjectResult(42)), 42);
    },
  },
];
