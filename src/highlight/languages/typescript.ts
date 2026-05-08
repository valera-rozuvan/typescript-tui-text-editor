import type { Tokenizer, TokenizerState, LineTokens, Token, TokenType } from '../tokens.js';
import { jsTokenizer } from './javascript.js';

const TS_KEYWORDS = new Set([
  'abstract','as','asserts','declare','enum','implements','interface',
  'is','keyof','module','namespace','never','readonly','satisfies',
  'type','typeof','unknown','infer','override','out','using',
]);

const TS_OPERATORS_MULTI = ['...', '=>', '??', '?.', '!.', '::', '&', '|'];

export const tsTokenizer: Tokenizer = {
  tokenizeLine(line: string, state: TokenizerState): { tokens: LineTokens; nextState: TokenizerState } {
    // Use JS tokenizer as base, then reclassify TS-specific tokens
    const { tokens: base, nextState } = jsTokenizer.tokenizeLine(line, state);

    // Reclassify TS keywords and type annotations
    const tokens: Token[] = [];
    for (const tok of base) {
      if (tok.type === 'normal' || tok.type === 'keyword') {
        const word = line.slice(tok.start, tok.start + tok.length);
        if (TS_KEYWORDS.has(word)) {
          tokens.push({ ...tok, type: 'keyword' as TokenType });
          continue;
        }
        // Uppercase identifiers not after . are types
        if (tok.type === 'normal' && /^[A-Z]/.test(word)) {
          tokens.push({ ...tok, type: 'type' as TokenType });
          continue;
        }
      }
      tokens.push(tok);
    }

    return { tokens, nextState };
  },
};
