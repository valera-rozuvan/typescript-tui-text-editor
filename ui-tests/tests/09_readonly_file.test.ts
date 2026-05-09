/*
 * 09_readonly_file — verify the editor handles read-only files correctly.
 *
 * Checks:
 *  - Opening a read-only file shows its content on screen
 *  - The status bar shows READONLY for a read-only file
 *  - The status bar does not show READONLY for a normal writable file
 */
import { chmodSync } from 'node:fs';
import type { TestCase } from './types.js';
import { EditorTest, createTempDir, createTempFile, removeTempDir } from './helpers.js';

export const suite = 'readonly_file';

export const tests: TestCase[] = [
  {
    name: 'content of a read-only file is visible in the editor',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest();
      try {
        const file = createTempFile(dir, 'ro_content.txt', 'readonly_unique_content_7z9\n');
        chmodSync(file, 0o444);
        await t.start([file]);
        t.assertContains('readonly_unique_content_7z9');
      } finally {
        t.cleanup();
        chmodSync(dir, 0o755);
        removeTempDir(dir);
      }
    },
  },

  {
    name: 'status bar shows READONLY for a read-only file',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest();
      try {
        const file = createTempFile(dir, 'ro_status.txt', 'some content\n');
        chmodSync(file, 0o444);
        await t.start([file]);
        t.assertStatusContains('READONLY');
      } finally {
        t.cleanup();
        chmodSync(dir, 0o755);
        removeTempDir(dir);
      }
    },
  },

  {
    name: 'status bar does not show READONLY for a normal writable file',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest();
      try {
        const file = createTempFile(dir, 'rw_file.txt', 'writable content\n');
        await t.start([file]);
        t.assertNotContains('READONLY');
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },
];
