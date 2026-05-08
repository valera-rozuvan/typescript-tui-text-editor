import type { Buffer } from '../editor/Buffer.js';
import { fuzzyMatch } from './FuzzyMatcher.js';

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

  results.sort((a, b) => b.score - a.score);
  return results;
}

export function searchInBuffers(needle: string, buffers: Buffer[]): FileSearchResult[] {
  const results: FileSearchResult[] = [];
  for (const buf of buffers) {
    results.push(...searchInBuffer(needle, buf));
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}
