import type { Tokenizer, TokenizerState, LineTokens, Token, TokenType } from '../tokens.js';

const KEYWORDS = new Set([
  'auto','break','case','char','const','continue','default','do','double',
  'else','enum','extern','float','for','goto','if','inline','int','long',
  'register','restrict','return','short','signed','sizeof','static','struct',
  'switch','typedef','union','unsigned','void','volatile','while',
  'NULL','true','false','bool','_Bool','_Complex','_Imaginary',
]);

const TYPES = new Set([
  'int','char','float','double','long','short','void','unsigned','signed',
  'size_t','ptrdiff_t','intptr_t','uintptr_t','int8_t','int16_t','int32_t',
  'int64_t','uint8_t','uint16_t','uint32_t','uint64_t','ssize_t','FILE',
]);

export const cTokenizer: Tokenizer = {
  tokenizeLine(line: string, state: TokenizerState): { tokens: LineTokens; nextState: TokenizerState } {
    const tokens: Token[] = [];
    const st: TokenizerState = { ...state };
    let i = 0;

    // Preprocessor directives
    const trimmed = line.trimStart();
    if (!st.inBlockComment && trimmed.startsWith('#')) {
      const ws = line.length - trimmed.length;
      push(tokens, 'directive', 0, line.length);
      return { tokens, nextState: st };
    }

    while (i < line.length) {
      if (st.inBlockComment) {
        const end = line.indexOf('*/', i);
        if (end === -1) {
          push(tokens, 'comment', i, line.length - i);
          i = line.length;
        } else {
          push(tokens, 'comment', i, end + 2 - i);
          i = end + 2;
          st.inBlockComment = false;
        }
        continue;
      }

      if (line[i] === '/' && line[i + 1] === '/') {
        push(tokens, 'comment', i, line.length - i);
        i = line.length;
        continue;
      }

      if (line[i] === '/' && line[i + 1] === '*') {
        const end = line.indexOf('*/', i + 2);
        if (end === -1) {
          push(tokens, 'comment', i, line.length - i);
          i = line.length;
          st.inBlockComment = true;
        } else {
          push(tokens, 'comment', i, end + 2 - i);
          i = end + 2;
        }
        continue;
      }

      // Char literals
      if (line[i] === "'") {
        let j = i + 1;
        while (j < line.length && line[j] !== "'") {
          if (line[j] === '\\') j++;
          j++;
        }
        if (j < line.length) j++;
        push(tokens, 'string', i, j - i);
        i = j;
        continue;
      }

      // String literals
      if (line[i] === '"') {
        let j = i + 1;
        while (j < line.length && line[j] !== '"') {
          if (line[j] === '\\') j++;
          j++;
        }
        if (j < line.length) j++;
        push(tokens, 'string', i, j - i);
        i = j;
        continue;
      }

      // Numbers (decimal, hex, octal, float)
      if (isDigit(line[i]) || (line[i] === '.' && isDigit(line[i + 1] ?? ''))) {
        let j = i;
        if (line[j] === '0' && /[xX]/.test(line[j + 1] ?? '')) {
          j += 2;
          while (j < line.length && /[0-9a-fA-F]/.test(line[j])) j++;
        } else {
          while (j < line.length && isDigit(line[j])) j++;
          if (j < line.length && line[j] === '.') {
            j++;
            while (j < line.length && isDigit(line[j])) j++;
          }
          if (j < line.length && /[eE]/.test(line[j])) {
            j++;
            if (j < line.length && /[+-]/.test(line[j])) j++;
            while (j < line.length && isDigit(line[j])) j++;
          }
          // Suffixes: u, l, ul, ll, ull, f
          while (j < line.length && /[uUlLfF]/.test(line[j])) j++;
        }
        push(tokens, 'number', i, j - i);
        i = j;
        continue;
      }

      // Identifiers
      if (isIdentStart(line[i])) {
        let j = i;
        while (j < line.length && isIdentCont(line[j])) j++;
        const word = line.slice(i, j);

        let k = j;
        while (k < line.length && line[k] === ' ') k++;
        const isCall = line[k] === '(';

        let prevNonSpace = '';
        for (let p = i - 1; p >= 0; p--) {
          if (line[p] !== ' ' && line[p] !== '\t') { prevNonSpace = line[p]; break; }
        }
        const afterDot = prevNonSpace === '.' || prevNonSpace === '>';

        let type: TokenType;
        if (KEYWORDS.has(word)) {
          type = 'keyword';
        } else if (TYPES.has(word)) {
          type = 'type';
        } else if (/^[A-Z_][A-Z0-9_]+$/.test(word)) {
          type = 'constant'; // ALL_CAPS = macro/constant
        } else if (isCall) {
          type = 'function';
        } else if (afterDot) {
          type = 'property';
        } else if (/^[A-Z]/.test(word)) {
          type = 'type';
        } else {
          type = 'normal';
        }

        push(tokens, type, i, j - i);
        i = j;
        continue;
      }

      const c = line[i];
      if (/[{}()\[\];,.]/.test(c)) push(tokens, 'punctuation', i, 1);
      else if (/[+\-*/%&|^~<>=!?:]/.test(c)) push(tokens, 'operator', i, 1);
      else if (c === ' ' || c === '\t') { /* whitespace */ }
      else push(tokens, 'normal', i, 1);
      i++;
    }

    return { tokens, nextState: st };
  },
};

function push(tokens: Token[], type: TokenType, start: number, length: number): void {
  if (length > 0) tokens.push({ type, start, length });
}

function isDigit(c: string): boolean { return c >= '0' && c <= '9'; }
function isIdentStart(c: string): boolean { return /[a-zA-Z_]/.test(c); }
function isIdentCont(c: string): boolean { return /[a-zA-Z0-9_]/.test(c); }
