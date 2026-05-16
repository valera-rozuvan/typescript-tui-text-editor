/*
 * 09_readonly_file — verify the editor handles read-only files correctly.
 *
 * Checks:
 *  - Opening a read-only file shows its content on screen
 *  - The status bar shows READONLY for a read-only file
 *  - The status bar does not show READONLY for a normal writable file
 */
import { chmodSync } from 'node:fs';
import { join } from 'node:path';
import type { TestCase } from './types.js';
import { EditorTest, copyFixtureToTemp, removeTempDir } from './helpers.js';

export const suite = 'readonly_file';

export const tests: TestCase[] = [
  {
    name: 'content of a read-only file is visible in the editor',
    async fn() {
      const dir = copyFixtureToTemp('09_readonly_file');
      const t = new EditorTest();
      try {
        const file = join(dir, 'ro_content.txt');
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
      const dir = copyFixtureToTemp('09_readonly_file');
      const t = new EditorTest();
      try {
        const file = join(dir, 'ro_status.txt');
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
      const dir = copyFixtureToTemp('09_readonly_file');
      const t = new EditorTest();
      try {
        const file = join(dir, 'rw_file.txt');
        await t.start([file]);
        t.assertNotContains('READONLY');
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },
];
