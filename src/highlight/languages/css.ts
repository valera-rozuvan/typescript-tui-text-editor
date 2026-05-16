import type { Tokenizer, TokenizerState, LineTokens, Token, TokenType } from '../tokens.js';
import { push, scanBlockComment, scanStringLiteral } from './util.js';

const CSS_PROPS = new Set([
  'align-items','align-content','align-self','animation','background',
  'background-color','border','border-radius','box-shadow','color','content',
  'cursor','display','flex','flex-direction','flex-wrap','font-family',
  'font-size','font-weight','gap','grid','height','justify-content',
  'justify-items','left','letter-spacing','line-height','margin','max-height',
  'max-width','min-height','min-width','opacity','overflow','padding',
  'position','right','text-align','text-decoration','top','transform',
  'transition','visibility','white-space','width','z-index',
]);

export const cssTokenizer: Tokenizer = {
  tokenizeLine(line: string, state: TokenizerState): { tokens: LineTokens; nextState: TokenizerState } {
    const tokens: Token[] = [];
    const st: TokenizerState = { ...state };
    let i = 0;

    if (st.inBlockComment) {
      i = scanBlockComment(line, 0, tokens, st);
      if (i >= line.length) return { tokens, nextState: st };
    }

    while (i < line.length) {
      // Comments
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

      // At-rules: @media, @keyframes, etc.
      if (line[i] === '@') {
        let j = i + 1;
        while (j < line.length && /[a-zA-Z\-]/.test(line[j])) j++;
        push(tokens, 'keyword', i, j - i);
        i = j;
        continue;
      }

      // Strings
      if (line[i] === '"' || line[i] === "'") {
        i = scanStringLiteral(line, i, tokens, line[i]);
        continue;
      }

      // Selectors (lines that don't contain :)
      // Property: value pairs
      // Check if this is inside a rule (simple heuristic: contains ':')
      const colonIdx = line.indexOf(':', i);
      const braceIdx = line.indexOf('{', i);

      // Identifiers
      if (/[a-zA-Z\-_]/.test(line[i])) {
        let j = i;
        while (j < line.length && /[a-zA-Z0-9\-_]/.test(line[j])) j++;
        const word = line.slice(i, j);

        // Is this a property name? (followed by ':')
        let k = j;
        while (k < line.length && line[k] === ' ') k++;
        const isProperty = line[k] === ':';

        let type: TokenType;
        if (isProperty) {
          type = CSS_PROPS.has(word) ? 'attribute' : 'attribute';
        } else {
          type = 'selector';
        }

        push(tokens, type, i, j - i);
        i = j;
        continue;
      }

      // Numbers (possibly with units)
      if (line[i] >= '0' && line[i] <= '9' || (line[i] === '-' && line[i + 1] >= '0' && line[i + 1] <= '9' && (i === 0 || /[\s:(,]/.test(line[i-1])))) {
        let j = i;
        if (line[j] === '-') j++;
        while (j < line.length && (line[j] >= '0' && line[j] <= '9' || line[j] === '.')) j++;
        // Units
        const unitStart = j;
        while (j < line.length && /[a-zA-Z%]/.test(line[j])) j++;
        push(tokens, 'number', i, j - i);
        i = j;
        continue;
      }

      // Hash colors #rrggbb
      if (line[i] === '#') {
        let j = i + 1;
        while (j < line.length && /[0-9a-fA-F]/.test(line[j])) j++;
        if (j > i + 1) {
          push(tokens, 'number', i, j - i);
          i = j;
          continue;
        }
        push(tokens, 'selector', i, 1);
        i++;
        continue;
      }

      // : ; { } ( ) ,
      if (/[:{};(),]/.test(line[i])) { push(tokens, 'punctuation', i, 1); }
      else if (/[+\-*/>~|^$=!]/.test(line[i])) { push(tokens, 'operator', i, 1); }
      else if (line[i] === '.' || line[i] === '#') { push(tokens, 'selector', i, 1); }
      else if (line[i] !== ' ' && line[i] !== '\t') { push(tokens, 'normal', i, 1); }
      i++;
    }

    return { tokens, nextState: st };
  },
};
