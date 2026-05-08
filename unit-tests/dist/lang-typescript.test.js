import assert from 'node:assert/strict';
import { tsTokenizer } from '../../dist/highlight/languages/typescript.js';
import { defaultState } from '../../dist/highlight/tokens.js';
export const suite = 'Language: TypeScript';
function tok(line, state = defaultState()) {
    return tsTokenizer.tokenizeLine(line, state).tokens;
}
function find(tokens, type) {
    return tokens.filter(t => t.type === type);
}
function textOf(line, token) {
    return line.slice(token.start, token.start + token.length);
}
export const tests = [
    {
        name: 'TS keywords: interface, type, enum are keywords',
        fn: () => {
            for (const kw of ['interface', 'type', 'enum']) {
                const line = `${kw} Foo {}`;
                const t = tok(line);
                const kws = find(t, 'keyword');
                assert.ok(kws.some(k => textOf(line, k) === kw), `${kw} not keyword`);
            }
        },
    },
    {
        name: 'TS keywords: abstract, readonly, implements, declare',
        fn: () => {
            for (const kw of ['abstract', 'readonly', 'implements', 'declare']) {
                const line = `${kw} foo`;
                const t = tok(line);
                assert.ok(find(t, 'keyword').some(k => textOf(line, k) === kw), `${kw} missing`);
            }
        },
    },
    {
        name: 'TS keywords: namespace, module',
        fn: () => {
            for (const kw of ['namespace', 'module']) {
                const line = `${kw} Foo {}`;
                const t = tok(line);
                assert.ok(find(t, 'keyword').some(k => textOf(line, k) === kw));
            }
        },
    },
    {
        name: 'JS keywords still work (const, let, function)',
        fn: () => {
            const t = tok('const x = 1;');
            assert.ok(find(t, 'keyword').length > 0);
        },
    },
    {
        name: 'PascalCase identifier is classified as type',
        fn: () => {
            const line = 'const x: MyType = {};';
            const t = tok(line);
            assert.ok(find(t, 'type').length > 0);
        },
    },
    {
        name: 'string literals tokenized correctly',
        fn: () => {
            const t = tok('const s = "hello";');
            assert.ok(find(t, 'string').length > 0);
        },
    },
    {
        name: 'block comment state carries through unchanged',
        fn: () => {
            const open = tsTokenizer.tokenizeLine('/* open', defaultState());
            assert.equal(open.nextState.inBlockComment, true);
            const cont = tsTokenizer.tokenizeLine('still comment */', open.nextState);
            assert.equal(cont.nextState.inBlockComment, false);
        },
    },
    {
        name: 'number literals tokenized correctly',
        fn: () => {
            const t = tok('const n = 42;');
            assert.ok(find(t, 'number').length > 0);
        },
    },
    {
        name: 'function calls tokenized as function',
        fn: () => {
            const t = tok('doSomething()');
            assert.ok(find(t, 'function').length > 0);
        },
    },
];
