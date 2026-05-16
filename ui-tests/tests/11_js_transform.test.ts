/*
 * 11_js_transform — verify JS transform modal behaviour.
 *
 * Setup: a temp file with 10 lines is opened in the editor.
 *
 * Test 1 — open modal, verify default content, cancel without running:
 *   1. Start the editor with the 10-line file.
 *   2. Press Alt+J — JS transform modal opens.
 *   3. Assert the modal title "JS Transform" is visible.
 *   4. Assert the default transformer function signature and body are shown:
 *        function transform(line, lineNumber) {
 *          return line;
 *        }
 *   5. Assert the hint footer shows "Alt+J: Run & Close" and "Alt+C: Cancel".
 *   6. Press Alt+C — modal closes.
 *   7. Assert "JS Transform" is no longer on screen.
 *   8. Assert status bar shows "EDIT" mode (not "JS").
 *   9. Assert status bar does NOT show "MODIFIED".
 *  10. Assert all 10 original lines are still visible and unchanged.
 *
 * Test 2 — run the default transformer and confirm byte-for-byte file identity:
 *   File uses 10 lines with varied whitespace (leading spaces, trailing spaces,
 *   mixed) so the comparison catches any accidental stripping or mutation.
 *   1. Start the editor with the 10-line file.
 *   2. Press Alt+J — modal opens.
 *   3. Press Alt+J again inside the modal — transform runs with the default
 *      identity function, modal closes, "JS transform applied" message shown.
 *   4. Press Ctrl+S to save the file (wait for async write).
 *   5. Press Escape to clear the status message.
 *   6. Assert status bar shows "EDIT" and no "MODIFIED".
 *   7. Assert every original line is still visible on screen.
 *   8. Read the file from disk and assert it is byte-for-byte equal to the
 *      original content — covering line text, leading/trailing spacing per
 *      line, and the trailing newline that ends the file.
 *
 * Test 3 — edit the function in the modal, run, verify every line is prefixed:
 *   The modal opens with the cursor at the end of "  return line;".
 *   Five ARROW_LEFT presses move the cursor to just before "line", then
 *   typing "'//' + " turns the body into: return '//' + line;
 *   1. Start the editor with the 10-line file.
 *   2. Press Alt+J — modal opens.
 *   3. Press ARROW_LEFT five times to position the cursor before "line".
 *   4. Type "'//' + " to produce: return '//' + line;
 *   5. Press Alt+J — transform runs, modal closes.
 *   6. Assert "JS transform applied" message is shown.
 *   7. Press Ctrl+S to save, then Escape to clear the message.
 *   8. Assert every line on screen now starts with "//".
 *   9. Read the file from disk and assert every line is "//" + original line.
 */
import type { TestCase } from './types.js';
import { join } from 'node:path';
import {
  EditorTest, KEY,
  copyFixtureToTemp, readTempFile, removeTempDir,
} from './helpers.js';

export const suite = 'js_transform';

const LINES = [
  'Line 01',
  'Line 02',
  'Line 03',
  'Line 04',
  'Line 05',
  'Line 06',
  'Line 07',
  'Line 08',
  'Line 09',
  'Line 10',
];

const FILE_CONTENT = LINES.join('\n') + '\n';

/*
 * Lines for test 2 — intentional leading and trailing spaces on several lines
 * so that a transform which accidentally strips whitespace would be caught by
 * the disk comparison.
 */
const LINES2 = [
  '  leading spaces',
  'trailing spaces  ',
  '    four leading spaces',
  'no extra spaces here',
  '  both ends  ',
  'middle content',
  '   three leading',
  'ends with one space ',
  'plain line nine',
  'plain line ten',
];

const FILE2_CONTENT = LINES2.join('\n') + '\n';

export const tests: TestCase[] = [
  {
    name: 'Alt+J opens JS transform modal with default function; Alt+C closes it without modifying the file',
    async fn() {
      const dir = copyFixtureToTemp('11_js_transform');
      const file = join(dir, 'test.txt');
      const t = new EditorTest(120, 30, dir);
      try {
        await t.start([file]);

        /* All 10 lines must be visible before we touch anything. */
        for (const line of LINES) {
          t.assertContains(line);
        }

        /* ── open the modal ──────────────────────────────────────────────── */
        await t.keys(KEY.ALT_J);

        /* Title row */
        t.assertContains('JS Transform');

        /* Default transformer — signature, body, closing brace */
        t.assertContains('function transform(line, lineNumber)');
        t.assertContains('return line;');

        /* Hint footer */
        t.assertContains('Alt+J: Run & Close');
        t.assertContains('Alt+C: Cancel');

        /* ── cancel without running ──────────────────────────────────────── */
        await t.keys(KEY.ALT_C);

        /* Modal must be gone */
        t.assertNotContains('JS Transform');

        /* Back in normal edit mode */
        t.assertStatusContains('EDIT');

        /* Buffer must be unmodified — no MODIFIED indicator */
        t.assertStatusNotContains('MODIFIED');

        /* Every original line still intact */
        for (const line of LINES) {
          t.assertContains(line);
        }
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    name: 'running the default transformer leaves every line unchanged, including leading/trailing spaces and line endings',
    async fn() {
      const dir = copyFixtureToTemp('11_js_transform');
      const file = join(dir, 'test2.txt');
      const t = new EditorTest(120, 30, dir);
      try {
        await t.start([file]);

        /* Confirm all lines are visible before doing anything. */
        for (const line of LINES2) {
          t.assertContains(line.trim()); /* trim for screen search — gutter may abut spaces */
        }

        /* ── open modal, run default transform ───────────────────────────── */
        await t.keys(KEY.ALT_J);        // open modal
        await t.keys(KEY.ALT_J);        // run default transform; modal closes

        /* Editor shows a confirmation message. */
        t.assertContains('JS transform applied');

        /* ── save to disk ────────────────────────────────────────────────── */
        await t.keys(KEY.CTRL_S, 400);  // save (wait for async write)
        await t.keys(KEY.ESCAPE);       // clear "Saved:" message

        /* Status bar: back in EDIT mode, no MODIFIED indicator. */
        t.assertStatusContains('EDIT');
        t.assertStatusNotContains('MODIFIED');

        /* ── verify on-screen content ────────────────────────────────────── */
        for (const line of LINES2) {
          t.assertContains(line.trim());
        }

        /* ── verify disk content byte-for-byte ───────────────────────────── */
        const saved = readTempFile(file);
        if (saved !== FILE2_CONTENT) {
          const origLines = FILE2_CONTENT.split('\n');
          const savedLines = saved.split('\n');
          const diffs: string[] = [];
          const maxLen = Math.max(origLines.length, savedLines.length);
          for (let i = 0; i < maxLen; i++) {
            if (origLines[i] !== savedLines[i]) {
              diffs.push(
                `line ${i + 1}: expected ${JSON.stringify(origLines[i])} ` +
                `got ${JSON.stringify(savedLines[i])}`
              );
            }
          }
          throw new Error(
            'File content changed after identity transform:\n' + diffs.join('\n')
          );
        }
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    name: 'editing the function to prepend "//" transforms every line in the file',
    async fn() {
      const dir = copyFixtureToTemp('11_js_transform');
      const file = join(dir, 'test3.txt');
      const t = new EditorTest(120, 30, dir);
      try {
        await t.start([file]);

        /* ── open modal ──────────────────────────────────────────────────── */
        await t.keys(KEY.ALT_J);

        /* The cursor starts at end of "  return line;" (col 14).
         * Move 5 positions left to land just before "line". */
        await t.keys(KEY.ARROW_LEFT.repeat(5));

        /* Insert the prefix expression — body becomes: return '//' + line; */
        await t.type("'//' + ");

        /* ── run the transform ───────────────────────────────────────────── */
        await t.keys(KEY.ALT_J);

        t.assertContains('JS transform applied');

        /* ── save ────────────────────────────────────────────────────────── */
        await t.keys(KEY.CTRL_S, 400);
        await t.keys(KEY.ESCAPE);

        t.assertStatusContains('EDIT');
        t.assertStatusNotContains('MODIFIED');

        /* ── on-screen: every line now starts with "//" ───────────────────── */
        for (const line of LINES) {
          t.assertContains('//' + line);
        }

        /* ── disk: byte-for-byte match against expected prefixed content ───── */
        const saved = readTempFile(file);
        const expected = LINES.map(l => '//' + l).join('\n') + '\n';
        if (saved !== expected) {
          const expLines = expected.split('\n');
          const savedLines = saved.split('\n');
          const diffs: string[] = [];
          const maxLen = Math.max(expLines.length, savedLines.length);
          for (let i = 0; i < maxLen; i++) {
            if (expLines[i] !== savedLines[i]) {
              diffs.push(
                `line ${i + 1}: expected ${JSON.stringify(expLines[i])} ` +
                `got ${JSON.stringify(savedLines[i])}`
              );
            }
          }
          throw new Error(
            'File content after "//" prefix transform is wrong:\n' + diffs.join('\n')
          );
        }
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },
];
