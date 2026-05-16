import type { Token, TokenType, TokenizerState } from '../tokens.js';

export function push(tokens: Token[], type: TokenType, start: number, length: number): void {
  if (length > 0) tokens.push({ type, start, length });
}

/**
 * Called when `state.inBlockComment` is true at position `i`.
 * Scans for `*\/`, emits a comment token, clears `state.inBlockComment` when found.
 * Returns new value of `i` (equal to `line.length` when `*\/` was not found).
 */
export function scanBlockComment(
  line: string,
  i: number,
  tokens: Token[],
  state: TokenizerState
): number {
  const end = line.indexOf('*/', i);
  if (end === -1) {
    push(tokens, 'comment', i, line.length - i);
    return line.length;
  }
  push(tokens, 'comment', i, end + 2 - i);
  state.inBlockComment = false;
  return end + 2;
}

/** Consume a `//` line comment starting at `i`. Returns `line.length`. */
export function scanLineComment(line: string, i: number, tokens: Token[]): number {
  push(tokens, 'comment', i, line.length - i);
  return line.length;
}

/**
 * Consume a quoted string literal starting at `i` (where `line[i] === quote`).
 * Handles backslash escapes. Emits a `'string'` token. Returns new `i`.
 */
export function scanStringLiteral(
  line: string,
  i: number,
  tokens: Token[],
  quote: string
): number {
  let j = i + 1;
  while (j < line.length && line[j] !== quote) {
    if (line[j] === '\\') j++;
    j++;
  }
  if (j < line.length) j++;
  push(tokens, 'string', i, j - i);
  return j;
}

/**
 * Determine call/member-access context for the identifier spanning
 * `line[identStart..identEnd)`.
 *
 * `extraMemberAccessChars` lists characters (besides `.`) that count as member-access
 * operators when immediately preceding the identifier — pass `'>'` for C's `->`.
 */
export function scanIdentifierContext(
  line: string,
  identStart: number,
  identEnd: number,
  extraMemberAccessChars = ''
): { isCall: boolean; afterDot: boolean } {
  let k = identEnd;
  while (k < line.length && line[k] === ' ') k++;
  const isCall = line[k] === '(';

  let prevNonSpace = '';
  for (let p = identStart - 1; p >= 0; p--) {
    if (line[p] !== ' ' && line[p] !== '\t') { prevNonSpace = line[p]; break; }
  }
  const afterDot = prevNonSpace !== '' && (prevNonSpace === '.' || extraMemberAccessChars.includes(prevNonSpace));

  return { isCall, afterDot };
}

/**
 * Scan a numeric literal starting at `i` (hex or decimal-with-exponent).
 * `allowSeparator`: when true, `_` is allowed as a digit separator (JS/TS).
 * Returns new `i` after the last digit (before any language-specific suffix like `n` or `uL`).
 */
export function scanNumber(line: string, i: number, allowSeparator: boolean): number {
  let j = i;

  if (line[j] === '0' && (line[j + 1] === 'x' || line[j + 1] === 'X')) {
    j += 2;
    while (j < line.length && (allowSeparator ? /[0-9a-fA-F_]/ : /[0-9a-fA-F]/).test(line[j])) j++;
  } else {
    while (j < line.length && (allowSeparator ? /[0-9_]/ : /[0-9]/).test(line[j])) j++;
    if (j < line.length && line[j] === '.') {
      j++;
      while (j < line.length && (allowSeparator ? /[0-9_]/ : /[0-9]/).test(line[j])) j++;
    }
    if (j < line.length && /[eE]/.test(line[j])) {
      j++;
      if (j < line.length && /[+-]/.test(line[j])) j++;
      while (j < line.length && (allowSeparator ? /[0-9_]/ : /[0-9]/).test(line[j])) j++;
    }
  }

  return j;
}
