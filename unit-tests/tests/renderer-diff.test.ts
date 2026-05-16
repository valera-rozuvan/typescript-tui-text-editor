import assert from 'node:assert/strict';
import { Terminal } from '../../dist/terminal/Terminal.js';
import { Renderer } from '../../dist/terminal/Renderer.js';
import { Layout } from '../../dist/ui/Layout.js';
import { FileBrowser } from '../../dist/ui/FileBrowser.js';
import { SearchPanel } from '../../dist/ui/SearchPanel.js';
import { JsTransformPanel } from '../../dist/ui/JsTransformPanel.js';
import { UndoPanel } from '../../dist/ui/UndoPanel.js';
import { Highlighter } from '../../dist/highlight/Highlighter.js';
import { Buffer } from '../../dist/editor/Buffer.js';
import type { TestCase } from './types.js';

export const suite = 'Renderer diff';

// Each Terminal() adds a SIGWINCH listener; raise the limit so tests don't warn.
(process as unknown as { setMaxListeners(n: number): void }).setMaxListeners(50);

type StdoutLike = { write: (s: unknown) => boolean };

function captureOutput(fn: () => void): string {
  const chunks: string[] = [];
  const stdout = process.stdout as unknown as StdoutLike;
  const orig = stdout.write.bind(process.stdout);
  stdout.write = (s: unknown) => { chunks.push(s as string); return true; };
  try {
    fn();
  } finally {
    stdout.write = orig;
  }
  return chunks.join('');
}

function makeCtx() {
  const term = new Terminal();
  const renderer = new Renderer(term);
  const layout = new Layout();
  layout.update(term.width, term.height);
  const fb = new FileBrowser('.');
  const sp = new SearchPanel();
  const hl = new Highlighter();
  return { term, renderer, layout, fb, sp, hl };
}

function doRender(ctx: ReturnType<typeof makeCtx>): string {
  return captureOutput(() => {
    ctx.renderer.render(ctx.layout, ctx.fb, ctx.sp, new JsTransformPanel(), new UndoPanel(), ctx.hl, 'edit', '');
  });
}

function countMoveTo(s: string): number {
  return (s.match(/\x1b\[\d+;\d+H/g) ?? []).length;
}

export const tests: TestCase[] = [
  // ── Cursor visibility ────────────────────────────────────────────────────────
  {
    name: 'getCursorVisible: returns true by default',
    fn: () => {
      const { renderer } = makeCtx();
      assert.equal(renderer.getCursorVisible(), true);
    },
  },
  {
    name: 'setCursorVisible(false) makes getCursorVisible return false',
    fn: () => {
      const { renderer } = makeCtx();
      renderer.setCursorVisible(false);
      assert.equal(renderer.getCursorVisible(), false);
    },
  },
  {
    name: 'setCursorVisible(true) after false makes getCursorVisible return true',
    fn: () => {
      const { renderer } = makeCtx();
      renderer.setCursorVisible(false);
      renderer.setCursorVisible(true);
      assert.equal(renderer.getCursorVisible(), true);
    },
  },

  // ── First render / _needsClear flag ──────────────────────────────────────────
  {
    name: 'first render emits clearScreen sequence',
    fn: () => {
      const ctx = makeCtx();
      const out = doRender(ctx);
      assert.ok(out.includes('\x1b[2J'), 'expected clearScreen (\\x1b[2J) in first render');
    },
  },
  {
    name: 'first render emits hideCursor',
    fn: () => {
      const ctx = makeCtx();
      const out = doRender(ctx);
      assert.ok(out.includes('\x1b[?25l'), 'expected hideCursor in first render');
    },
  },
  {
    name: 'first render emits reset sequence',
    fn: () => {
      const ctx = makeCtx();
      const out = doRender(ctx);
      assert.ok(out.includes('\x1b[0m'), 'expected reset sequence in first render');
    },
  },
  {
    name: 'second render does not emit clearScreen',
    fn: () => {
      const ctx = makeCtx();
      doRender(ctx); // first render
      const out = doRender(ctx); // second render, same state
      assert.ok(!out.includes('\x1b[2J'), 'second identical render must not emit clearScreen');
    },
  },

  // ── Diff algorithm: identical state → no cell output ─────────────────────────
  {
    name: 'second identical render produces no moveTo sequences (unchanged diff)',
    fn: () => {
      const ctx = makeCtx();
      doRender(ctx); // first render — establishes _current
      const out = doRender(ctx); // second render — same layout/state
      // No cell-diff moveTo should be generated; output is just hideCursor + reset
      assert.equal(
        countMoveTo(out),
        0,
        `expected 0 moveTo in unchanged second render, got ${countMoveTo(out)}`,
      );
    },
  },

  // ── Diff algorithm: state change → moveTo sequences appear ───────────────────
  {
    name: 'opening a buffer after first render causes diff moveTo sequences',
    fn: () => {
      const ctx = makeCtx();
      doRender(ctx); // first render — blank pane "[No File]"
      ctx.layout.panes[0].buffer = new Buffer('hello world');
      (ctx.layout.panes[0].buffer as Buffer).filePath = '/tmp/test.txt';
      const out = doRender(ctx); // second render — title bar and content changed
      assert.ok(
        countMoveTo(out) > 0,
        'expected moveTo sequences in diff after adding a buffer',
      );
    },
  },

  // ── Consecutive cell optimisation ────────────────────────────────────────────
  {
    name: 'consecutive changed cells on same row produce fewer moveTos than cells changed',
    fn: () => {
      const ctx = makeCtx();
      doRender(ctx); // first render — blank title "[No File]"

      // Open a buffer with a long file path so the title bar changes across many cells
      ctx.layout.panes[0].buffer = new Buffer('');
      (ctx.layout.panes[0].buffer as Buffer).filePath = '/tmp/abcdefghijklmnopqrstuvwxyz.txt';

      const out = doRender(ctx);
      const moveTos = countMoveTo(out);
      // The title spans the full pane width (≥ 40 cells in any real terminal).
      // With batching, consecutive cells on one row share a single moveTo,
      // so total moveTos must be far fewer than the width of the title bar.
      const paneWidth = ctx.term.width;
      assert.ok(
        moveTos < paneWidth,
        `expected fewer moveTo (${moveTos}) than pane width (${paneWidth}) due to cell batching`,
      );
    },
  },

  // ── Style sequences ──────────────────────────────────────────────────────────
  {
    name: 'first render includes bold sequence for active pane title',
    fn: () => {
      const ctx = makeCtx();
      ctx.layout.panes[0].buffer = new Buffer('');
      const out = doRender(ctx);
      // Active pane title bar uses ctx.setBold(true) — emits \x1b[1m
      assert.ok(out.includes('\x1b[1m'), 'expected bold sequence (\\x1b[1m) for active pane title');
    },
  },
  {
    name: 'first render includes fg color sequences',
    fn: () => {
      const ctx = makeCtx();
      const out = doRender(ctx);
      // Foreground 24-bit color sequences: \x1b[38;2;R;G;Bm
      assert.ok(out.match(/\x1b\[38;2;\d+;\d+;\d+m/), 'expected fg RGB color sequence');
    },
  },
  {
    name: 'first render includes bg color sequences',
    fn: () => {
      const ctx = makeCtx();
      const out = doRender(ctx);
      // Background 24-bit color sequences: \x1b[48;2;R;G;Bm
      assert.ok(out.match(/\x1b\[48;2;\d+;\d+;\d+m/), 'expected bg RGB color sequence');
    },
  },

  // ── Search panel: hardware cursor positioning ─────────────────────────────────
  {
    name: 'search panel active: render output ends with showCursor',
    fn: () => {
      const ctx = makeCtx();
      ctx.sp.open('file');
      const out = captureOutput(() => {
        ctx.renderer.render(ctx.layout, ctx.fb, ctx.sp, new JsTransformPanel(), new UndoPanel(), ctx.hl, 'search', '');
      });
      assert.ok(out.endsWith('\x1b[?25h'), 'expected showCursor (\\x1b[?25h) at end of output when search is active');
    },
  },
  {
    name: 'search panel not active: render output does not end with showCursor',
    fn: () => {
      const ctx = makeCtx();
      const out = doRender(ctx);
      assert.ok(!out.endsWith('\x1b[?25h'), 'showCursor should not appear when search panel is inactive');
    },
  },

  // ── Modified buffer indicator ─────────────────────────────────────────────────
  {
    name: 'modified buffer causes bullet marker in title (● appears in diff output)',
    fn: () => {
      const ctx = makeCtx();
      const buf = new Buffer('hello');
      buf.filePath = '/tmp/test.txt';
      ctx.layout.panes[0].buffer = buf;
      doRender(ctx); // establish baseline

      buf.modified = true;
      const out = doRender(ctx);
      // The title bar now includes ` ●` for modified — some cells changed
      assert.ok(countMoveTo(out) > 0, 'expected moveTo after setting buffer.modified = true');
    },
  },
];
