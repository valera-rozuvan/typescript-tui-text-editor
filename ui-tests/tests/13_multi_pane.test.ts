/*
 * 13_multi_pane — verify that editing a file from multiple panes writes
 * content to the correct positions and that all phrases survive to disk.
 *
 * Terminal size: 120 × 30 (default EditorTest dimensions)
 *
 * Fixture: ui-tests/fixtures/13_multi_pane/
 *   file_a.txt  — 260 lines; empty at lines 61, 121, 181  (hsplit2 test)
 *   file_b.txt  — 260 lines; empty at lines 61, 121, 181  (vsplit2 test)
 *   file_c.txt  — 260 lines; empty at lines 31, 71, 111, 151 (quad test)
 *   file_d.txt  — 260 lines; all content                  (spare 4th file)
 *   dot_git/    — copied as .git/ (project-root stub)
 *
 * Navigation math:
 *   Each pane has an independent cursor starting at line 1 (buffer index 0).
 *   Pressing ARROW_DOWN N times moves the cursor to buffer index N (line N+1
 *   in the editor's 1-based display).  Empty lines are targeted so that typed
 *   phrases occupy their line unambiguously.
 *
 *   hsplit2 / vsplit2 (file_a / file_b):
 *     Pane 0 start → down 60  → line 61  → phrase 1
 *     Pane 1 start → down 120 → line 121 → phrase 2
 *     Pane 0 resume (was at line 61) → down 120 → line 181 → phrase 3
 *
 *   quad (file_c):
 *     Pane 0 start → down 30  → line 31  → phrase A
 *     Pane 1 start → down 70  → line 71  → phrase B
 *     Pane 2 start → down 110 → line 111 → phrase C
 *     Pane 3 start → down 150 → line 151 → phrase D
 */
import type { TestCase } from './types.js';
import { join } from 'node:path';
import {
  EditorTest, KEY,
  copyFixtureToTemp, readTempFile, removeTempDir,
} from './helpers.js';

export const suite = 'multi_pane';

const DOWN = KEY.ARROW_DOWN;

function assertPhraseOrder(content: string, phrases: string[]): void {
  const indices = phrases.map(p => content.indexOf(p));
  const missing = phrases.filter((_, i) => indices[i] < 0);
  if (missing.length > 0) {
    throw new Error(
      `Phrases missing from saved file:\n` +
      missing.map(p => `  "${p}"`).join('\n') +
      `\n\nFile content:\n${content}`
    );
  }
  for (let i = 0; i < indices.length - 1; i++) {
    if (indices[i] >= indices[i + 1]) {
      throw new Error(
        `Phrases out of order in saved file.\n` +
        phrases.map((p, j) => `  [${j}] offset=${indices[j]} "${p}"`).join('\n')
      );
    }
  }
}

export const tests: TestCase[] = [
  /* ── Test 1: hsplit2 ──────────────────────────────────────────────────── */
  {
    name: 'hsplit2: three phrases typed across two panes appear in order on disk',
    async fn() {
      const dir = copyFixtureToTemp('13_multi_pane');
      const t = new EditorTest();
      try {
        const file = join(dir, 'file_a.txt');
        await t.start([file]);
        await t.keys(KEY.ALT_2);                      /* hsplit2 layout; pane 0 active */

        /* Pane 0 → line 61 (down 60 times) */
        await t.keys(DOWN.repeat(60), 1500);
        await t.type('the brown fox jumped over the moon');
        await t.keys(KEY.CTRL_S, 500);

        /* Switch to pane 1 (cursor starts at line 1) → line 121 */
        await t.keys(KEY.CTRL_N);
        await t.keys(DOWN.repeat(120), 2000);
        await t.type('the first man to the moon was from the USA');
        await t.keys(KEY.CTRL_S, 500);

        /* Switch back to pane 0 (cursor still at line 61) → line 181 */
        await t.keys(KEY.CTRL_N);
        await t.keys(DOWN.repeat(120), 2000);
        await t.type('small test is better than no test');
        await t.keys(KEY.CTRL_S, 500);

        const content = readTempFile(file);
        assertPhraseOrder(content, [
          'the brown fox jumped over the moon',
          'the first man to the moon was from the USA',
          'small test is better than no test',
        ]);
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  /* ── Test 2: vsplit2 ──────────────────────────────────────────────────── */
  {
    name: 'vsplit2: three phrases typed across two panes appear in order on disk',
    async fn() {
      const dir = copyFixtureToTemp('13_multi_pane');
      const t = new EditorTest();
      try {
        const file = join(dir, 'file_b.txt');
        await t.start([file]);
        await t.keys(KEY.ALT_3);                      /* vsplit2 layout; pane 0 active */

        /* Pane 0 → line 61 */
        await t.keys(DOWN.repeat(60), 1500);
        await t.type('the brown fox jumped over the moon');
        await t.keys(KEY.CTRL_S, 500);

        /* Switch to pane 1 → line 121 */
        await t.keys(KEY.CTRL_N);
        await t.keys(DOWN.repeat(120), 2000);
        await t.type('the first man to the moon was from the USA');
        await t.keys(KEY.CTRL_S, 500);

        /* Back to pane 0 (cursor at line 61) → line 181 */
        await t.keys(KEY.CTRL_N);
        await t.keys(DOWN.repeat(120), 2000);
        await t.type('small test is better than no test');
        await t.keys(KEY.CTRL_S, 500);

        const content = readTempFile(file);
        assertPhraseOrder(content, [
          'the brown fox jumped over the moon',
          'the first man to the moon was from the USA',
          'small test is better than no test',
        ]);
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  /* ── Test 3: quad ─────────────────────────────────────────────────────── */
  {
    name: 'quad: four panes each write a phrase at a distinct line; all present in order on disk',
    async fn() {
      const dir = copyFixtureToTemp('13_multi_pane');
      const t = new EditorTest();
      try {
        const file = join(dir, 'file_c.txt');
        await t.start([file]);
        await t.keys(KEY.ALT_4);                      /* quad layout; pane 0 active */

        /* Pane 0 (top-left) → line 31 */
        await t.keys(DOWN.repeat(30), 800);
        await t.type('the quick brown fox leaped over the moon');
        await t.keys(KEY.CTRL_S, 500);

        /* Pane 1 (top-right) → line 71 */
        await t.keys(KEY.CTRL_N);
        await t.keys(DOWN.repeat(70), 1200);
        await t.type('the first astronaut on the moon was Neil Armstrong');
        await t.keys(KEY.CTRL_S, 500);

        /* Pane 2 (bottom-left) → line 111 */
        await t.keys(KEY.CTRL_N);
        await t.keys(DOWN.repeat(110), 1800);
        await t.type('to the stars and beyond we shall travel');
        await t.keys(KEY.CTRL_S, 500);

        /* Pane 3 (bottom-right) → line 151 */
        await t.keys(KEY.CTRL_N);
        await t.keys(DOWN.repeat(150), 2000);
        await t.type('no test is too small for quality assurance');
        await t.keys(KEY.CTRL_S, 500);

        const content = readTempFile(file);
        assertPhraseOrder(content, [
          'the quick brown fox leaped over the moon',
          'the first astronaut on the moon was Neil Armstrong',
          'to the stars and beyond we shall travel',
          'no test is too small for quality assurance',
        ]);
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },
];
