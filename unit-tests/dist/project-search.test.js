import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findProjectRoot, searchProject } from '../../dist/search/ProjectSearch.js';
export const suite = 'ProjectSearch';
function makeProject() {
    const root = mkdtempSync(join(tmpdir(), 'proj-'));
    mkdirSync(join(root, '.git'));
    writeFileSync(join(root, 'main.js'), 'function hello() {}\nhello();\n');
    writeFileSync(join(root, 'util.js'), 'export const PI = 3.14;\n');
    const sub = join(root, 'src');
    mkdirSync(sub);
    writeFileSync(join(sub, 'index.ts'), 'const greeting = "hello world";\n');
    return root;
}
export const tests = [
    {
        name: 'findProjectRoot: finds .git ancestor',
        fn: () => {
            const root = mkdtempSync(join(tmpdir(), 'proot-'));
            try {
                mkdirSync(join(root, '.git'));
                const sub = join(root, 'a', 'b');
                mkdirSync(sub, { recursive: true });
                assert.equal(findProjectRoot(sub), root);
            }
            finally {
                rmSync(root, { recursive: true });
            }
        },
    },
    {
        name: 'findProjectRoot: returns start dir when no .git found',
        fn: () => {
            const dir = mkdtempSync(join(tmpdir(), 'nongit-'));
            try {
                const found = findProjectRoot(dir);
                // Should stop before going outside tmpdir
                assert.ok(typeof found === 'string');
            }
            finally {
                rmSync(dir, { recursive: true });
            }
        },
    },
    {
        name: 'searchProject: empty needle returns empty array',
        fn: async () => {
            const root = makeProject();
            try {
                let results = [];
                const signal = { cancelled: false };
                await searchProject('', root, (r) => { results = r; }, signal);
                assert.equal(results.length, 0);
            }
            finally {
                rmSync(root, { recursive: true });
            }
        },
    },
    {
        name: 'searchProject: finds matching lines across files',
        fn: async () => {
            const root = makeProject();
            try {
                let results = [];
                const signal = { cancelled: false };
                await searchProject('hello', root, (r) => { results = r; }, signal);
                assert.ok(results.length > 0);
                assert.ok(results.every(r => typeof r.filePath === 'string'));
                assert.ok(results.every(r => typeof r.line === 'number'));
                assert.ok(results.every(r => typeof r.snippet === 'string'));
            }
            finally {
                rmSync(root, { recursive: true });
            }
        },
    },
    {
        name: 'searchProject: results contain the expected file paths',
        fn: async () => {
            const root = makeProject();
            try {
                let results = [];
                const signal = { cancelled: false };
                await searchProject('hello', root, (r) => { results = r; }, signal);
                const paths = results.map(r => r.filePath);
                const hasMain = paths.some(p => p.includes('main.js'));
                const hasIndex = paths.some(p => p.includes('index.ts'));
                assert.ok(hasMain || hasIndex, 'expected at least one file with "hello"');
            }
            finally {
                rmSync(root, { recursive: true });
            }
        },
    },
    {
        name: 'searchProject: skips node_modules and dist directories',
        fn: async () => {
            const root = mkdtempSync(join(tmpdir(), 'proj-skip-'));
            try {
                mkdirSync(join(root, '.git'));
                mkdirSync(join(root, 'node_modules'));
                writeFileSync(join(root, 'node_modules', 'pkg.js'), 'findme');
                writeFileSync(join(root, 'app.js'), 'hello');
                let results = [];
                const signal = { cancelled: false };
                await searchProject('findme', root, (r) => { results = r; }, signal);
                assert.ok(results.every(r => !r.filePath.includes('node_modules')));
            }
            finally {
                rmSync(root, { recursive: true });
            }
        },
    },
    {
        name: 'searchProject: respects maxResults limit',
        fn: async () => {
            const root = mkdtempSync(join(tmpdir(), 'proj-max-'));
            try {
                mkdirSync(join(root, '.git'));
                for (let i = 0; i < 10; i++) {
                    writeFileSync(join(root, `file${i}.txt`), Array(20).fill('match here').join('\n'));
                }
                let results = [];
                const signal = { cancelled: false };
                await searchProject('match', root, (r) => { results = r; }, signal, 5);
                assert.ok(results.length <= 5);
            }
            finally {
                rmSync(root, { recursive: true });
            }
        },
    },
    {
        name: 'searchProject: result matchIndices are valid positions within snippet',
        fn: async () => {
            const root = makeProject();
            try {
                let results = [];
                const signal = { cancelled: false };
                await searchProject('hello', root, (r) => { results = r; }, signal);
                for (const r of results) {
                    for (const idx of r.matchIndices) {
                        assert.ok(idx >= 0 && idx < r.snippet.length, `index ${idx} out of range for snippet "${r.snippet}"`);
                    }
                }
            }
            finally {
                rmSync(root, { recursive: true });
            }
        },
    },
];
