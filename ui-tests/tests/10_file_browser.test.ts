/*
 * 10_file_browser — verify file browser mode status bar behaviour.
 *
 * Project layout (3 files in a temp directory):
 *   <dir>/alpha.ts
 *   <dir>/beta.ts
 *   <dir>/gamma.ts
 *
 * The editor is started with alpha.ts open and its cwd set to <dir> so
 * that the file browser's initial directory is the project temp directory.
 *
 * Checks:
 *  - Ctrl+B opens the file browser and shows BROWSE mode in the status bar
 *  - Status bar shows the current folder path (not file info) in browser mode
 *  - Status bar does not show cursor position in browser mode
 *  - Status bar does not show the open file's name in browser mode
 *  - Tab from the file browser switches focus to the editor pane (EDIT mode)
 *  - After Tab, status bar shows the file path
 *  - After Tab, status bar shows the cursor position
 *  - After Tab, status bar shows the language name
 */
import type { TestCase } from './types.js';
import {
  EditorTest, KEY,
  createTempDir, createTempFile, removeTempDir,
} from './helpers.js';

export const suite = 'file_browser';

function setup() {
  const dir = createTempDir();
  createTempFile(dir, 'alpha.ts', 'const a = 1;\n');
  createTempFile(dir, 'beta.ts', 'const b = 2;\n');
  createTempFile(dir, 'gamma.ts', 'const c = 3;\n');
  /* Use dir as cwd so FileBrowser starts in the project temp directory */
  const t = new EditorTest(120, 30, dir);
  const file = dir + '/alpha.ts';
  return { dir, t, file };
}

export const tests: TestCase[] = [
  {
    name: 'Ctrl+B opens file browser and shows BROWSE in status bar',
    async fn() {
      const { dir, t, file } = setup();
      try {
        await t.start([file]);
        await t.keys(KEY.CTRL_B);
        t.assertStatusContains('BROWSE');
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    name: 'status bar shows current folder path when file browser is open',
    async fn() {
      const { dir, t, file } = setup();
      try {
        await t.start([file]);
        await t.keys(KEY.CTRL_B);
        t.assertStatusContains(dir);
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    name: 'status bar does not show cursor position in file browser mode',
    async fn() {
      const { dir, t, file } = setup();
      try {
        await t.start([file]);
        await t.keys(KEY.CTRL_B);
        t.assertStatusNotContains('1:1');
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    name: 'status bar does not show the open file name in file browser mode',
    async fn() {
      const { dir, t, file } = setup();
      try {
        await t.start([file]);
        await t.keys(KEY.CTRL_B);
        t.assertStatusNotContains('alpha.ts');
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    name: 'Tab from file browser switches focus to the editor pane (EDIT mode)',
    async fn() {
      const { dir, t, file } = setup();
      try {
        await t.start([file]);
        await t.keys(KEY.CTRL_B);
        await t.keys(KEY.TAB);
        t.assertStatusContains('EDIT');
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    name: 'status bar shows the file path after Tab back from file browser',
    async fn() {
      const { dir, t, file } = setup();
      try {
        await t.start([file]);
        await t.keys(KEY.CTRL_B);
        await t.keys(KEY.TAB);
        t.assertStatusContains('alpha.ts');
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    name: 'status bar shows cursor position after Tab back from file browser',
    async fn() {
      const { dir, t, file } = setup();
      try {
        await t.start([file]);
        await t.keys(KEY.CTRL_B);
        await t.keys(KEY.TAB);
        t.assertStatusContains('1:1');
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    name: 'status bar shows language name after Tab back from file browser',
    async fn() {
      const { dir, t, file } = setup();
      try {
        await t.start([file]);
        await t.keys(KEY.CTRL_B);
        await t.keys(KEY.TAB);
        t.assertStatusContains('TypeScript');
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },
];
