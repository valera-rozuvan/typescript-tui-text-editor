/*
 * 04_file_search — verify in-file search (Ctrl+F) across two open buffers.
 *
 * Scenario:
 *   1. Start the editor with no files open (clean state).
 *   2. Open file_a.txt via the file browser (Ctrl+B).
 *   3. Type 10 lines; line 3 contains the word "paper".
 *   4. Split layout (Alt+2), switch to pane 1 (Ctrl+N).
 *   5. Open file_b.txt via the file browser.
 *   6. Type 10 lines; line 4 contains the word "clown".
 *   7. Search for "paper" with Ctrl+F:
 *      - Assert the result panel shows file_a.txt:3.
 *      - Press Enter to jump; switch to pane 0 and assert status shows 3:.
 *   8. Search for "clown" with Ctrl+F:
 *      - Assert the result panel shows file_b.txt:4.
 *      - Press Enter to jump; switch to pane 1 and assert status shows 4:.
 *
 * File-browser entries in tempDir (dirs first, then files alphabetically):
 *   index 0 → ..
 *   index 1 → file_a.txt
 *   index 2 → file_b.txt
 *
 * The editor is started with cwd = tempDir so the file browser opens there,
 * making navigation predictable regardless of the project structure.
 *
 * Ctrl+F (in-file search) searches across all panes' buffers synchronously,
 * so results are available immediately after typing the needle.
 */
import type { TestCase } from './types.js';
import {
  EditorTest, KEY,
  createTempDir, createTempFile, removeTempDir,
} from './helpers.js';

export const suite = 'file_search';

/* 10-line content for each file, joined with Enter so typing is one batch. */
const FILE_A_LINES = [
  'A01 first line',
  'A02 second line',
  'A03 paper here',      // line 3 (1-indexed) — the search target
  'A04 fourth line',
  'A05 fifth line',
  'A06 sixth line',
  'A07 seventh line',
  'A08 eighth line',
  'A09 ninth line',
  'A10 tenth line',
].join(KEY.ENTER);

const FILE_B_LINES = [
  'B01 first line',
  'B02 second line',
  'B03 third line',
  'B04 clown here',      // line 4 (1-indexed) — the search target
  'B05 fifth line',
  'B06 sixth line',
  'B07 seventh line',
  'B08 eighth line',
  'B09 ninth line',
  'B10 tenth line',
].join(KEY.ENTER);

export const tests: TestCase[] = [
  {
    name: 'Ctrl+F finds "paper" in file_a at line 3 and jumps there, then finds "clown" in file_b at line 4 and jumps there',
    async fn() {
      const dir = createTempDir();
      /* Pre-create empty files so the file browser can list them. */
      createTempFile(dir, 'file_a.txt', '');
      createTempFile(dir, 'file_b.txt', '');
      /* cwd = dir so the editor's FileBrowser starts there. */
      const t = new EditorTest(120, 30, dir);
      try {
        /* ── 1. Start with no files open ───────────────────────────────── */
        await t.start();
        t.assertLineContains(0, '[No File]');

        /* ── 2. Open file_a.txt via file browser ───────────────────────── */
        /* File browser entries: [0: '..', 1: 'file_a.txt', 2: 'file_b.txt'] */
        await t.keys(KEY.CTRL_B);          // open browser → mode = filebrowser
        await t.keys(KEY.ARROW_DOWN);      // selectedIndex 0→1 (file_a.txt)
        await t.keys(KEY.ENTER, 400);      // open file_a.txt in pane 0 (async load)

        /* ── 3. Type 10 lines; "paper" on line 3 ──────────────────────── */
        await t.type(FILE_A_LINES);
        await t.keys(KEY.CTRL_S, 400);     // save
        await t.keys(KEY.ESCAPE);          // clear "Saved:" message from status bar

        /* ── 4. Close browser, split into 2 panes, switch to pane 1 ────── */
        /* After Enter the browser is still visible but unfocused; Ctrl+B closes it. */
        await t.keys(KEY.CTRL_B);          // close browser
        await t.keys(KEY.ALT_2);           // hsplit2: pane 0 = file_a, pane 1 = file_a clone
        await t.keys(KEY.CTRL_N);          // switch active pane: 0 → 1

        /* ── 5. Open file_b.txt in pane 1 via file browser ────────────── */
        /* Browser re-opens; selectedIndex is still 1 (file_a.txt). */
        await t.keys(KEY.CTRL_B);          // open browser → mode = filebrowser
        await t.keys(KEY.ARROW_DOWN);      // selectedIndex 1→2 (file_b.txt)
        await t.keys(KEY.ENTER, 400);      // open file_b.txt in pane 1 (async load)

        /* ── 6. Type 10 lines; "clown" on line 4 ──────────────────────── */
        await t.type(FILE_B_LINES);
        await t.keys(KEY.CTRL_S, 400);     // save
        await t.keys(KEY.ESCAPE);          // clear "Saved:" message from status bar

        /* Close browser so it doesn't overlap the search panel. */
        await t.keys(KEY.CTRL_B);          // close browser
        /* State: pane 0 = file_a.txt (paper on line 3), pane 1 = file_b.txt (clown on line 4).
           Active pane = 1. */

        /* ── 7. Search for "paper" ─────────────────────────────────────── */
        await t.keys(KEY.CTRL_F);          // open in-file search panel
        await t.type('paper');             // needle = 'paper'

        /* Result panel must show file_a.txt:3 (line 3, 1-indexed). */
        t.assertContains('file_a.txt:3');

        /* Jump to the first (and only) result. */
        await t.keys(KEY.ENTER);           // jump → pane 0 cursor moves to line 3
        /* _jumpToResult does NOT change the active pane; switch to pane 0 to verify. */
        await t.keys(KEY.CTRL_N);          // active: 1 → 0
        t.assertStatusContains('3:');      // status bar: line 3, col n of file_a.txt

        /* ── 8. Search for "clown" ─────────────────────────────────────── */
        await t.keys(KEY.CTRL_F);          // open in-file search (from pane 0)
        await t.type('clown');             // needle = 'clown'

        /* Result panel must show file_b.txt:4 (line 4, 1-indexed). */
        t.assertContains('file_b.txt:4');

        /* Jump to the first (and only) result. */
        await t.keys(KEY.ENTER);           // jump → pane 1 cursor moves to line 4
        /* Active pane is still 0; switch to pane 1 to verify. */
        await t.keys(KEY.CTRL_N);          // active: 0 → 1
        t.assertStatusContains('4:');      // status bar: line 4, col n of file_b.txt

      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },
];
