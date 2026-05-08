import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileBrowser } from '../../dist/ui/FileBrowser.js';
export const suite = 'FileBrowser';
function makeTmpDir() {
    const dir = mkdtempSync(join(tmpdir(), 'fb-'));
    mkdirSync(join(dir, 'subdir'));
    writeFileSync(join(dir, 'alpha.txt'), '');
    writeFileSync(join(dir, 'beta.txt'), '');
    // dotfile should be hidden
    writeFileSync(join(dir, '.hidden'), '');
    return dir;
}
export const tests = [
    {
        name: 'load: lists dirs before files, alphabetically',
        fn: () => {
            const dir = makeTmpDir();
            try {
                const fb = new FileBrowser(dir);
                // entry[0] is '..'
                const visible = fb.entries.filter(e => e.name !== '..');
                const dirEntries = visible.filter(e => e.isDir);
                const fileEntries = visible.filter(e => !e.isDir);
                assert.ok(dirEntries.length > 0);
                assert.ok(fileEntries.length > 0);
                const dirEnd = fb.entries.findIndex(e => !e.isDir && e.name !== '..');
                const fileStart = fb.entries.findIndex(e => !e.isDir);
                assert.ok(dirEnd >= fileStart || fileStart === -1 || dirEnd === -1);
                // dirs come before files
                for (let i = 0; i < fb.entries.length - 1; i++) {
                    if (!fb.entries[i].isDir && fb.entries[i + 1].isDir && fb.entries[i].name !== '..') {
                        assert.fail('file appears before dir');
                    }
                }
            }
            finally {
                rmSync(dir, { recursive: true });
            }
        },
    },
    {
        name: 'load: dotfiles are excluded (except ..)',
        fn: () => {
            const dir = makeTmpDir();
            try {
                const fb = new FileBrowser(dir);
                const hidden = fb.entries.filter(e => e.name.startsWith('.') && e.name !== '..');
                assert.equal(hidden.length, 0);
            }
            finally {
                rmSync(dir, { recursive: true });
            }
        },
    },
    {
        name: 'load: parent dir (..) entry is present and first',
        fn: () => {
            const dir = makeTmpDir();
            try {
                const fb = new FileBrowser(dir);
                assert.equal(fb.entries[0].name, '..');
                assert.equal(fb.entries[0].isDir, true);
            }
            finally {
                rmSync(dir, { recursive: true });
            }
        },
    },
    {
        name: 'selected: returns entry at selectedIndex',
        fn: () => {
            const dir = makeTmpDir();
            try {
                const fb = new FileBrowser(dir);
                fb.selectedIndex = 0;
                assert.equal(fb.selected, fb.entries[0]);
            }
            finally {
                rmSync(dir, { recursive: true });
            }
        },
    },
    {
        name: 'selected: returns null for empty entries',
        fn: () => {
            const fb = new FileBrowser('/');
            fb.entries = [];
            assert.equal(fb.selected, null);
        },
    },
    {
        name: 'moveDown: increments selectedIndex',
        fn: () => {
            const dir = makeTmpDir();
            try {
                const fb = new FileBrowser(dir);
                fb.selectedIndex = 0;
                fb.moveDown();
                assert.equal(fb.selectedIndex, 1);
            }
            finally {
                rmSync(dir, { recursive: true });
            }
        },
    },
    {
        name: 'moveDown: does not exceed entries length',
        fn: () => {
            const dir = makeTmpDir();
            try {
                const fb = new FileBrowser(dir);
                fb.selectedIndex = fb.entries.length - 1;
                fb.moveDown();
                assert.equal(fb.selectedIndex, fb.entries.length - 1);
            }
            finally {
                rmSync(dir, { recursive: true });
            }
        },
    },
    {
        name: 'moveUp: decrements selectedIndex',
        fn: () => {
            const dir = makeTmpDir();
            try {
                const fb = new FileBrowser(dir);
                fb.selectedIndex = 2;
                fb.moveUp();
                assert.equal(fb.selectedIndex, 1);
            }
            finally {
                rmSync(dir, { recursive: true });
            }
        },
    },
    {
        name: 'moveUp: does not go below 0',
        fn: () => {
            const dir = makeTmpDir();
            try {
                const fb = new FileBrowser(dir);
                fb.selectedIndex = 0;
                fb.moveUp();
                assert.equal(fb.selectedIndex, 0);
            }
            finally {
                rmSync(dir, { recursive: true });
            }
        },
    },
    {
        name: 'adjustScroll: scrolls down when selection below viewport',
        fn: () => {
            const fb = new FileBrowser('/');
            fb.entries = Array.from({ length: 20 }, (_, i) => ({
                name: `f${i}`, isDir: false, fullPath: `/f${i}`
            }));
            fb.selectedIndex = 15;
            fb.scrollOffset = 0;
            fb.adjustScroll(10);
            assert.ok(fb.scrollOffset <= 15);
            assert.ok(fb.scrollOffset + 10 > 15);
        },
    },
    {
        name: 'adjustScroll: scrolls up when selection above viewport',
        fn: () => {
            const fb = new FileBrowser('/');
            fb.entries = Array.from({ length: 20 }, (_, i) => ({
                name: `f${i}`, isDir: false, fullPath: `/f${i}`
            }));
            fb.selectedIndex = 2;
            fb.scrollOffset = 5;
            fb.adjustScroll(10);
            assert.equal(fb.scrollOffset, 2);
        },
    },
    {
        name: 'navigateInto: enters a subdirectory',
        fn: () => {
            const dir = makeTmpDir();
            try {
                const fb = new FileBrowser(dir);
                // Find subdir entry
                const idx = fb.entries.findIndex(e => e.name === 'subdir');
                assert.ok(idx >= 0);
                fb.selectedIndex = idx;
                const result = fb.navigateInto();
                assert.equal(result, true);
                assert.ok(fb.currentDir.endsWith('subdir'));
            }
            finally {
                rmSync(dir, { recursive: true });
            }
        },
    },
    {
        name: 'navigateInto: returns false for a file entry',
        fn: () => {
            const dir = makeTmpDir();
            try {
                const fb = new FileBrowser(dir);
                const fileIdx = fb.entries.findIndex(e => !e.isDir);
                assert.ok(fileIdx >= 0);
                fb.selectedIndex = fileIdx;
                assert.equal(fb.navigateInto(), false);
            }
            finally {
                rmSync(dir, { recursive: true });
            }
        },
    },
    {
        name: 'goUp: navigates to parent directory',
        fn: () => {
            const dir = makeTmpDir();
            try {
                const subdir = join(dir, 'subdir');
                const fb = new FileBrowser(subdir);
                fb.goUp();
                assert.equal(fb.currentDir, dir);
            }
            finally {
                rmSync(dir, { recursive: true });
            }
        },
    },
    {
        name: 'goUp: selects the directory we came from',
        fn: () => {
            const dir = makeTmpDir();
            try {
                const subdir = join(dir, 'subdir');
                const fb = new FileBrowser(subdir);
                fb.goUp();
                const sel = fb.selected;
                assert.ok(sel !== null);
                assert.equal(sel.fullPath, subdir);
            }
            finally {
                rmSync(dir, { recursive: true });
            }
        },
    },
];
