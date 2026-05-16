import type { Tokenizer, TokenizerState, LineTokens, Token, TokenType } from '../tokens.js';
import { push } from './util.js';

export const mdTokenizer: Tokenizer = {
  tokenizeLine(line: string, state: TokenizerState): { tokens: LineTokens; nextState: TokenizerState } {
    const tokens: Token[] = [];
    const st: TokenizerState = { ...state };

    // Code block fences
    if (line.startsWith('```') || line.startsWith('~~~')) {
      push(tokens, 'code', 0, line.length);
      const newState = { ...st, inMultiLineString: !st.inMultiLineString };
      return { tokens, nextState: newState };
    }

    if (st.inMultiLineString) {
      push(tokens, 'code', 0, line.length);
      return { tokens, nextState: st };
    }

    // ATX Headings
    const headingMatch = line.match(/^(#{1,6})(\s)/);
    if (headingMatch) {
      push(tokens, 'heading', 0, line.length);
      return { tokens, nextState: st };
    }

    // Setext heading underlines
    if (/^[=]{2,}\s*$/.test(line) || /^[-]{2,}\s*$/.test(line)) {
      push(tokens, 'heading', 0, line.length);
      return { tokens, nextState: st };
    }

    // Blockquote
    if (line.startsWith('>')) {
      push(tokens, 'comment', 0, 1);
      // Rest of line tokenized inline
      const rest = mdTokenizer.tokenizeLine(line.slice(1), st);
      for (const t of rest.tokens) {
        tokens.push({ ...t, start: t.start + 1 });
      }
      return { tokens, nextState: rest.nextState };
    }

    // Horizontal rule
    if (/^(\s*[-*_]){3,}\s*$/.test(line)) {
      push(tokens, 'operator', 0, line.length);
      return { tokens, nextState: st };
    }

    // Inline tokens
    let i = 0;
    while (i < line.length) {
      // Inline code
      if (line[i] === '`') {
        let j = i + 1;
        const double = line[j] === '`';
        if (double) j++;
        const closeSeq = double ? '``' : '`';
        const closeIdx = line.indexOf(closeSeq, j);
        if (closeIdx !== -1) {
          push(tokens, 'code', i, closeIdx + closeSeq.length - i);
          i = closeIdx + closeSeq.length;
          continue;
        }
      }

      // Bold + italic: ***text*** or ___text___
      if ((line[i] === '*' || line[i] === '_') && line[i + 1] === line[i] && line[i + 2] === line[i]) {
        const marker = line[i].repeat(3);
        const close = line.indexOf(marker, i + 3);
        if (close !== -1) {
          push(tokens, 'strong', i, close + 3 - i);
          i = close + 3;
          continue;
        }
      }

      // Bold: **text** or __text__
      if ((line[i] === '*' || line[i] === '_') && line[i + 1] === line[i]) {
        const marker = line[i].repeat(2);
        const close = line.indexOf(marker, i + 2);
        if (close !== -1) {
          push(tokens, 'strong', i, close + 2 - i);
          i = close + 2;
          continue;
        }
      }

      // Italic: *text* or _text_
      if (line[i] === '*' || line[i] === '_') {
        const marker = line[i];
        const close = line.indexOf(marker, i + 1);
        if (close !== -1) {
          push(tokens, 'emphasis', i, close + 1 - i);
          i = close + 1;
          continue;
        }
      }

      // Link: [text](url)
      if (line[i] === '[') {
        const textEnd = line.indexOf(']', i + 1);
        if (textEnd !== -1 && line[textEnd + 1] === '(') {
          const urlEnd = line.indexOf(')', textEnd + 2);
          if (urlEnd !== -1) {
            push(tokens, 'link', i, urlEnd + 1 - i);
            i = urlEnd + 1;
            continue;
          }
        }
      }

      push(tokens, 'normal', i, 1);
      i++;
    }

    return { tokens, nextState: st };
  },
};
