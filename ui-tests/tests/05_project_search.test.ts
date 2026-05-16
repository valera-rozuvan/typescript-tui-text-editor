/*
 * 05_project_search — verify Ctrl+P project search returns results sorted by
 * relevance score (most relevant first).
 *
 * Scenario:
 *   1. Copy the fixture directory (which contains a .git marker and 10 .txt
 *      files of original fantasy-style prose) to a temp location.
 *   2. ch01.txt line 1 starts with "rider" → fuzzy score ~80 (start bonus +
 *      consecutive-match bonus) — the highest possible for this needle.
 *   3. ch02–ch10.txt each contain "rider" somewhere mid-line → lower scores.
 *   4. Start the editor with cwd = tempDir (no file open), so process.cwd()
 *      resolves to tempDir and project search is scoped to tempDir.
 *   5. Open project search with Ctrl+P, type "rider".
 *   6. Assert that the first result slot on screen shows "ch01.txt:1",
 *      confirming the highest-scored match is sorted to the top.
 *
 * Row maths for H=30:
 *   panelY     = floor(30 * 0.15) = 4   (0-indexed)
 *   inputRow   = panelY + 2        = 6
 *   first result row (T.moveTo uses 1-indexed):
 *     T.moveTo(inputRow + 3 + 0 + 1, ...) = T.moveTo(10, ...) → screen row 9 (0-indexed)
 */
import assert from 'node:assert/strict';
import type { TestCase } from './types.js';
import {
  EditorTest, KEY,
  copyFixtureToTemp, removeTempDir,
} from './helpers.js';

export const suite = 'project_search';

export const tests: TestCase[] = [
  {
    name: 'Ctrl+P project search returns results sorted by score: ch01.txt:1 ("rider" at start of line) is first',
    async fn() {
      const dir = copyFixtureToTemp('05_project_search');
      try {
        /*
         * Start with cwd = dir so process.cwd() in the editor resolves to dir,
         * which makes findProjectRoot() return dir (the .git ancestor).
         * Project search is therefore scoped only to the 10 files above.
         */
        const t = new EditorTest(120, 30, dir);
        try {
          await t.start();
          t.assertLineContains(0, '[No File]');

          /* Open project search and type the needle. */
          await t.keys(KEY.CTRL_P, 400);   // open project-search panel
          await t.type('rider');             // needle = 'rider'
          await t.keys('', 500);            // extra idle to let async search complete

          /*
           * Verify that results are shown and that the top result is ch01.txt:1.
           *
           * Renderer places the first result at screen row 9 (0-indexed) for H=30:
           *   panelY   = floor(30 * 0.15) = 4
           *   inputRow = panelY + 2        = 6
           *   first result: T.moveTo(inputRow + 3 + 0 + 1) = T.moveTo(10) → row 9
           *
           * ch01.txt line 1 starts with "rider" → fuzzy score 80 (highest possible),
           * so it must be sorted first regardless of file-walk order.
           */
          t.assertLineContains(9, 'ch01.txt:1');

          /*
           * Also verify that at least one result from a different file appears
           * somewhere on screen below row 9, proving the list has multiple entries
           * and that ch01.txt:1 is genuinely first, not the only result.
           */
          const firstPos = t.screen.findText('ch01.txt:1');
          assert.ok(firstPos !== null, 'ch01.txt:1 must appear on screen');

          /* Find any result from another file (ch02–ch10). */
          let otherPos: { row: number; col: number } | null = null;
          for (let n = 2; n <= 10; n++) {
            const tag = `ch${String(n).padStart(2, '0')}.txt:`;
            otherPos = t.screen.findText(tag);
            if (otherPos !== null) break;
          }
          assert.ok(otherPos !== null, 'at least one result from ch02–ch10 must appear');
          assert.ok(
            firstPos!.row <= otherPos.row,
            `ch01.txt:1 (row ${firstPos!.row}) must appear before other results (row ${otherPos.row})`
          );

        } finally {
          t.cleanup();
        }
      } finally {
        removeTempDir(dir);
      }
    },
  },
];
