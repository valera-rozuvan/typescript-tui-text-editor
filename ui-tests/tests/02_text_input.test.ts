/*
 * 02_text_input — verify text editing, saving, and cursor-position reporting.
 *
 * Checks:
 *  - Typing characters inserts them on screen
 *  - The status bar tracks the cursor position accurately
 *  - Ctrl+S saves the buffer to disk; the file content matches what was typed
 *  - Backspace removes the last character
 *  - Enter splits lines and the second line is visible
 *  - The modified indicator (●) appears after editing an unmodified buffer
 */
import type { TestCase } from './types.js';
import {
  EditorTest, KEY,
  createTempDir, createTempFile, readTempFile, removeTempDir,
} from './helpers.js';

export const suite = 'text_input';

export const tests: TestCase[] = [
  {
    name: 'typing characters shows them on screen',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest();
      try {
        const file = createTempFile(dir, 'input.txt', '');
        await t.start([file]);
        await t.type('HelloWorld');
        t.assertContains('HelloWorld');
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    name: 'status bar shows correct column after typing',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest();
      try {
        const file = createTempFile(dir, 'cursor.txt', '');
        await t.start([file]);
        /* Type 5 characters; cursor moves to col 5 (0-indexed) → displayed as 1:6 */
        await t.type('ABCDE');
        t.assertStatusContains('1:6');
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    name: 'Ctrl+S saves the buffer and shows a Saved message',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest();
      try {
        const file = createTempFile(dir, 'save_me.txt', '');
        await t.start([file]);
        await t.type('SavedContent99');
        /* Give the async save time to complete and trigger the re-render */
        await t.keys(KEY.CTRL_S, 400);
        t.assertContains('Saved:');
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    name: 'saved file contains exactly what was typed',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest();
      try {
        const file = createTempFile(dir, 'verify.txt', '');
        await t.start([file]);
        await t.type('FileContent42');
        await t.keys(KEY.CTRL_S, 500);
        /* Buffer.save() appends a trailing newline */
        const content = readTempFile(file);
        if (!content.startsWith('FileContent42')) {
          throw new Error(
            `File content mismatch.\nExpected to start with "FileContent42"\nGot: ${JSON.stringify(content)}`
          );
        }
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    name: 'typing into an existing file shows its content merged with new input',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest();
      try {
        const file = createTempFile(dir, 'existing.txt', 'original');
        await t.start([file]);
        /* File loads with cursor at col 0 of line 0.
           Move to end of line then append. */
        await t.keys(KEY.ARROW_RIGHT + KEY.ARROW_RIGHT + KEY.ARROW_RIGHT +
                     KEY.ARROW_RIGHT + KEY.ARROW_RIGHT + KEY.ARROW_RIGHT +
                     KEY.ARROW_RIGHT + KEY.ARROW_RIGHT); /* move 8 cols right */
        await t.type('_appended');
        t.assertContains('original_appended');
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    name: 'backspace deletes the last typed character',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest();
      try {
        const file = createTempFile(dir, 'backspace.txt', '');
        await t.start([file]);
        await t.type('TypeThenDelete');
        await t.keys(KEY.BACKSPACE + KEY.BACKSPACE + KEY.BACKSPACE); /* delete last 3 */
        /* 'TypeThenDelete' minus last 3 = 'TypeThenDel' */
        t.assertContains('TypeThenDel');
        t.assertNotContains('TypeThenDelete');
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    name: 'Enter inserts a new line and moves cursor to it',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest();
      try {
        const file = createTempFile(dir, 'newline.txt', '');
        await t.start([file]);
        await t.type('Line1');
        await t.keys(KEY.ENTER);
        await t.type('Line2');
        t.assertContains('Line1');
        t.assertContains('Line2');
        /* Status bar should show line 2 after pressing Enter */
        t.assertStatusContains('2:');
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    name: 'modified indicator appears after editing',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest();
      try {
        const file = createTempFile(dir, 'mod.txt', 'clean');
        await t.start([file]);
        await t.type('x');
        /* The ● modified indicator should appear in the title bar */
        t.assertContains('●');
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    name: 'modified indicator disappears after saving',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest();
      try {
        const file = createTempFile(dir, 'clean_save.txt', '');
        await t.start([file]);
        await t.type('dirty');
        t.assertContains('●');
        await t.keys(KEY.CTRL_S, 500);
        t.assertNotContains('●');
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },
];
