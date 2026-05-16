/*
 * 14_undo_history — verify checkpoint-based undo history panel behaviour.
 *
 * Fixture: ui-tests/fixtures/14_undo_history/
 *   sample.txt  — single line "Hello World"
 *   dot_git/    — copied as .git/ (project-root stub)
 *
 * Setup:
 *   The editor opens sample.txt.  fromFile() materialises the small file and
 *   creates checkpoint #1 (the initial "Hello World" state).
 *
 * Test flow:
 *   1. Type 'a', wait 500 ms.
 *   2. Type 'b', wait 500 ms.
 *   3. Type 'c', wait 500 ms.
 *      After 'c' the idle timer (UNDO_CHECKPOINT_MS = 3000 ms) is running.
 *   4. Wait 4000 ms — the timer fires, creating checkpoint #2 ("abcHello World").
 *   5. Press Ctrl+U — undo panel opens; two checkpoints are visible.
 *   6. Assert:
 *        - "Undo History" title is on screen
 *        - Status bar shows "UNDO HISTORY" hint
 *        - Both checkpoint IDs (#1, #2) are listed
 *   7. Navigate:
 *        - ARROW_DOWN  → move to older checkpoint #1
 *        - ARROW_UP    → move back to newer checkpoint #2
 *        - ARROW_DOWN  → land on initial checkpoint #1
 *   8. Press ENTER — revert buffer to checkpoint #1.
 *   9. Assert:
 *        - "Undo History" panel is gone
 *        - Status bar shows "EDIT" mode
 *        - "abc" is not on screen (typed characters are gone)
 *        - "Hello World" is on screen (original content is restored)
 */
import type { TestCase } from './types.js';
import { join } from 'node:path';
import {
  EditorTest, KEY,
  copyFixtureToTemp, removeTempDir,
} from './helpers.js';

export const suite = 'undo_history';

export const tests: TestCase[] = [
  {
    name: 'typing abc then reverting to initial checkpoint restores original content',
    async fn() {
      const dir = copyFixtureToTemp('14_undo_history');
      const t = new EditorTest(120, 30, dir);
      try {
        const file = join(dir, 'sample.txt');
        await t.start([file]);

        // Initial content must be visible before any edits.
        t.assertContains('Hello World');

        // Type 'a', 'b', 'c' with 500 ms between each keystroke.
        // Each keystroke resets the 3000 ms idle undo timer.
        await t.keys('a', 500);
        await t.keys('b', 500);
        await t.keys('c', 500);

        // Typed characters should now be on screen.
        t.assertContains('abc');

        // Wait 4000 ms so the idle timer (3000 ms) fires and creates checkpoint #2.
        await new Promise<void>(resolve => setTimeout(resolve, 4000));

        // Open the undo history panel (Ctrl+U).
        await t.keys(KEY.CTRL_U);

        // Panel title and status bar hint must be visible.
        t.assertContains('Undo History');
        t.assertStatusContains('UNDO HISTORY');

        // Both checkpoint IDs must be listed in the panel.
        t.assertContains('#1');
        t.assertContains('#2');

        // Navigate: panel opens with newest selected (#2, abc state).
        // ARROW_DOWN → move toward older → checkpoint #1 (initial)
        await t.keys(KEY.ARROW_DOWN);
        // ARROW_UP   → move toward newer → back to checkpoint #2
        await t.keys(KEY.ARROW_UP);
        // ARROW_DOWN → move toward older → checkpoint #1 again
        await t.keys(KEY.ARROW_DOWN);

        // Revert to the currently selected checkpoint (#1 = original content).
        await t.keys(KEY.ENTER);

        // Panel must be closed after revert.
        t.assertNotContains('Undo History');

        // Editor must be back in normal edit mode.
        t.assertStatusContains('EDIT');

        // Typed characters must be gone after the revert.
        t.assertNotContains('abc');

        // Original file content must be restored on screen.
        t.assertContains('Hello World');
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },
];
