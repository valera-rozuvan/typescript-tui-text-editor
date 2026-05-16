import type { Tokenizer, TokenizerState, LineTokens, Token, TokenType } from '../tokens.js';
import { push } from './util.js';

export const htmlTokenizer: Tokenizer = {
  tokenizeLine(line: string, state: TokenizerState): { tokens: LineTokens; nextState: TokenizerState } {
    const tokens: Token[] = [];
    const st: TokenizerState = { ...state };
    let i = 0;

    // Continuing block comment (<!-- ... -->)
    if (st.inBlockComment) {
      const end = line.indexOf('-->');
      if (end === -1) {
        push(tokens, 'comment', 0, line.length);
        return { tokens, nextState: st };
      }
      push(tokens, 'comment', 0, end + 3);
      i = end + 3;
      st.inBlockComment = false;
    }

    while (i < line.length) {
      // HTML comment
      if (line.startsWith('<!--', i)) {
        const end = line.indexOf('-->', i + 4);
        if (end === -1) {
          push(tokens, 'comment', i, line.length - i);
          i = line.length;
          st.inBlockComment = true;
        } else {
          push(tokens, 'comment', i, end + 3 - i);
          i = end + 3;
        }
        continue;
      }

      // Tags
      if (line[i] === '<') {
        let j = i + 1;
        const isClose = line[j] === '/';
        if (isClose) j++;

        // Tag name
        const tagStart = j;
        while (j < line.length && /[a-zA-Z0-9\-_:]/.test(line[j])) j++;
        if (j > tagStart) {
          push(tokens, 'punctuation', i, isClose ? 2 : 1); // < or </
          push(tokens, 'tag', tagStart, j - tagStart);
          i = j;

          // Attributes until >
          while (i < line.length && line[i] !== '>') {
            if (line[i] === ' ' || line[i] === '\t' || line[i] === '\n') { i++; continue; }
            if (line[i] === '/') { push(tokens, 'punctuation', i, 1); i++; continue; }

            // Attribute name
            const attrStart = i;
            while (i < line.length && /[a-zA-Z0-9\-_:@.]/.test(line[i])) i++;
            if (i > attrStart) push(tokens, 'attribute', attrStart, i - attrStart);

            if (line[i] === '=') {
              push(tokens, 'operator', i, 1);
              i++;
              // Attribute value (no backslash escape handling — HTML doesn't escape quotes this way)
              if (line[i] === '"' || line[i] === "'") {
                const q = line[i];
                let j2 = i + 1;
                while (j2 < line.length && line[j2] !== q) j2++;
                if (j2 < line.length) j2++;
                push(tokens, 'value', i, j2 - i);
                i = j2;
              } else {
                // Unquoted value
                const vs = i;
                while (i < line.length && !/[\s>]/.test(line[i])) i++;
                push(tokens, 'value', vs, i - vs);
              }
            }
          }
          if (i < line.length && line[i] === '>') {
            push(tokens, 'punctuation', i, 1);
            i++;
          }
          continue;
        }
      }

      // DOCTYPE
      if (line.startsWith('<!', i)) {
        push(tokens, 'directive', i, line.length - i);
        i = line.length;
        continue;
      }

      // Entities &amp; etc.
      if (line[i] === '&') {
        let j = i + 1;
        while (j < line.length && line[j] !== ';' && j - i < 12) j++;
        if (line[j] === ';') j++;
        push(tokens, 'constant', i, j - i);
        i = j;
        continue;
      }

      push(tokens, 'normal', i, 1);
      i++;
    }

    return { tokens, nextState: st };
  },
};
