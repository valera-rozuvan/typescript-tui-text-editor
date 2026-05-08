import type { LineTokens, Tokenizer, TokenizerState } from './tokens.js';
import { defaultState } from './tokens.js';
import type { Buffer } from '../editor/Buffer.js';

const CHUNK_SIZE = 50;

interface Chunk {
  startLine: number;
  tokens: LineTokens[];
  endState: TokenizerState; // state at end of last line in chunk
  valid: boolean;
}

export class HighlightCache {
  private chunks = new Map<number, Chunk>();

  invalidateFrom(line: number): void {
    const startChunk = Math.floor(line / CHUNK_SIZE);
    for (const [idx] of this.chunks) {
      if (idx >= startChunk) {
        const chunk = this.chunks.get(idx)!;
        chunk.valid = false;
      }
    }
  }

  getTokensForLine(line: number, buf: Buffer, tokenizer: Tokenizer): LineTokens {
    const chunkIdx = Math.floor(line / CHUNK_SIZE);
    const chunk = this.getOrBuildChunk(chunkIdx, buf, tokenizer);
    const localLine = line - chunkIdx * CHUNK_SIZE;
    return chunk.tokens[localLine] ?? [];
  }

  private getOrBuildChunk(chunkIdx: number, buf: Buffer, tokenizer: Tokenizer): Chunk {
    const existing = this.chunks.get(chunkIdx);
    if (existing?.valid) return existing;

    // Get starting state from end of previous chunk
    const startState = chunkIdx === 0
      ? defaultState()
      : this.getEndState(chunkIdx - 1, buf, tokenizer);

    const startLine = chunkIdx * CHUNK_SIZE;
    const endLine = Math.min(startLine + CHUNK_SIZE, buf.lineCount);
    const tokens: LineTokens[] = [];
    let state: TokenizerState = { ...startState };

    for (let ln = startLine; ln < endLine; ln++) {
      const { tokens: lineTokens, nextState } = tokenizer.tokenizeLine(buf.getLine(ln), state);
      tokens.push(lineTokens);
      state = nextState;
    }

    const chunk: Chunk = { startLine, tokens, endState: state, valid: true };
    this.chunks.set(chunkIdx, chunk);
    return chunk;
  }

  private getEndState(chunkIdx: number, buf: Buffer, tokenizer: Tokenizer): TokenizerState {
    return this.getOrBuildChunk(chunkIdx, buf, tokenizer).endState;
  }

  clear(): void {
    this.chunks.clear();
  }
}
