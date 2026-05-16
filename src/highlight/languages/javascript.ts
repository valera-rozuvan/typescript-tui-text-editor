import type { Tokenizer, TokenizerState, LineTokens, Token, TokenType } from '../tokens.js';
import { push, scanBlockComment, scanLineComment, scanStringLiteral, scanIdentifierContext, scanNumber } from './util.js';

const KEYWORDS = new Set([
  'break','case','catch','class','const','continue','debugger','default',
  'delete','do','else','export','extends','finally','for','from','function',
  'if','import','in','instanceof','let','new','of','return','static','super',
  'switch','this','throw','try','typeof','var','void','while','with','yield',
  'async','await','true','false','null','undefined','NaN','Infinity',
  'get','set','target','constructor','prototype',
]);

const OPERATORS_MULTI = [
  '>>>=','<<=','>>=','**=','&&=','||=','??=',
  '===','!==','>>>','**','<=','>=','==','!=','&&','||','??','?.','?.','++',
  '--','+=','-=','*=','/=','%=','&=','|=','^=','<<','>>','=>','...',
];

export const jsTokenizer: Tokenizer = {
  tokenizeLine(line: string, state: TokenizerState): { tokens: LineTokens; nextState: TokenizerState } {
    const tokens: Token[] = [];
    const st: TokenizerState = { ...state };
    let i = 0;

    while (i < line.length) {
      // Continuing block comment
      if (st.inBlockComment) {
        i = scanBlockComment(line, i, tokens, st);
        continue;
      }

      // Continuing multi-line string (template literal)
      if (st.inMultiLineString) {
        let j = i;
        while (j < line.length) {
          if (line[j] === '\\') { j += 2; continue; }
          if (line[j] === '`') {
            j++;
            st.inMultiLineString = false;
            st.multiLineStringChar = '';
            break;
          }
          j++;
        }
        push(tokens, 'string', i, j - i);
        i = j;
        continue;
      }

      // Line comment
      if (line[i] === '/' && line[i + 1] === '/') {
        i = scanLineComment(line, i, tokens);
        continue;
      }

      // Block comment start
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

      // Template literal
      if (line[i] === '`') {
        let j = i + 1;
        while (j < line.length) {
          if (line[j] === '\\') { j += 2; continue; }
          if (line[j] === '`') { j++; break; }
          j++;
        }
        if (j >= line.length && (j === line.length || line[j - 1] !== '`')) {
          push(tokens, 'string', i, line.length - i);
          i = line.length;
          st.inMultiLineString = true;
          st.multiLineStringChar = '`';
        } else {
          push(tokens, 'string', i, j - i);
          i = j;
        }
        continue;
      }

      // Regular string literals
      if (line[i] === '"' || line[i] === "'") {
        i = scanStringLiteral(line, i, tokens, line[i]);
        continue;
      }

      // Numbers
      if (isDigit(line[i]) || (line[i] === '.' && isDigit(line[i + 1] ?? ''))) {
        let j = i;
        if (line[j] === '0' && (line[j + 1] === 'b' || line[j + 1] === 'B')) {
          j += 2;
          while (j < line.length && /[01_]/.test(line[j])) j++;
        } else if (line[j] === '0' && (line[j + 1] === 'o' || line[j + 1] === 'O')) {
          j += 2;
          while (j < line.length && /[0-7_]/.test(line[j])) j++;
        } else {
          j = scanNumber(line, i, true);
          if (j < line.length && line[j] === 'n') j++; // bigint suffix
        }
        push(tokens, 'number', i, j - i);
        i = j;
        continue;
      }

      // Identifiers / keywords
      if (isIdentStart(line[i])) {
        let j = i;
        while (j < line.length && isIdentCont(line[j])) j++;
        const word = line.slice(i, j);

        const { isCall, afterDot } = scanIdentifierContext(line, i, j);

        let type: TokenType;
        if (KEYWORDS.has(word)) {
          type = 'keyword';
        } else if (isCall && !afterDot) {
          type = 'function';
        } else if (afterDot) {
          type = isCall ? 'function' : 'property';
        } else if (/^[A-Z]/.test(word)) {
          type = 'type';
        } else {
          type = 'normal';
        }

        push(tokens, type, i, j - i);
        i = j;
        continue;
      }

      // Multi-char operators
      let matchedOp = false;
      for (const op of OPERATORS_MULTI) {
        if (line.startsWith(op, i)) {
          push(tokens, 'operator', i, op.length);
          i += op.length;
          matchedOp = true;
          break;
        }
      }
      if (matchedOp) continue;

      // Single chars
      const c = line[i];
      if (/[{}()\[\];,.]/.test(c)) {
        push(tokens, 'punctuation', i, 1);
      } else if (/[+\-*/%&|^~<>=!?:]/.test(c)) {
        push(tokens, 'operator', i, 1);
      } else if (c === ' ' || c === '\t') {
        // whitespace — no token needed, just advance
      } else {
        push(tokens, 'normal', i, 1);
      }
      i++;
    }

    return { tokens, nextState: st };
  },
};

function isDigit(c: string): boolean { return c >= '0' && c <= '9'; }
function isIdentStart(c: string): boolean { return /[a-zA-Z_$]/.test(c); }
function isIdentCont(c: string): boolean { return /[a-zA-Z0-9_$]/.test(c); }
