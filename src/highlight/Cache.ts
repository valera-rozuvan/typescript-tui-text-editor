import type { LineTokens, Tokenizer, TokenizerState } from './tokens.js';
import { defaultState } from './tokens.js';
import type { Buffer } from '../editor/Buffer.js';

const CHUNK_SIZE = 50;
const CHECKPOINT_INTERVAL = 100; // store tokenizer state every 100 chunks = 5 000 lines

interface Chunk {
  startLine: number;
  tokens: LineTokens[];
  endState: TokenizerState;
  valid: boolean;
}

export class HighlightCache {
  private chunks = new Map<number, Chunk>();

  // Coarse tokenizer-state checkpoints keyed by chunk index (multiples of
  // CHECKPOINT_INTERVAL).  chunk 0 is implicit (defaultState) and not stored.
  private _checkpoints = new Map<number, TokenizerState>();

  // Background build state
  private _building = false;
  private _buildTarget = 0;
  private _currentBuildIdx = 0;
  private _currentBuildState: TokenizerState = defaultState();
  private _redrawCallback: (() => void) | null = null;

  // ── public API ───────────────────────────────────────────────────────────────

  setRedrawCallback(cb: (() => void) | null): void {
    this._redrawCallback = cb;
  }

  invalidateFrom(line: number): void {
    const startChunk = Math.floor(line / CHUNK_SIZE);
    for (const [idx] of this.chunks) {
      if (idx >= startChunk) {
        this.chunks.get(idx)!.valid = false;
      }
    }
    // Checkpoints at chunk indices > startChunk depend on potentially invalidated
    // chunks and must be removed.  The checkpoint AT startChunk stores the state
    // entering that chunk (determined by chunks before it), so it is still valid.
    for (const cpIdx of this._checkpoints.keys()) {
      if (cpIdx > startChunk) {
        this._checkpoints.delete(cpIdx);
      }
    }
  }

  getTokensForLine(line: number, buf: Buffer, tokenizer: Tokenizer): LineTokens {
    const chunkIdx = Math.floor(line / CHUNK_SIZE);
    const chunk = this._getOrBuildChunk(chunkIdx, buf, tokenizer);
    if (chunk === null) return []; // deferred — render as plain text this frame
    const localLine = line - chunkIdx * CHUNK_SIZE;
    return chunk.tokens[localLine] ?? [];
  }

  clear(): void {
    this.chunks.clear();
    this._checkpoints.clear();
    this._building = false;
  }

  // ── private ──────────────────────────────────────────────────────────────────

  /**
   * Returns the built Chunk for chunkIdx, or null when the chunk is far from
   * the beginning and its entry checkpoint has not been computed yet.
   * In the null case a background build is started so the chunk will be
   * available after a few setImmediate ticks.
   */
  private _getOrBuildChunk(chunkIdx: number, buf: Buffer, tokenizer: Tokenizer): Chunk | null {
    const existing = this.chunks.get(chunkIdx);
    if (existing?.valid) return existing;

    // Nearest checkpoint that covers this chunk
    const cpIdx = Math.floor(chunkIdx / CHECKPOINT_INTERVAL) * CHECKPOINT_INTERVAL;
    const cpState = this._checkpoints.get(cpIdx);

    // Cold-start guard: if the required checkpoint is not yet built and the
    // chunk is too far to scan from scratch synchronously, defer to background.
    if (cpState === undefined && chunkIdx >= CHECKPOINT_INTERVAL) {
      this._startBackgroundBuild(chunkIdx, buf, tokenizer);
      return null;
    }

    // Iterative synchronous build from the nearest ready checkpoint (or from 0).
    const startIdx = cpState !== undefined ? cpIdx : 0;
    let state: TokenizerState = cpState !== undefined ? { ...cpState } : defaultState();

    for (let i = startIdx; i <= chunkIdx; i++) {
      const stateAtStart = { ...state }; // capture before any update for this chunk
      const existingChunk = this.chunks.get(i);
      if (existingChunk?.valid) {
        state = { ...existingChunk.endState };
      } else {
        const startLine = i * CHUNK_SIZE;
        const endLine = Math.min(startLine + CHUNK_SIZE, buf.lineCount);
        const tokens: LineTokens[] = [];
        for (let ln = startLine; ln < endLine; ln++) {
          const r = tokenizer.tokenizeLine(buf.getLine(ln), state);
          tokens.push(r.tokens);
          state = r.nextState;
        }
        this.chunks.set(i, { startLine, tokens, endState: { ...state }, valid: true });
      }
      // Store checkpoint at every CHECKPOINT_INTERVAL boundary (except chunk 0
      // which is implicit = defaultState)
      if (i > 0 && i % CHECKPOINT_INTERVAL === 0) {
        this._checkpoints.set(i, stateAtStart);
      }
    }

    return this.chunks.get(chunkIdx)!;
  }

  /**
   * Starts (or extends) an async background build that tokenizes the file from
   * the furthest ready checkpoint up to targetChunkIdx.  Each tick processes
   * one batch of CHECKPOINT_INTERVAL chunks before yielding via setImmediate.
   * Fires _redrawCallback when a new checkpoint is stored or the target is reached.
   */
  private _startBackgroundBuild(targetChunkIdx: number, buf: Buffer, tokenizer: Tokenizer): void {
    if (this._building) {
      // Extend the target if a farther chunk was requested while build is running
      if (targetChunkIdx > this._buildTarget) this._buildTarget = targetChunkIdx;
      return;
    }
    this._building = true;
    this._buildTarget = targetChunkIdx;

    // Find the furthest consecutive checkpoint already stored so we can resume
    // from there rather than rebuilding from line 0.
    const targetCpIdx = Math.floor(targetChunkIdx / CHECKPOINT_INTERVAL) * CHECKPOINT_INTERVAL;
    let currentIdx = 0;
    let currentState = defaultState();
    for (let cp = CHECKPOINT_INTERVAL; cp <= targetCpIdx; cp += CHECKPOINT_INTERVAL) {
      if (this._checkpoints.has(cp)) {
        currentIdx = cp;
        currentState = { ...this._checkpoints.get(cp)! };
      } else {
        break; // gap — can't skip over unbuilt checkpoints
      }
    }
    this._currentBuildIdx = currentIdx;
    this._currentBuildState = currentState;

    const buildBatch = () => {
      if (!this._building) return; // cancelled by close() or clear()

      const batchEnd = Math.min(
        this._currentBuildIdx + CHECKPOINT_INTERVAL,
        this._buildTarget + CHECKPOINT_INTERVAL
      );
      let state = { ...this._currentBuildState };

      for (let i = this._currentBuildIdx; i < batchEnd; i++) {
        const stateAtStart = { ...state };
        const existingChunk = this.chunks.get(i);
        if (existingChunk?.valid) {
          state = { ...existingChunk.endState };
        } else {
          const startLine = i * CHUNK_SIZE;
          const endLine = Math.min(startLine + CHUNK_SIZE, buf.lineCount);
          const tokens: LineTokens[] = [];
          for (let ln = startLine; ln < endLine; ln++) {
            const r = tokenizer.tokenizeLine(buf.getLine(ln), state);
            tokens.push(r.tokens);
            state = r.nextState;
          }
          this.chunks.set(i, { startLine, tokens, endState: { ...state }, valid: true });
        }
        if (i > 0 && i % CHECKPOINT_INTERVAL === 0) {
          this._checkpoints.set(i, stateAtStart);
          // Notify renderer so panes near this checkpoint get highlighted ASAP
          this._redrawCallback?.();
        }
      }

      this._currentBuildIdx = batchEnd;
      this._currentBuildState = { ...state };

      if (this._currentBuildIdx > this._buildTarget) {
        this._building = false;
        this._redrawCallback?.();
      } else {
        setImmediate(buildBatch);
      }
    };

    setImmediate(buildBatch);
  }
}
