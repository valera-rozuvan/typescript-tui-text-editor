/*
 * 03_multipane — verify split-pane layouts, pane switching, and independent
 * content in each pane.
 *
 * Terminal size: 120 × 30
 *
 * Layout math (hsplit2, cols = 120):
 *   sep      = floor(120 / 2) = 60
 *   pane 0   : x = 0,  width = 59   → content cols 0–58
 *   separator: col 59  (the │ character)
 *   pane 1   : x = 60, width = 60   → content cols 60–119
 *
 * For vsplit2 (rows = 30, status bar = 1 row → H = 29):
 *   sep      = floor(29 / 2) = 14
 *   pane 0   : rows 0–12
 *   separator: row 13
 *   pane 1   : rows 14–28
 */
import type { TestCase } from './types.js';
import {
  EditorTest, KEY,
  createTempDir, createTempFile, removeTempDir,
} from './helpers.js';

export const suite = 'multipane';

/* Column boundaries for hsplit2 at 120 cols */
const LEFT_START  = 0;
const LEFT_END    = 59;   /* exclusive: pane 0 occupies cols 0–58 */
const RIGHT_START = 60;
const RIGHT_END   = 120;

export const tests: TestCase[] = [
  {
    name: 'Alt+2 creates a horizontal split with a visible separator',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest();
      try {
        const file = createTempFile(dir, 'split.txt', 'content\n');
        await t.start([file]);
        await t.keys(KEY.ALT_2);
        /* A vertical separator │ should appear between the two panes */
        t.assertContains('│');
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    name: 'Alt+2 keeps pane 0 showing the original file',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest();
      try {
        const file = createTempFile(dir, 'orig.txt', 'ORIGINAL_CONTENT\n');
        await t.start([file]);
        await t.keys(KEY.ALT_2);
        t.assertInCols('ORIGINAL_CONTENT', LEFT_START, LEFT_END);
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    name: 'Ctrl+N switches focus to the next pane',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest();
      try {
        const file = createTempFile(dir, 'switch.txt', 'start\n');
        await t.start([file]);
        await t.keys(KEY.ALT_2);          /* split into 2 */
        await t.keys(KEY.CTRL_N);         /* switch to pane 1 */
        /* After switching, typing creates a new buffer in pane 1.
           The content should land in the right half of the screen. */
        await t.type('PANE1_TEXT');
        t.assertInCols('PANE1_TEXT', RIGHT_START, RIGHT_END);
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    name: 'each pane holds independent content after switching and typing',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest();
      try {
        const file = createTempFile(dir, 'pane0.txt', 'PANE_ZERO_DATA\n');
        await t.start([file]);
        await t.keys(KEY.ALT_2);          /* split; pane 0 is active */
        await t.keys(KEY.CTRL_N);         /* switch to pane 1 */
        await t.type('PANE_ONE_DATA');    /* types into pane 1 */

        /* pane 0 content visible in the left half */
        t.assertInCols('PANE_ZERO_DATA', LEFT_START, LEFT_END);
        /* pane 1 content visible in the right half */
        t.assertInCols('PANE_ONE_DATA', RIGHT_START, RIGHT_END);
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    name: 'Ctrl+N cycles back to pane 0 from pane 1',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest();
      try {
        const file = createTempFile(dir, 'cycle.txt', 'CYCLE_FILE\n');
        await t.start([file]);
        await t.keys(KEY.ALT_2);
        await t.keys(KEY.CTRL_N); /* pane 0 → pane 1 */
        await t.type('SECOND');
        await t.keys(KEY.CTRL_N); /* pane 1 → pane 0 */
        /* pane 0 is now active; typing here should appear in the left half */
        await t.type('FIRST');
        t.assertInCols('FIRST', LEFT_START, LEFT_END);
        t.assertInCols('SECOND', RIGHT_START, RIGHT_END);
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    name: 'Alt+3 creates a vertical split with a horizontal separator',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest();
      try {
        const file = createTempFile(dir, 'vsplit.txt', 'vsplit_content\n');
        await t.start([file]);
        await t.keys(KEY.ALT_3);
        /* A horizontal separator ─ should span the screen */
        t.assertContains('─');
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    name: 'Alt+1 returns to single-pane layout, removing the separator',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest();
      try {
        const file = createTempFile(dir, 'single.txt', 'only_pane\n');
        await t.start([file]);
        await t.keys(KEY.ALT_2);  /* split */
        t.assertContains('│');    /* separator present */
        await t.keys(KEY.ALT_1);  /* back to single */
        t.assertNotContains('│'); /* separator gone */
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    name: 'Alt+4 creates a quad layout with both vertical and horizontal separators',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest();
      try {
        const file = createTempFile(dir, 'quad.txt', 'quad_content\n');
        await t.start([file]);
        await t.keys(KEY.ALT_4);
        t.assertContains('│');
        t.assertContains('─');
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    name: 'status bar reflects the active pane after switching',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest();
      try {
        const file = createTempFile(dir, 'status.txt', '');
        await t.start([file]);
        await t.keys(KEY.ALT_2);
        /* Pane 1 inherits pane 0's buffer on split.  Switch to pane 1 then
           close its buffer with Ctrl+W (unmodified → no prompt); the status
           bar should now reflect an empty pane. */
        await t.keys(KEY.CTRL_N);    /* focus pane 1 */
        await t.keys(KEY.CTRL_W);    /* close its buffer */
        t.assertStatusContains('[No File]');
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },
];
