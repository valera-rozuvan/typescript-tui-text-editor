import { EditorTest, KEY, createTempDir, createTempFile, removeTempDir } from './helpers.js';
export const suite = 'startup';
export const tests = [
    {
        name: 'shows [No File] in the title bar when no file is given',
        async fn() {
            const t = new EditorTest();
            try {
                await t.start();
                t.assertLineContains(0, '[No File]');
            }
            finally {
                t.cleanup();
            }
        },
    },
    {
        name: 'status bar shows EDIT mode on startup',
        async fn() {
            const t = new EditorTest();
            try {
                await t.start();
                t.assertStatusContains('EDIT');
            }
            finally {
                t.cleanup();
            }
        },
    },
    {
        name: 'status bar shows [No File] when no file is open',
        async fn() {
            const t = new EditorTest();
            try {
                await t.start();
                t.assertStatusContains('[No File]');
            }
            finally {
                t.cleanup();
            }
        },
    },
    {
        name: 'empty buffer rows display a tilde (~)',
        async fn() {
            const t = new EditorTest();
            try {
                await t.start();
                /* Row 1 is the first content row (row 0 is the pane title bar).
                   With an empty buffer every content row starts with ~ in the gutter. */
                t.assertContains('~');
            }
            finally {
                t.cleanup();
            }
        },
    },
    {
        name: 'opening a file shows its name in the title bar',
        async fn() {
            const dir = createTempDir();
            const t = new EditorTest();
            try {
                const file = createTempFile(dir, 'hello.txt', 'greeting\n');
                await t.start([file]);
                t.assertLineContains(0, 'hello.txt');
            }
            finally {
                t.cleanup();
                removeTempDir(dir);
            }
        },
    },
    {
        name: 'opening a file shows its content on screen',
        async fn() {
            const dir = createTempDir();
            const t = new EditorTest();
            try {
                const file = createTempFile(dir, 'content.txt', 'unique_file_content_7x3\n');
                await t.start([file]);
                t.assertContains('unique_file_content_7x3');
            }
            finally {
                t.cleanup();
                removeTempDir(dir);
            }
        },
    },
    {
        name: 'file name appears in the status bar after opening',
        async fn() {
            const dir = createTempDir();
            const t = new EditorTest();
            try {
                const file = createTempFile(dir, 'status_check.txt', 'data\n');
                await t.start([file]);
                t.assertStatusContains('status_check.txt');
            }
            finally {
                t.cleanup();
                removeTempDir(dir);
            }
        },
    },
    {
        name: 'status bar shows cursor position 1:1 after opening a file',
        async fn() {
            const dir = createTempDir();
            const t = new EditorTest();
            try {
                const file = createTempFile(dir, 'pos.txt', 'abc\n');
                await t.start([file]);
                /* Cursor starts at line 0, col 0 → displayed as 1:1 */
                t.assertStatusContains('1:1');
            }
            finally {
                t.cleanup();
                removeTempDir(dir);
            }
        },
    },
    {
        name: 'Ctrl+Q quits the editor cleanly',
        async fn() {
            const t = new EditorTest();
            await t.start();
            /* Send quit — editor calls process.exit(0) on CTRL_Q */
            await t.keys(KEY.CTRL_Q, 400);
            /* cleanup() uses SIGKILL + waitpid; if the editor already exited the
               kill call silently fails (no-op), and waitpid returns immediately */
            t.cleanup();
        },
    },
];
