import type { Tokenizer, TokenizerState, LineTokens, Token, TokenType } from '../tokens.js';
import { cTokenizer } from './c.js';

const CPP_KEYWORDS = new Set([
  'alignas','alignof','and','and_eq','bitand','bitor','catch','class',
  'compl','concept','consteval','constexpr','constinit','co_await',
  'co_return','co_yield','decltype','delete','dynamic_cast','explicit',
  'export','friend','mutable','namespace','new','noexcept','not','not_eq',
  'nullptr','operator','or','or_eq','private','protected','public',
  'reinterpret_cast','requires','static_assert','static_cast','template',
  'this','throw','try','typeid','typename','using','virtual','xor','xor_eq',
  'override','final','import','module',
]);

export const cppTokenizer: Tokenizer = {
  tokenizeLine(line: string, state: TokenizerState): { tokens: LineTokens; nextState: TokenizerState } {
    const { tokens: base, nextState } = cTokenizer.tokenizeLine(line, state);

    // Reclassify C++ specific keywords and handle :: scope operator
    const tokens: Token[] = [];
    for (let i = 0; i < base.length; i++) {
      const tok = base[i];
      if (tok.type === 'normal' || tok.type === 'keyword') {
        const word = line.slice(tok.start, tok.start + tok.length);
        if (CPP_KEYWORDS.has(word)) {
          tokens.push({ ...tok, type: 'keyword' as TokenType });
          continue;
        }
      }
      // Reclassify :: as a single operator(2) token.
      // The C tokenizer emits each ':' as an operator(1), so we detect two
      // consecutive single-colon operator tokens and merge them.
      if (tok.type === 'operator' && tok.length === 1 &&
          line[tok.start] === ':') {
        const next = base[i + 1];
        if (next && next.type === 'operator' && next.length === 1 &&
            next.start === tok.start + 1 && line[next.start] === ':') {
          tokens.push({ type: 'operator' as TokenType, start: tok.start, length: 2 });
          i++; // consume the second ':' token
          continue;
        }
      }
      tokens.push(tok);
    }

    return { tokens, nextState };
  },
};
