import type { Buffer } from '../editor/Buffer.js';
import { fuzzyMatch } from './FuzzyMatcher.js';
import { sortByScore } from '../util.js';

export interface FileSearchResult {
  buffer: Buffer;
  line: number;
  col: number;
  snippet: string;
  matchIndices: number[];
  score: number;
}

export function searchInBuffer(needle: string, buf: Buffer): FileSearchResult[] {
  if (!needle) return [];
  // Materialize lazy buffers up-front: a line-by-line search over a lazy buffer
  // would cause O(N) readSync calls on a large file, which is prohibitively slow.
  buf.materialize();
  const results: FileSearchResult[] = [];

  for (let ln = 0; ln < buf.lineCount; ln++) {
    const line = buf.getLine(ln);
    const match = fuzzyMatch(needle, line);
    if (match) {
      results.push({
        buffer: buf,
        line: ln,
        col: match.indices[0] ?? 0,
        snippet: line,
        matchIndices: match.indices,
        score: match.score,
      });
    }
  }

  sortByScore(results);
  return results;
}

export function searchInBuffers(needle: string, buffers: Buffer[]): FileSearchResult[] {
  const results: FileSearchResult[] = [];
  for (const buf of buffers) {
    results.push(...searchInBuffer(needle, buf));
  }
  sortByScore(results);
  return results;
}
