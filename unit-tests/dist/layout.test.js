import assert from 'node:assert/strict';
import { Layout } from '../../dist/ui/Layout.js';
export const suite = 'Layout';
export const tests = [
    {
        name: 'initial state: single mode, one pane, active index 0',
        fn: () => {
            const l = new Layout();
            assert.equal(l.mode, 'single');
            assert.equal(l.panes.length, 1);
            assert.equal(l.activePaneIndex, 0);
            assert.equal(l.browserVisible, false);
        },
    },
    {
        name: 'setMode single: keeps one pane',
        fn: () => {
            const l = new Layout();
            l.setMode('single');
            assert.equal(l.panes.length, 1);
        },
    },
    {
        name: 'setMode hsplit2: gives two panes',
        fn: () => {
            const l = new Layout();
            l.setMode('hsplit2');
            assert.equal(l.panes.length, 2);
            assert.equal(l.mode, 'hsplit2');
        },
    },
    {
        name: 'setMode vsplit2: gives two panes',
        fn: () => {
            const l = new Layout();
            l.setMode('vsplit2');
            assert.equal(l.panes.length, 2);
        },
    },
    {
        name: 'setMode quad: gives four panes',
        fn: () => {
            const l = new Layout();
            l.setMode('quad');
            assert.equal(l.panes.length, 4);
        },
    },
    {
        name: 'setMode: existing panes are preserved',
        fn: () => {
            const l = new Layout();
            l.setMode('hsplit2');
            const p0 = l.panes[0];
            const p1 = l.panes[1];
            l.setMode('quad');
            assert.equal(l.panes[0], p0);
            assert.equal(l.panes[1], p1);
        },
    },
    {
        name: 'setMode: activePaneIndex clamped when reducing pane count',
        fn: () => {
            const l = new Layout();
            l.setMode('quad');
            l.activePaneIndex = 3;
            l.setMode('hsplit2');
            assert.equal(l.activePaneIndex, 1);
        },
    },
    {
        name: 'activePane returns the pane at activePaneIndex',
        fn: () => {
            const l = new Layout();
            l.setMode('hsplit2');
            l.activePaneIndex = 1;
            assert.equal(l.activePane, l.panes[1]);
        },
    },
    {
        name: 'nextPane: cycles activePaneIndex forward',
        fn: () => {
            const l = new Layout();
            l.setMode('hsplit2');
            assert.equal(l.activePaneIndex, 0);
            l.nextPane();
            assert.equal(l.activePaneIndex, 1);
            l.nextPane();
            assert.equal(l.activePaneIndex, 0);
        },
    },
    {
        name: 'prevPane: cycles activePaneIndex backward',
        fn: () => {
            const l = new Layout();
            l.setMode('hsplit2');
            l.activePaneIndex = 0;
            l.prevPane();
            assert.equal(l.activePaneIndex, 1);
            l.prevPane();
            assert.equal(l.activePaneIndex, 0);
        },
    },
    {
        name: 'toggleBrowser: makes browser visible',
        fn: () => {
            const l = new Layout();
            assert.equal(l.browserVisible, false);
            l.toggleBrowser();
            assert.equal(l.browserVisible, true);
            assert.equal(l.browserFocused, true);
        },
    },
    {
        name: 'toggleBrowser: hides browser on second call',
        fn: () => {
            const l = new Layout();
            l.toggleBrowser();
            l.toggleBrowser();
            assert.equal(l.browserVisible, false);
        },
    },
    {
        name: 'toggleBrowser: sets browser side when provided',
        fn: () => {
            const l = new Layout();
            l.toggleBrowser('right');
            assert.equal(l.browserSide, 'right');
        },
    },
    {
        name: 'browserBounds: correct position on left side',
        fn: () => {
            const l = new Layout();
            l.update(80, 24);
            l.toggleBrowser('left');
            const b = l.browserBounds();
            assert.equal(b.x, 0);
            assert.equal(b.y, 0);
            assert.equal(b.w, 32);
            assert.equal(b.h, 23); // 24-1 for status bar
        },
    },
    {
        name: 'browserBounds: correct position on right side',
        fn: () => {
            const l = new Layout();
            l.update(80, 24);
            l.toggleBrowser('right');
            const b = l.browserBounds();
            assert.equal(b.x, 80 - 32);
        },
    },
    {
        name: 'update: sets terminal dimensions',
        fn: () => {
            const l = new Layout();
            l.update(120, 40);
            assert.equal(l.termW, 120);
            assert.equal(l.termH, 40);
        },
    },
    {
        name: 'separators: single mode has no separators',
        fn: () => {
            const l = new Layout();
            l.update(80, 24);
            l.setMode('single');
            assert.equal(l.separators().length, 0);
        },
    },
    {
        name: 'separators: hsplit2 has one vertical separator',
        fn: () => {
            const l = new Layout();
            l.update(80, 24);
            l.setMode('hsplit2');
            const seps = l.separators();
            assert.equal(seps.length, 1);
            assert.equal(seps[0].type, 'vertical');
        },
    },
    {
        name: 'separators: vsplit2 has one horizontal separator',
        fn: () => {
            const l = new Layout();
            l.update(80, 24);
            l.setMode('vsplit2');
            const seps = l.separators();
            assert.equal(seps.length, 1);
            assert.equal(seps[0].type, 'horizontal');
        },
    },
    {
        name: 'separators: quad has two separators',
        fn: () => {
            const l = new Layout();
            l.update(80, 24);
            l.setMode('quad');
            const seps = l.separators();
            assert.equal(seps.length, 2);
        },
    },
    {
        name: 'separators: browser visible adds its own separator',
        fn: () => {
            const l = new Layout();
            l.update(80, 24);
            l.setMode('single');
            l.toggleBrowser('left');
            const seps = l.separators();
            assert.equal(seps.length, 1);
            assert.equal(seps[0].type, 'vertical');
        },
    },
    {
        name: 'hsplit2: panes have non-overlapping x positions',
        fn: () => {
            const l = new Layout();
            l.update(80, 24);
            l.setMode('hsplit2');
            const [p0, p1] = l.panes;
            assert.ok(p0.x < p1.x, 'left pane starts before right pane');
            assert.ok(p0.x + p0.width <= p1.x, 'panes do not overlap');
        },
    },
    {
        name: 'vsplit2: panes have non-overlapping y positions',
        fn: () => {
            const l = new Layout();
            l.update(80, 24);
            l.setMode('vsplit2');
            const [p0, p1] = l.panes;
            assert.ok(p0.y < p1.y);
            assert.ok(p0.y + p0.height <= p1.y);
        },
    },
];
