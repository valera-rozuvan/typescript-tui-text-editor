import assert from 'node:assert/strict';
import { mdTokenizer } from '../../dist/highlight/languages/markdown.js';
import { defaultState } from '../../dist/highlight/tokens.js';
export const suite = 'Language: Markdown';
function tok(line, state = defaultState()) {
    return mdTokenizer.tokenizeLine(line, state).tokens;
}
function next(line, state = defaultState()) {
    return mdTokenizer.tokenizeLine(line, state).nextState;
}
function find(tokens, type) {
    return tokens.filter(t => t.type === type);
}
export const tests = [
    {
        name: 'ATX heading: # through ###### is heading',
        fn: () => {
            for (const prefix of ['# ', '## ', '### ', '#### ', '##### ', '###### ']) {
                const line = `${prefix}Title`;
                const t = tok(line);
                assert.ok(t.length === 1 && t[0].type === 'heading', `${prefix} should be heading`);
                assert.equal(t[0].length, line.length);
            }
        },
    },
    {
        name: 'setext heading: === underline is heading',
        fn: () => {
            const t = tok('=====');
            assert.equal(t[0].type, 'heading');
        },
    },
    {
        name: 'setext heading: --- underline is heading',
        fn: () => {
            const t = tok('-----');
            assert.equal(t[0].type, 'heading');
        },
    },
    {
        name: 'code fence: ``` toggles inMultiLineString',
        fn: () => {
            const s0 = defaultState();
            const s1 = next('```js', s0);
            assert.equal(s1.inMultiLineString, true);
            const s2 = next('```', s1);
            assert.equal(s2.inMultiLineString, false);
        },
    },
    {
        name: 'code fence: ~~~ works as well',
        fn: () => {
            const s = next('~~~', defaultState());
            assert.equal(s.inMultiLineString, true);
        },
    },
    {
        name: 'inside code block: line is tokenized as code',
        fn: () => {
            const openState = next('```', defaultState());
            const t = tok('const x = 1;', openState);
            assert.ok(t.every(tk => tk.type === 'code'));
        },
    },
    {
        name: 'inline code: `code` span is code',
        fn: () => {
            const t = tok('Use `npm install` to install.');
            assert.ok(find(t, 'code').length > 0);
        },
    },
    {
        name: 'inline code: double backtick ``code``',
        fn: () => {
            const t = tok('Use ``npm`` here.');
            assert.ok(find(t, 'code').length > 0);
        },
    },
    {
        name: 'bold: **text** is strong',
        fn: () => {
            const t = tok('This is **bold** text.');
            assert.ok(find(t, 'strong').length > 0);
        },
    },
    {
        name: 'bold: __text__ is strong',
        fn: () => {
            const t = tok('This is __bold__ text.');
            assert.ok(find(t, 'strong').length > 0);
        },
    },
    {
        name: 'italic: *text* is emphasis',
        fn: () => {
            const t = tok('This is *italic* text.');
            assert.ok(find(t, 'emphasis').length > 0);
        },
    },
    {
        name: 'italic: _text_ is emphasis',
        fn: () => {
            const t = tok('This is _italic_ text.');
            assert.ok(find(t, 'emphasis').length > 0);
        },
    },
    {
        name: 'bold+italic: ***text*** is strong',
        fn: () => {
            const t = tok('***bold-italic***');
            assert.ok(find(t, 'strong').length > 0);
        },
    },
    {
        name: 'link: [text](url) is link',
        fn: () => {
            const t = tok('Visit [GitHub](https://github.com) now.');
            assert.ok(find(t, 'link').length > 0);
        },
    },
    {
        name: 'blockquote: > prefix is comment, rest is tokenized',
        fn: () => {
            const t = tok('> some quoted text');
            assert.ok(find(t, 'comment').length > 0);
        },
    },
    {
        name: 'horizontal rule: --- matches setext heading pattern first (classified as heading)',
        fn: () => {
            // /^[-]{2,}\s*$/ (setext underline) is checked before the horizontal-rule
            // regex, so bare '---' is heading. Use spaced '- - -' for operator.
            const t = tok('---');
            assert.ok(find(t, 'heading').length > 0);
        },
    },
    {
        name: 'horizontal rule: - - - (spaced dashes) is operator',
        fn: () => {
            const t = tok('- - -');
            assert.ok(find(t, 'operator').length > 0);
        },
    },
    {
        name: 'horizontal rule: * * * is operator',
        fn: () => {
            const t = tok('* * *');
            assert.ok(find(t, 'operator').length > 0);
        },
    },
    {
        name: 'plain text: normal characters produce normal tokens',
        fn: () => {
            const t = tok('Just plain text here.');
            assert.ok(t.length > 0);
            assert.ok(t.every(tk => tk.type === 'normal'));
        },
    },
];
