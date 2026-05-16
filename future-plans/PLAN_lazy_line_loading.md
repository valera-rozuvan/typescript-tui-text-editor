# Plan: Lazy Line Loading via Line-Offset Index

## What the current code does

`Buffer.fromFile()` reads the entire file into `this.lines: string[]` in one shot. Every subsequent `getLine(n)` is a pure array lookup — no disk I/O. The renderer already only calls `getLine(n)` for visible lines, but all lines are sitting in memory.

## Core idea

Replace the "read everything" model with a **byte-offset index + LRU line cache**:

1. On `fromFile()` — stream the raw file bytes in 64 KB chunks, scanning for `\n` (0x0A) bytes to record the byte offset of every line start → `_lineOffsets: number[]`. Also record `_fileSize` for the last-line boundary. Keep the file descriptor open (`_fd`). Do **not** store the full `string[]`.
2. `getLine(n)` — check `_lineCache: Map<number, string>`; on a cache hit, move the entry to most-recently-used and return. On a miss, `fs.readSync()` the exact byte range `[_lineOffsets[n], _lineOffsets[n+1] ?? _fileSize)` from `_fd`, decode it as UTF-8, strip any trailing `\r`, and insert into the cache.
3. First mutation (`insert`, `deleteChar`, etc.) — call `_materializeSync()`: read all remaining uncached lines via `readSync`, set `this._lines`, set `_fullyLoaded = true`, close `_fd`. From that point the buffer behaves exactly as it does today.
4. LRU eviction — `_lineCache` is a `Map<number, string>`. When `_lineCache.size > CACHE_SIZE` (e.g. 2 000), evict `_lineCache.keys().next().value` (the least-recently-used entry). On every cache hit, delete and re-insert the key so it moves to the MRU end. No separate `_lruOrder` array is needed — `Map` preserves insertion order.

## Why this eliminates redundant reads while navigating

- The renderer calls `getLine(n)` for only `[scrollLine, scrollLine + contentHeight)`.
- On the first render those lines are fetched and cached.
- Arrow-key navigation that stays inside the viewport hits only cached lines → **zero disk I/O**.
- Scrolling fetches only the newly-visible lines not already in cache.

---

## Files to change

| File | Change |
|---|---|
| `src/editor/Buffer.ts` | Main work — `lines` getter/setter, offset index, fd, `_fileSize`, cache, `_materializeSync()`, `materialize()`, `close()` |
| `src/highlight/Cache.ts` | Fix stack overflow; add coarse checkpoints; add background build with deferred re-render; fire redraw at each checkpoint boundary |
| `src/editor/Editor.ts` | Call `buf.close()` when removing a buffer from `openBuffers`; supply redraw callback to `HighlightCache` |
| `src/search/FileSearch.ts` | Call `buf.materialize()` at the start of `searchInBuffer` to avoid O(N) `readSync` calls on large lazy buffers |
| Everything else | No changes |

`Pane`, `Cursor`, `Renderer`, `Highlighter`, `SearchPanel`, `FileSearch`, unit tests — all access `buf.lines` or `buf.getLine(n)` / `buf.lineCount`. The `lines` getter (see below) makes the lazy/eager modes transparent to every caller.

---

## Detailed changes to `Buffer.ts`

```
Rename internal field:
  lines: string[]  →  _lines: string[]   (private)

New public getter/setter (replaces the bare field):
  get lines(): string[] {
    if (!this._fullyLoaded) this._materializeSync();
    return this._lines;
  }
  set lines(val: string[]) {
    this._lines = val;
    this._fullyLoaded = true;
    if (this._fd !== null) { fs.closeSync(this._fd); this._fd = null; }
    this._lineCache.clear();
  }

New fields:
  _fd: number | null          — open file descriptor (null after materialize/close)
  _lineOffsets: number[]      — byte offset of each line's first byte
  _fileSize: number           — total file size in bytes (for last-line boundary)
  _lineCache: Map<number, string>  — LRU cache; Map order = insertion/access order
  _fullyLoaded: boolean       — true once _materializeSync() has run or file was small

fromFile() changes:
  1. If the file does not exist (ENOENT): set _lines = [''], _fullyLoaded = true, return early
     (same behaviour as today — no fd is opened, no scan is attempted).
  2. Open fd via fs.open(filePath, 'r')
  3. Stream file in 64 KB chunks with repeated await fs.read() calls:
       read chunk → scan bytes for 0x0A → push (runningOffset + byteIndex + 1)
       into _lineOffsets for each newline found; accumulate _fileSize
     _lineOffsets[0] = 0 always (line 0 starts at byte 0)
  4. After the scan, pop the trailing phantom entry: if (_lineOffsets.length > 1 &&
     _lineOffsets[_lineOffsets.length - 1] === _fileSize) _lineOffsets.pop()
     This mirrors the eager-mode `lines.pop()` that removes the empty element produced
     by splitting a file that ends with '\n'. Without this step, lineCount in lazy mode
     would be one greater than in eager mode for every file that ends with a newline.
  5. Detect line ending (CRLF vs LF) by checking the first chunk
  6. Detect readOnly from stat (same as today)
  7. Do NOT set _lines
  8. Set _fullyLoaded = false

get lineCount():
  if (_fullyLoaded) return _lines.length;
  return _lineOffsets.length;

getLine(n):
  if (_fullyLoaded) return _lines[n] ?? '';
  cached = _lineCache.get(n)
  if (cached !== undefined):
    _lineCache.delete(n); _lineCache.set(n, cached);  // move to MRU
    return cached
  // cache miss — synchronous read
  start = _lineOffsets[n]
  end   = _lineOffsets[n + 1] ?? _fileSize
  buf   = Buffer.alloc(end - start)          // Node Buffer, not our Buffer class
  fs.readSync(_fd, buf, 0, end - start, start)
  line  = buf.toString('utf8').replace(/\r?\n$/, '')
  // Strip \r?\n$, not just \r$: the byte range [_lineOffsets[n], _lineOffsets[n+1])
  // includes the \n delimiter itself (the next line's offset starts after it).
  // Without stripping \n, every lazy-loaded line would have a trailing newline,
  // unlike the eager-mode split('\n') which never includes delimiters.
  _lineCache.set(n, line)
  if (_lineCache.size > CACHE_SIZE):
    _lineCache.delete(_lineCache.keys().next().value)  // evict LRU
  return line

insert / deleteChar / deleteCharBefore / insertNewline:
  if (!_fullyLoaded) _materializeSync();
  // then existing logic unchanged (accesses _lines directly inside Buffer.ts)

get lines() / set lines():
  getter triggers _materializeSync() if needed, returns _lines
  setter replaces _lines, marks _fullyLoaded = true, closes fd
  — this makes ALL external callers (Editor.ts, unit tests) transparent:
      buf.lines[n] = x        → getter materializes, then mutates _lines[n]
      buf.lines = newArr      → setter replaces _lines and closes fd
      buf.lines.flatMap(…)    → getter materializes, then flatMap runs
      assert.deepEqual(b.lines, …) → getter materializes, assertion works
      b.lines[0] = '…'        → getter materializes, mutation works

_materializeSync():  <- private, synchronous
  for n in 0.._lineOffsets.length-1:
    if _lineCache.has(n): use cached value
    else: readSync byte range, decode, strip \r
  set _lines = reconstructed array
  set _fullyLoaded = true
  fs.closeSync(_fd); _fd = null
  _lineCache.clear()

close():  <- new public method (called by Editor when buffer is removed)
  if _fd is not null: fs.closeSync(_fd); _fd = null
  _lineCache.clear()

save():
  if (!_fullyLoaded && !this.modified):
    stream-copy the original file (fd -> writeFile)  <- optimization; or just _materializeSync() + existing logic
  else:
    _materializeSync() then existing toString() + writeFile
```

---

## Key complexities to be aware of

### 1. `getLine()` uses `readSync` — intentionally blocking

`getLine()` must remain a synchronous method: its callers (`Renderer`, `Pane`, highlight `Cache`) are all on the synchronous render path. Using `fs.read()` (async) would require every caller to become async, which is a far-reaching change. `fs.readSync()` blocks the event loop for one disk seek + read per cache miss, which is acceptable because: (a) cache hits are the common case after the first render, and (b) the alternative (async `getLine`) would require rewriting the entire render pipeline.

### 2. Streaming index scan in `fromFile()`

The scan reads the file in 64 KB chunks via repeated `await fs.read()` calls. Peak memory during indexing is one chunk (64 KB), not the whole file. This is what actually achieves the memory-minimisation goal for large files — if we read the whole file up-front to scan it, we'd negate the benefit.

### 3. `_fileSize` is required for the last line

`_lineOffsets[n+1]` does not exist for the last line. The byte range is `[_lineOffsets[n], _fileSize)`. `_fileSize` is accumulated during the streaming scan (sum of all chunk sizes) and stored as a field. Do not use `stat.size` as a substitute — the scan and stat may race if the file is being written concurrently.

### 4. LRU implementation via `Map` insertion order

JavaScript `Map` preserves insertion order. The LRU property is maintained by a delete-then-reinsert on every cache hit:

```ts
const val = this._lineCache.get(n)!;
this._lineCache.delete(n);
this._lineCache.set(n, val);  // now at MRU end
```

Eviction always removes `_lineCache.keys().next().value` (the oldest/LRU entry). No separate `_lruOrder` array is needed.

### 5. `lines` getter/setter replaces the bare field — zero callers need updating

All external code that reads or writes `buf.lines` continues to work unchanged:

- `Editor.ts:336-337` — `buf.lines[line] = …; buf.lines.splice(…)` — getter materializes, mutations go to `_lines` directly.
- `Editor.ts:592,601` — `buf.lines.flatMap(…); buf.lines = newLines` — getter materializes for the flatMap; setter replaces `_lines` and closes the fd.
- All unit tests that do `assert.deepEqual(b.lines, …)`, `for (const line of b.lines)`, or `b.lines[0] = '…'` — all go through the getter and work without changes.

### 6. File descriptor lifecycle on Windows

Windows locks files opened with `fs.open()`. The fd must be closed before another process can write to the same file. `close()` must be called on buffer removal and before `save()` rewrites the file. Safe pattern: close fd → write → if not modified, re-open (only do this if the optimization is wanted).

### 7. Multi-pane scenario: shared buffer, shared caches

When the same file is open in two panes, both `Pane` objects hold a reference to the same `Buffer` instance. `_lineCache` lives on that single instance and is shared: a line loaded for pane 1 is immediately available to pane 2 at zero cost. `Highlighter` uses a `WeakMap<Buffer, HighlightCache>`, so the highlight chunk cache is also shared — chunk work done while rendering pane 1 is reused when rendering pane 2.

With `CACHE_SIZE = 2000` and a typical viewport height of ~50 lines, both viewports' worth of lines fit in the cache simultaneously (100 lines total), even when the two scroll positions are far apart. During normal navigation — arrow keys, page up/down — only newly-visible lines miss the cache; lines still on-screen are hits. No thrashing occurs for normal pane interaction.

The correctness of this scenario is straightforward. The performance concern that multi-pane navigation with a large file surfaces is the highlight tokenizer, which is addressed in the next section.

### 8. File search on lazy buffers

`FileSearch.searchInBuffers()` already iterates using `buf.lineCount` and `buf.getLine(ln)` — it does **not** access `buf.lines`. However, in lazy mode a search across all lines of a large file causes one `readSync` call per cache miss. For a 1 M-line file with 2 000 cache slots that means ~998 000 synchronous disk reads — potentially 20–100 seconds on SSD.

**Mitigation:** `searchInBuffer` should call `_materializeSync()` when `!buf._fullyLoaded` before entering the line loop. This pays the one-time cost of reading the whole file into `_lines`, after which all subsequent searches (and edits) operate on the in-memory array. Since a user-initiated search signals that the user intends to interact with the buffer in depth, materializing at that point is acceptable. `_materializeSync()` closes `_fd`, so no resource is left open.

`FileSearch.ts` currently does not import or call any Buffer internals — the cleanest API is to expose a public `buf.materialize(): void` method that is a no-op when `_fullyLoaded` is already true, and call it at the top of `searchInBuffer`. Add `materialize()` to `Buffer.ts` in Phase 2 alongside the other lazy-load additions.

### 9. `_materializeSync()` latency on first edit

For a 1 GB file, materializing on first keypress introduces a visible pause. Mitigation: limit lazy mode to files above a threshold (e.g. 5 000 lines) and load small files eagerly as before (set `_fullyLoaded = true` after scanning, store `_lines` normally).

---

## Highlight Cache: Discovered Problems and Solution

### Problems discovered

#### Problem 1 — Stack overflow for large files

`HighlightCache.getOrBuildChunk(N)` is recursive: it calls `getEndState(N-1)`, which calls `getOrBuildChunk(N-1)`, which calls `getEndState(N-2)`, and so on back to chunk 0. When the chunk cache is cold, this produces a call chain `N` frames deep. With `CHUNK_SIZE = 50` and Node.js's call stack limit of roughly 10 000–15 000 frames, the editor crashes with `RangeError: Maximum call stack size exceeded` at files larger than approximately 375 000 lines (7 500 chunks). This is a latent bug in the current code today; it becomes routinely triggered once lazy loading is enabled, because lazy mode is specifically intended for large files where users are likely to navigate to distant positions.

#### Problem 2 — O(N) disk reads on first render at line N

Even after fixing the recursion to an iterative loop, the tokenizer must process every line from 0 to N in order to determine the tokenizer state (e.g. whether a block comment or template literal is open) at line N. In lazy mode each of those lines is a `readSync()` call on cache miss. For a viewport at line 900 000:

| metric | value |
|---|---|
| chunks to build | 18 000 |
| `getLine()` calls | 900 000 |
| cache misses (2 000 cache slots) | ~898 000 |
| time on NVMe SSD (~0.02 ms/read) | ~18 seconds |
| time on SATA SSD (~0.1 ms/read) | ~90 seconds |

This makes lazy mode **unusable with syntax highlighting enabled** when the viewport is not near the top of the file. The multi-pane case makes this worse: if one pane is at line 0 and a second pane jumps to line 900 000, the first render of the second pane pays the full O(N) cost before anything is painted.

---

### Strategies surveyed

Three approaches were found in production editors and academic literature.

#### Strategy A — Tokenizer state checkpointing *(VS Code / Monaco, Sublime Text / syntect, TextMate)*

Store the tokenizer state at coarse intervals (e.g. every 5 000 lines). To highlight line N, find the nearest checkpoint before N and tokenize forward from there. The maximum forward-scan distance is bounded by the checkpoint interval regardless of how large the file is or how far the viewport has jumped.

VS Code stores per-line state (maximum granularity); Sublime Text's `syntect` library stores state at edit points and uses a background task to re-scan forward. TextMate pushes/pops a rule-stack `StackElement` that can be serialized and resumed at any saved position.

#### Strategy B — Viewport-only highlighting with deferred background build *(CodeMirror 6, GitHub deferred highlighting)*

Only tokenize lines within the visible viewport. Lines outside the viewport render as plain text immediately; a background job tokenizes forward and triggers a re-render when it reaches the viewport. CodeMirror 6 tracks a `decoratedTo` pointer and advances highlighting into the viewport incrementally using `requestAnimationFrame`-style scheduling. GitHub's pull-request diff view shows unstyled text first and swaps in highlighted versions as soon as they are ready.

The risk of this strategy alone is incorrect highlighting for the visible region when a multi-line token (block comment, template literal) spans from far above the viewport into it: the highlighter does not know the open token exists and renders those lines incorrectly.

#### Strategy C — Incremental parser (Tree-sitter) *(Neovim, Helix, Zed)*

Tree-sitter maintains a full incremental parse tree in memory and can update it after an edit in sub-millisecond time. Once the tree exists, re-highlighting after any change is very fast. However, Tree-sitter does **not** eliminate the cold-start O(N) problem: the initial parse of a 1M-line file still touches all N lines. Neovim's Tree-sitter integration disables itself above a configurable file-size threshold for exactly this reason. Tree-sitter also requires WASM grammar files, a substantial dependency for a zero-dependency editor. **This strategy is not adopted.**

---

### Chosen approach: A + B combined

Strategies A and B are complementary and address each other's weakness:

- Strategy A alone requires knowing the checkpoint state at the nearest interval before jumping to an arbitrary position. If no checkpoint exists yet (cold start), it still degenerates to scanning from line 0.
- Strategy B alone produces incorrect highlighting when multi-line tokens span from above the viewport.
- **Combined:** render the viewport as plain text immediately (B), while building checkpoints in the background from line 0 forward (A). Once the background builder reaches the nearest checkpoint before the viewport, re-render with correct highlighting. The user sees a brief flash of plain text (at most a fraction of a second on modern hardware, since background I/O is not on the render path) and then correct highlighted output.

This stays entirely within the existing tokenizer architecture: no new grammar format, no WASM, no Tree-sitter.

---

### Detailed changes to `Cache.ts`

```
New constants:
  CHUNK_SIZE = 50           (unchanged)
  CHECKPOINT_INTERVAL = 100 — save state every 100 chunks = 5 000 lines

New fields on HighlightCache:
  _checkpoints: Map<number, TokenizerState>
    — keyed by chunk index (only multiples of CHECKPOINT_INTERVAL)
    — stores the tokenizer state at the START of that chunk
    — checkpoints[0] = defaultState() always (synthetic; not stored, just implied)
  _building: boolean        — background build in progress for this buffer
  _buildTarget: number      — chunk index the background build is heading toward
  _redrawCallback: (() => void) | null
    — set by Editor; called when background build reaches _buildTarget

New public method:
  setRedrawCallback(cb: () => void): void

invalidateFrom(line) changes:
  — same chunk invalidation as today
  — additionally delete all checkpoints for chunk indices >= floor(line / CHUNK_SIZE)
    (their stored states may be wrong after the edit)

getOrBuildChunk(chunkIdx, buf, tokenizer)  [now iterative]:

  1. Already valid? → return immediately (fast path, unchanged behaviour)

  2. Find nearest ready checkpoint:
       cpIdx = floor(chunkIdx / CHECKPOINT_INTERVAL) * CHECKPOINT_INTERVAL
       cpState = _checkpoints.get(cpIdx)   // undefined if not built yet

  3. If cpState is undefined AND chunkIdx >= CHECKPOINT_INTERVAL:
       // Cold start far from beginning — defer
       _startBackgroundBuild(chunkIdx, buf, tokenizer)
       return null   // caller renders plain text for this chunk

  4. Otherwise build synchronously from cpIdx (or from 0 if cpState undefined):
       startIdx = cpState !== undefined ? cpIdx : 0
       state = cpState ?? defaultState()
       for i = startIdx .. chunkIdx:
         if chunks[i] is valid: state = chunks[i].endState; continue
         tokenize chunk i from state → store chunk, update state
         if i % CHECKPOINT_INTERVAL === 0: _checkpoints.set(i, stateAtStartOfChunk)
       return chunks[chunkIdx]

_startBackgroundBuild(targetChunkIdx, buf, tokenizer):
  if _building: update _buildTarget if targetChunkIdx > _buildTarget; return
  _building = true
  _buildTarget = targetChunkIdx

  // Find the furthest checkpoint already built
  startCpIdx = 0
  startState = defaultState()
  for cp = 0, CHECKPOINT_INTERVAL, 2*CHECKPOINT_INTERVAL, … ≤ targetCpIdx:
    if _checkpoints.has(cp): startCpIdx = cp; startState = _checkpoints.get(cp)
    else: break

  currentIdx = startCpIdx
  currentState = startState

  buildBatch = () =>
    // Build one CHECKPOINT_INTERVAL worth of chunks per setImmediate tick
    batchEnd = min(currentIdx + CHECKPOINT_INTERVAL, _buildTarget + CHECKPOINT_INTERVAL)
    state = currentState
    for i = currentIdx .. batchEnd - 1:
      if chunks[i] valid: state = chunks[i].endState; continue
      tokenize chunk i → store chunk, update state
      if i % CHECKPOINT_INTERVAL === 0: _checkpoints.set(i, stateAtStartOfChunk)
    currentIdx = batchEnd
    currentState = state

    if currentIdx > _buildTarget:
      _building = false
      _redrawCallback?.()    // trigger re-render now that viewport chunk is ready
      // Note: _buildTarget may be extended while the build is running (a second pane
      // requesting a further chunk calls _startBackgroundBuild which raises _buildTarget).
      // In that case the callback fires only when the furthest target is reached.
      // To avoid a pane at a near chunk waiting unnecessarily, fire the callback whenever
      // the build passes a checkpoint that covers a previously-deferred chunk:
      //   after storing a checkpoint, check if any pending getOrBuildChunk call can now
      //   be served — if so, call _redrawCallback immediately.
      // Simple approach: fire _redrawCallback at each CHECKPOINT_INTERVAL boundary during
      // the build, not just at _buildTarget. This limits the plain-text flash to at most
      // CHECKPOINT_INTERVAL * CHUNK_SIZE = 5 000 lines' worth of build time regardless
      // of how far another pane's target is.
    else:
      setImmediate(buildBatch)

  setImmediate(buildBatch)

getTokensForLine(line, buf, tokenizer):
  chunkIdx = floor(line / CHUNK_SIZE)
  chunk = getOrBuildChunk(chunkIdx, buf, tokenizer)
  if chunk is null: return []   // deferred — plain text this frame
  return chunk.tokens[line - chunkIdx * CHUNK_SIZE] ?? []
```

**Key properties of this design:**

- *Correctness:* once a checkpoint is built and the chunk cache is warm for the visible region, every token in the viewport is accurate — the full sequential tokenizer state has been computed from line 0.
- *Bounded synchronous cost:* a synchronous build (step 4) scans at most `CHECKPOINT_INTERVAL` chunks = 5 000 lines forward from the nearest checkpoint, regardless of file size or scroll position.
- *Non-blocking background build:* `setImmediate` yields to the event loop between batches, so keystrokes and redraws are never blocked by the background scan.
- *No disk reads above the viewport:* the background build calls `buf.getLine()` for lines above the viewport. In lazy mode these are `readSync()` calls, but they occur off the render path (in `setImmediate` callbacks) so they do not affect frame timing.
- *Multi-pane:* `HighlightCache` is shared across panes on the same buffer (via `Highlighter`'s `WeakMap`). A background build started by one pane's render serves all panes on that buffer. A single `_redrawCallback` is sufficient because `Editor.render()` always redraws all visible panes.

**Wiring the redraw callback in `Editor.ts`:**

When a buffer is opened, `Editor` calls `this.highlighter.getCache(buf).setRedrawCallback(() => this.render())`. When the buffer is closed, set the callback to `null`.

---

## Implementation phases

### Phase 1 — Infrastructure only (no behavior change)

- Rename `lines` field to `_lines` inside `Buffer.ts`.
- Add the `lines` getter/setter (getter returns `_lines` directly since `_fullyLoaded` is always `true`).
- Add `_lineOffsets` construction in `fromFile()` using the streaming chunk scan, but still also set `_lines` and `_fullyLoaded = true`.
- Route `getLine()` and `lineCount` through the `_fullyLoaded` branch.
- All tests pass unchanged — this is a pure no-op refactor.

### Phase 1.5 — Rework `Cache.ts` (prerequisite for Phase 2)

This phase fixes both highlight problems and must land before Phase 2.

- Convert `getOrBuildChunk` from recursive to iterative (eliminates stack overflow).
- Add `_checkpoints: Map<number, TokenizerState>` populated at every `CHECKPOINT_INTERVAL` chunks during the iterative build loop.
- Add `_building` / `_buildTarget` / `_redrawCallback` fields.
- Implement `_startBackgroundBuild()` using `setImmediate` batches.
- Add the cold-start guard in `getOrBuildChunk`: return `null` (plain text) when the chunk is far from the start and its checkpoint is not yet ready.
- Update `getTokensForLine` to return `[]` when `getOrBuildChunk` returns `null`.
- Update `invalidateFrom` to also purge checkpoints at or after the invalidated line.
- Wire the redraw callback in `Editor.ts` when buffers are opened/closed.
- All existing highlight unit tests must pass unchanged. Add new tests for: checkpoint population, background build triggering, plain-text fallback, checkpoint invalidation on edit.

### Phase 2 — Lazy load

- Stop setting `_lines` in `fromFile()`. Keep fd open. Set `_fullyLoaded = false`.
- `getLine()` reads from fd via `readSync` on miss, populates `_lineCache`.
- `_materializeSync()` triggers on first mutation (via `insert`, `deleteChar`, etc.) or on first `lines` getter access from external code that needs the full array.
- Apply the lazy-load threshold: files below e.g. 5 000 lines are still loaded eagerly (`_fullyLoaded = true` immediately after the scan).

### Phase 3 — LRU eviction

- Add eviction logic inside `getLine()` (delete+reinsert on hit, evict oldest when over `CACHE_SIZE`).
- Bounds memory for extremely large files.

### Phase 4 — fd cleanup

- `Editor._closeActivePane()` and the path that removes a buffer from `openBuffers` call `buf.close()`.
- `save()` closes fd before writing on Windows; re-opens only if the save-without-materialize optimization is enabled.

---

## What does NOT change

- All mutation method signatures (`insert`, `deleteChar`, …)
- `Pane`, `Cursor`, `Renderer`, `Highlighter` — zero changes
- `FileSearch` — one-line change: call `buf.materialize()` at entry (see §8)
- `ProjectSearch` — zero changes (walks disk files, not open buffers)
- `toString()`, `save()` — same external behavior
- All callers of `buf.lines` in `Editor.ts` and unit tests — zero changes (transparent via getter/setter)
- The tokenizer interface and all language tokenizers — zero changes

---

## Risks

| Risk | Severity | Phase | Mitigation |
|---|---|---|---|
| Stack overflow in `Cache.ts` for files > ~375 000 lines | **Critical** | 1.5 | Convert `getOrBuildChunk` to iterative |
| `getLine()` returns lines with trailing `\n` in lazy mode | **Critical** | 2 | Strip `\r?\n$` (not just `\r$`) from the decoded byte range |
| `lineCount` one too high for files ending with `\n` in lazy mode | **Critical** | 2 | Pop trailing phantom `_lineOffsets` entry when `_lineOffsets[last] === _fileSize` after scan |
| Incorrect highlighting when block comment spans from above viewport into view, before background build completes | Medium | 1.5 | Brief (sub-second) plain-text flash; correct once background build reaches the checkpoint before the viewport |
| Background build `setImmediate` loop keeps the process alive after quit | Low | 1.5 | Cancel the build (set `_building = false`, null callback) in `buf.close()` / on quit |
| Multi-pane: pane at near chunk waits for far-pane's build target before redraw | Low | 1.5 | Fire `_redrawCallback` at each checkpoint boundary during the build, not only at `_buildTarget` |
| File search on large lazy buffer: ~1 M `readSync` calls, 20–100 s on SSD | High | 2 | Call `buf.materialize()` at entry of `searchInBuffer`; one-time cost, O(1) thereafter |
| First-edit `_materializeSync()` pause for very large files | Medium | 2 | Line-count threshold; only lazy-load large files |
| Windows fd lock prevents writes while fd is open | Medium | 4 | Close fd before `writeFile`; re-open after if needed |
| LRU thrashing when two panes have disjoint, rapidly-scrolling viewports | Low | 3 | `CACHE_SIZE = 2000` is ample for typical viewports (~50 lines each); document the bound |

The streaming chunk scan in `fromFile()` (Phase 1) scans only for 0x0A bytes (which are never continuation bytes in UTF-8), so no special handling is needed at chunk boundaries. The recommended starting point is Phase 1, which is a pure no-op refactor validated by existing tests. Phase 1.5 must complete before Phase 2 is merged.
