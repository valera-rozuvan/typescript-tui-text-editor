import { TAB_CHAR_COUNT } from './constants.js';

export function fitStr(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width);
  return s.padEnd(width);
}

export function expandTabs(text: string): string {
  let out = '';
  for (const ch of text) {
    out += ch === '\t' ? ' '.repeat(TAB_CHAR_COUNT) : ch;
  }
  return out;
}

/** Returns the updated scroll offset so that `index` is visible within `visibleHeight` rows. */
export function clampScroll(index: number, offset: number, visibleHeight: number): number {
  if (visibleHeight <= 0) return offset;
  if (index < offset) return index;
  if (index >= offset + visibleHeight) return index - visibleHeight + 1;
  return offset;
}

export function sortByScore<T extends { score: number }>(results: T[]): void {
  results.sort((a, b) => b.score - a.score);
}

export function getIndent(line: string): string {
  return line.match(/^(\s*)/)?.[1] ?? '';
}

export function getIndentLength(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

/**
 * Delete the character before (line, col) in-place. Returns new cursor position.
 * No-op (returns same position) when already at the start of the first line.
 */
export function deleteCharBefore(
  lines: string[],
  line: number,
  col: number
): { line: number; col: number } {
  if (col > 0) {
    const l = lines[line];
    lines[line] = l.slice(0, col - 1) + l.slice(col);
    return { line, col: col - 1 };
  }
  if (line > 0) {
    const prev = lines[line - 1];
    lines[line - 1] = prev + lines[line];
    lines.splice(line, 1);
    return { line: line - 1, col: prev.length };
  }
  return { line, col };
}

/**
 * Split `lines[line]` at `col`, carrying leading whitespace onto the new line.
 * Returns new cursor position (start of the indented new line).
 */
export function insertNewlineWithIndent(
  lines: string[],
  line: number,
  col: number
): { line: number; col: number } {
  const l = lines[line];
  const indent = getIndent(l);
  const after = l.slice(col);
  lines[line] = l.slice(0, col);
  lines.splice(line + 1, 0, indent + after);
  return { line: line + 1, col: indent.length };
}
