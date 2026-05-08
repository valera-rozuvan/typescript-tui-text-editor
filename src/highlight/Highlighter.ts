import { extname } from 'path';
import type { LineTokens, Tokenizer } from './tokens.js';
import { HighlightCache } from './Cache.js';
import type { Buffer } from '../editor/Buffer.js';
import { jsTokenizer } from './languages/javascript.js';
import { tsTokenizer } from './languages/typescript.js';
import { cTokenizer } from './languages/c.js';
import { cppTokenizer } from './languages/cpp.js';
import { mdTokenizer } from './languages/markdown.js';
import { htmlTokenizer } from './languages/html.js';
import { cssTokenizer } from './languages/css.js';

const EXT_MAP: Record<string, Tokenizer> = {
  '.js': jsTokenizer, '.mjs': jsTokenizer, '.cjs': jsTokenizer, '.jsx': jsTokenizer,
  '.ts': tsTokenizer, '.mts': tsTokenizer, '.cts': tsTokenizer, '.tsx': tsTokenizer,
  '.c': cTokenizer, '.h': cTokenizer,
  '.cpp': cppTokenizer, '.cc': cppTokenizer, '.cxx': cppTokenizer,
  '.hpp': cppTokenizer, '.hxx': cppTokenizer, '.hh': cppTokenizer,
  '.md': mdTokenizer, '.markdown': mdTokenizer,
  '.html': htmlTokenizer, '.htm': htmlTokenizer, '.xhtml': htmlTokenizer,
  '.css': cssTokenizer, '.scss': cssTokenizer, '.less': cssTokenizer,
};

export class Highlighter {
  private caches = new WeakMap<Buffer, HighlightCache>();
  private tokenizers = new WeakMap<Buffer, Tokenizer | null>();

  getTokenizerFor(buf: Buffer): Tokenizer | null {
    if (!this.tokenizers.has(buf)) {
      const ext = buf.filePath ? extname(buf.filePath).toLowerCase() : '';
      this.tokenizers.set(buf, EXT_MAP[ext] ?? null);
    }
    return this.tokenizers.get(buf) ?? null;
  }

  getCache(buf: Buffer): HighlightCache {
    if (!this.caches.has(buf)) {
      this.caches.set(buf, new HighlightCache());
    }
    return this.caches.get(buf)!;
  }

  getTokensForLine(line: number, buf: Buffer): LineTokens {
    const tokenizer = this.getTokenizerFor(buf);
    if (!tokenizer) return [];
    return this.getCache(buf).getTokensForLine(line, buf, tokenizer);
  }

  invalidateFrom(line: number, buf: Buffer): void {
    this.getCache(buf).invalidateFrom(line);
  }

  onFilePathChange(buf: Buffer): void {
    this.tokenizers.delete(buf);
    this.caches.delete(buf);
  }

  languageName(buf: Buffer): string {
    const ext = buf.filePath ? extname(buf.filePath).toLowerCase() : '';
    const names: Record<string, string> = {
      '.js': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript', '.jsx': 'JSX',
      '.ts': 'TypeScript', '.mts': 'TypeScript', '.cts': 'TypeScript', '.tsx': 'TSX',
      '.c': 'C', '.h': 'C Header',
      '.cpp': 'C++', '.cc': 'C++', '.cxx': 'C++', '.hpp': 'C++ Header',
      '.md': 'Markdown', '.markdown': 'Markdown',
      '.html': 'HTML', '.htm': 'HTML',
      '.css': 'CSS', '.scss': 'SCSS', '.less': 'Less',
    };
    return names[ext] ?? 'Plain Text';
  }
}
