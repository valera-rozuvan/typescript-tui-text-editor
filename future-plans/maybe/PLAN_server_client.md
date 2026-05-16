# Plan: Server-Client Architecture

## Goal

Convert the editor from a single-process TUI application into a **server + multiple client** architecture where:

- A single **server process** owns all open buffers and all file-system I/O.
- Multiple **client processes** each render their own TUI and share the same buffer state.
- Edits made in any client are immediately visible in all others.
- From the user's perspective nothing changes — same UI, same key bindings.
- No new npm packages; only Node.js built-in modules (`net`, `fs/promises`, `path`, `os`, `crypto`).

---

## Resolved Design Decisions

| Question | Decision |
|----------|----------|
| Server lifetime | Auto-exits 500 ms after the last client disconnects |
| Auto-start | If no server is running when a client starts, the client forks one automatically |
| Unnamed scratch buffers | Client-local until the user types; first keystroke registers them on the server under a random private ID (`scratch-<uuid>`). They are not shown in other clients' buffer lists. On first save they become file-backed and visible to all clients. |
| ProjectSearch | Server-side only — server walks the filesystem and streams incremental results back to the requesting client |
| FileSearch (in-buffer fuzzy) | Client-side — searches the local copy of open buffer lines |
| Buffer close (Ctrl+W) | Client sends `releaseBuffer`; server decrements per-buffer ref-count; scratch buffers with zero refs are removed |

---

## Transport

**Unix domain sockets** (`net.createServer` / `net.createConnection` with a socket path).

- Faster than TCP for local IPC.
- Socket path: `<os.tmpdir()>/node-text-editor-<sha1(cwd)[0..8]>.sock`
  One server per working directory — independent projects don't interfere.
- On server start, if a stale socket file exists (ECONNREFUSED), unlink it and rebind.

**Wire framing**: length-prefixed JSON.

```
[ 4-byte big-endian uint32: byte length of payload ][ UTF-8 JSON payload ]
```

All messages in both directions use this framing. Implemented once in
`src/protocol/FramedSocket.ts` (used by both server and client).

---

## Message Protocol

Defined in `src/protocol/messages.ts` as TypeScript discriminated unions.

### Client → Server

```ts
type ClientMessage =
  | { type: 'openFile';            path: string }
  | { type: 'createBuffer'                      }   // register scratch buffer on server
  | { type: 'listBuffers'                       }   // file-backed buffers only
  | { type: 'edit';                bufId: string; baseVersion: number; op: EditOp }
  | { type: 'save';                bufId: string; path?: string }  // path only on first save of scratch
  | { type: 'releaseBuffer';       bufId: string }
  | { type: 'projectSearch';       needle: string; startDir: string; requestId: string }
  | { type: 'cancelProjectSearch'; requestId: string }
  | { type: 'ping'                              }
```

### Server → Client

```ts
type ServerMessage =
  | { type: 'welcome';              clientId: string }
  | { type: 'bufferState';          bufId: string; path: string | null; lines: string[];
                                    version: number; readOnly: boolean; isPrivate: boolean }
  | { type: 'bufferList';           buffers: BufferMeta[] }   // only file-backed buffers
  | { type: 'opBroadcast';          bufId: string; newVersion: number; op: EditOp; fromClientId: string }
  | { type: 'opRejected';           bufId: string; currentVersion: number; currentLines: string[] }
  | { type: 'saved';                bufId: string; path: string }
  | { type: 'projectSearchResults'; requestId: string; results: ProjectSearchResult[]; done: boolean }
  | { type: 'error';                code: string; message: string }
  | { type: 'pong'                  }

interface BufferMeta { bufId: string; path: string; modified: boolean; }
```

`ProjectSearchResult` is the same type already exported from `src/search/ProjectSearch.ts`.

### Edit Operations

```ts
type EditOp =
  | { kind: 'insert';           line: number; col: number; text: string }
  | { kind: 'deleteChar';       line: number; col: number }
  | { kind: 'deleteCharBefore'; line: number; col: number }
  | { kind: 'insertNewline';    line: number; col: number }
```

These map 1-to-1 to existing `Buffer` mutation methods, so the same logic runs
on both sides.

---

## Conflict Resolution

Simple **optimistic versioned ops**:

1. Each server buffer has a monotonically incrementing `version` integer.
2. Client sends `{ type: 'edit', bufId, baseVersion: N, op }`.
3. If `server.version === N`: apply op, version → N+1, send `opBroadcast` to
   **all other** clients. The originating client treats its local application
   as confirmed (no echo back needed).
4. If `server.version !== N`: concurrent edit landed first. Server sends
   `opRejected` with full current lines. Client discards optimistic state and
   resets to authoritative content.

Operational Transforms or CRDTs can be layered on later; for a local
multi-pane editor the conflict window is very narrow.

---

## Scratch Buffer Lifecycle

```
Client starts, no file arg
  → creates a local Buffer() — server not involved at all

User presses first key (any edit op on a path-less buffer)
  → client sends { type: 'createBuffer' }
  → server creates ServerBuffer with id='scratch-<uuid>', path=null, isPrivate=true
  → server replies bufferState; client promotes local Buffer → RemoteBuffer
  → subsequent edits go through the normal versioned-op path

User presses Ctrl+S → prompted for filename (existing "Save As" flow)
  → client sends { type: 'save', bufId, path: '/chosen/file.ts' }
  → server sets buffer.filePath, writes to disk, replies { type: 'saved', bufId, path }
  → buffer.isPrivate flips to false; now appears in other clients' listBuffers
```

Scratch buffers with `isPrivate: true` are excluded from `listBuffers` responses
sent to other clients.

---

## New Directory Layout

```
src/
  protocol/
    messages.ts          — all message type definitions (EditOp, ClientMessage, ServerMessage, …)
    FramedSocket.ts      — length-prefix encode/decode, wraps net.Socket
  server/
    EditorServer.ts      — net.Server, session management, broadcast, project search runner
    ServerBuffer.ts      — extends editor/Buffer with version, id, isPrivate, ref-count, applyOp()
  client/
    ServerConnection.ts  — connects to server socket, outbound queue, inbound dispatch
    RemoteBuffer.ts      — Buffer-compatible; applies ops locally + sends to server
  index.ts               — modified: auto-connect, auto-fork server if needed
  server-entry.ts        — standalone server entry point
```

### Unchanged / minimally touched

`terminal/`, `ui/`, `highlight/` — pure client-side, no changes.  
`search/FuzzyMatcher.ts` — unchanged, imported by both `ProjectSearch.ts` (server) and `FileSearch.ts` (client).  
`search/FileSearch.ts` — unchanged, stays client-side (searches local buffer lines).  
`search/ProjectSearch.ts` — unchanged logic; now only called from `EditorServer.ts`, not from `Editor.ts`.  
`editor/Buffer.ts` — unchanged; `ServerBuffer` extends it.  
`editor/Cursor.ts` — unchanged.  
`editor/Editor.ts` — modified (see below).

---

## Component Details

### `FramedSocket.ts`

```ts
class FramedSocket {
  constructor(socket: net.Socket, onMessage: (msg: unknown) => void, onClose: () => void)
  send(msg: unknown): void   // JSON-serialize, prepend 4-byte length, write
}
```

Accumulates incoming `Buffer` chunks, parses complete frames, calls `onMessage`.
The accumulator uses Node's `Buffer` (aliased as `NodeBuffer` to avoid collision
with our text `Buffer` class).

---

### `ServerBuffer.ts`

```ts
class ServerBuffer extends Buffer {
  readonly id: string;           // 'scratch-<uuid>' or same as filePath
  version = 0;
  isPrivate: boolean;            // true until first save to a real path
  private _clients = new Set<string>();   // clientIds that have this buffer open

  addClient(clientId: string): void
  removeClient(clientId: string): boolean  // returns true if refcount reaches 0
  applyOp(op: EditOp): void               // delegates to Buffer methods, increments version
}
```

`id` is generated with `crypto.randomUUID()` (Node 19+ built-in).

---

### `EditorServer.ts`

Responsibilities:
- `net.Server` listening on the Unix socket path.
- `Map<string, ServerBuffer>` — bufId → buffer.
- `Map<string, FramedSocket>` — clientId → framed socket.
- `Map<string, { cancelled: boolean }>` — requestId → project search signal.

Key behaviours:
- **`openFile`**: deduplicates by resolved path; reads file if new; `addClient`; replies `bufferState`.
- **`createBuffer`**: creates `ServerBuffer` with `isPrivate=true`; replies `bufferState`.
- **`edit`**: validates `baseVersion`, applies via `applyOp`, broadcasts `opBroadcast` to all
  *other* clients that have the buffer open; or sends `opRejected` if version mismatch.
- **`save`**: if `path` provided, sets `buffer.filePath` and `buffer.isPrivate = false`;
  calls `buffer.save()`; replies `saved`.
- **`releaseBuffer`**: calls `removeClient`; if refcount 0 and `isPrivate`, deletes buffer.
- **`projectSearch`**: stores a `{ cancelled: false }` signal keyed by `requestId`;
  calls `searchProject(needle, startDir, onResults, signal)` where `onResults` sends
  `{ type: 'projectSearchResults', requestId, results, done: false }` incrementally,
  and sends `done: true` on completion.
- **`cancelProjectSearch`**: sets `signal.cancelled = true`.
- **Client disconnect**: releases all buffers for that client; if no clients remain,
  schedules `process.exit(0)` after 500 ms (cancelled if a new client connects in time).

---

### `RemoteBuffer.ts`

```ts
class RemoteBuffer {
  // Same public interface as Buffer (lines, filePath, modified, readOnly, name,
  // lineCount, getLine, insert, deleteChar, deleteCharBefore, insertNewline,
  // indentAt, toString, save)
  readonly bufId: string;
  private _conn: ServerConnection;
  private _pendingVersion: number;   // version of last optimistic op sent

  // Called by EditorServer broadcasts via Editor.onServerMessage:
  applyBroadcast(op: EditOp, newVersion: number): void
  resetToState(lines: string[], version: number): void   // opRejected handler
}
```

Mutation methods:
1. Apply op locally immediately (no flicker, responsive).
2. Send `{ type: 'edit', bufId, baseVersion: this._pendingVersion, op }`.
3. Increment `_pendingVersion` optimistically.

`save(path?: string)` sends `{ type: 'save', bufId, path }` and awaits `saved`.

---

### `ServerConnection.ts`

```ts
class ServerConnection extends EventEmitter {
  static async connect(socketPath: string): Promise<ServerConnection>
  send(msg: ClientMessage): void
  // Events: 'message' (ServerMessage), 'close'
  close(): void
}
```

Used by `RemoteBuffer` for edits/saves and by `Editor` for file open, project
search, and listing buffers.

---

### `index.ts` startup sequence

```
1. Compute socketPath: os.tmpdir() + '/node-text-editor-' + sha1(cwd).slice(0,8) + '.sock'
2. Try net.createConnection(socketPath).
   - Success → step 4.
   - ENOENT or ECONNREFUSED →
       a. Unlink stale socket if ECONNREFUSED.
       b. Spawn 'node dist/server-entry.js' with { detached: true, stdio: 'ignore' };
          call child.unref() so the parent doesn't wait for it.
       c. Poll socketPath up to 3 s (50 ms intervals) until connectable.
3. If poll times out → print error and exit(1).
4. Receive 'welcome' message → obtain clientId.
5. Construct Editor(connection).
6. If filePath CLI arg → editor.openFile(filePath) (sends openFile to server,
   awaits bufferState, builds RemoteBuffer).
7. editor.start() — normal TUI event loop.
```

---

### `Editor.ts` changes

- `openBuffers: Buffer[]` → `openBuffers: RemoteBuffer[]`.
- Adds `private _conn: ServerConnection`.
- **`openFile(path)`**: sends `{ type: 'openFile', path }`, awaits `bufferState`,
  constructs `RemoteBuffer`, proceeds as before.
- **First keystroke on an unnamed buffer**: if `pane.buffer` is a plain `Buffer`
  (not yet a `RemoteBuffer`), send `createBuffer`, await `bufferState`, promote.
- **Ctrl+S**: calls `remoteBuffer.save()` — async; clears `modified` on `saved` reply.
- **Ctrl+P (project search)**: sends `{ type: 'projectSearch', needle, startDir: cwd,
  requestId: uuid() }`. Handles incoming `projectSearchResults` messages to update
  `SearchPanel`.
- **`_projectSearchCancel`** becomes a `_projectSearchRequestId: string | null`; cancel
  sends `{ type: 'cancelProjectSearch', requestId }` instead of mutating a local flag.
- **`onServerMessage(msg: ServerMessage)`**: dispatches `opBroadcast` / `opRejected`
  to the correct `RemoteBuffer` by `bufId`, then calls `render()`.
- **Ctrl+W** (close buffer): sends `{ type: 'releaseBuffer', bufId }` before removing
  from `openBuffers`.

---

## `src/globals.d.ts` additions

```ts
declare module 'net' { … }        // createServer, createConnection, Socket, Server
declare module 'crypto' { randomUUID(): string; createHash(alg: string): Hash; … }
```

---

## What Stays Exactly the Same

- All TUI rendering (`Renderer`, `ScreenBuffer`, `Terminal`).
- All key input parsing (`Input.ts`).
- All syntax highlighting — still operates on `RemoteBuffer.lines` locally.
- `FileSearch` — in-buffer fuzzy search, runs on the client's local line copies.
- Layout, panes, `Cursor`, scroll — all client-local state.
- All existing unit tests — `ServerBuffer.applyOp` is additive over `Buffer`.

---

## New CLI Usage

```bash
node dist/server-entry.js           # optional: start server manually (foreground)
node dist/index.js [file]           # client — auto-starts server if none running
```

---

## Implementation Order

1. `src/globals.d.ts` — add `net` and `crypto` declarations
2. `src/protocol/messages.ts` — all message types
3. `src/protocol/FramedSocket.ts` — framing layer
4. `src/server/ServerBuffer.ts` — versioned buffer
5. `src/server/EditorServer.ts` — server logic + project search integration
6. `src/server-entry.ts` — thin entry point that starts `EditorServer`
7. `src/client/ServerConnection.ts` — client socket wrapper
8. `src/client/RemoteBuffer.ts` — optimistic local buffer proxy
9. Modify `src/index.ts` — auto-connect / auto-fork
10. Modify `src/editor/Editor.ts` — swap `Buffer` → `RemoteBuffer`, route broadcasts,
    delegate project search to server
11. Build (`npm run build`) and fix type errors
12. Manual smoke-test: two terminals, edits in one appear in the other
13. Add unit tests: `ServerBuffer` op application, `FramedSocket` framing
14. Update `CLAUDE.md` with new architecture notes

---

## Out of Scope (Future Work)

- File-system watching (push external changes to clients).
- Persistent server across sessions (keep buffers alive after all clients exit).
- Networked clients over TCP (cross-machine editing).
- Operational Transform / CRDT for concurrent edits on the same line.
