/*
 * 12_tab_navigation — verify that tab characters expand correctly on screen
 * and that the cursor moves correctly through them one right-arrow key at a time.
 *
 * File layout (10 lines, some starting with a tab):
 *
 *   Line 0:  \tFirst line       — single leading tab
 *   Line 1:  Second line        — no tab
 *   Line 2:  \t\tNested line    — two leading tabs
 *   Line 3:  abcd\tAfter tab    — tab after four regular chars
 *   Line 4:  Fifth line         — no tab
 *   Line 5:  \tSixth line       — single leading tab
 *   Line 6:  Seventh line       — no tab
 *   Line 7:  \t\tEighth line    — two leading tabs
 *   Line 8:  Ninth line         — no tab
 *   Line 9:  \tTenth line       — single leading tab
 *
 * Gutter width for 10 lines:  max(3, len("10")) + 1 = 4 columns (cols 0–3).
 * Content area starts at screen column 4.
 *
 * Tab expansion: each tab always expands to exactly TAB_CHAR_COUNT (8) spaces,
 * regardless of the current screen column position.
 *   nextStop = screenCol + TAB_CHAR_COUNT
 *
 *   Tab at content start (screen col 4): next stop = 12  → TAB_CHAR_COUNT-space jump
 *   Tab at screen col 8:                 next stop = 16  → TAB_CHAR_COUNT-space jump
 *
 * Status-bar "line:col" uses the buffer character index (1-indexed), so
 * pressing right past a tab increments the column counter by exactly 1.
 * The visual tab expansion is verified by checking where the text that follows
 * the tab lands on the rendered screen.
 */
import type { TestCase } from './types.js';
import {
  EditorTest, KEY,
  createTempDir, createTempFile, readTempFile, removeTempDir,
} from './helpers.js';
import { TAB_CHAR_COUNT } from './constants.js';

export const suite = 'tab_navigation';

const LINES = [
  '\tFirst line',      // 0 — single leading tab
  'Second line',       // 1 — no tab
  '\t\tNested line',   // 2 — two leading tabs
  'abcd\tAfter tab',   // 3 — tab after 4 regular chars (aligns to col 8 → full TAB_CHAR_COUNT jump)
  'Fifth line',        // 4 — no tab
  '\tSixth line',      // 5 — single leading tab
  'Seventh line',      // 6 — no tab
  '\t\tEighth line',   // 7 — two leading tabs
  'Ninth line',        // 8 — no tab
  '\tTenth line',      // 9 — single leading tab
];

const FILE_CONTENT = LINES.join('\n') + '\n';

/* Gutter width for a 10-line file: max(3, len("10")) + 1 = 4. */
const GUTTER = 4;

/*
 * Screen column where a character lands after a tab that starts at `screenCol`.
 * Each tab always expands by exactly TAB_CHAR_COUNT spaces (fixed-width).
 * Mirrors DrawContext.write() in ScreenBuffer.ts.
 */
function tabStopAfter(screenCol: number): number {
  return screenCol + TAB_CHAR_COUNT;
}

/*
 * Assert that the tab whose expansion begins at screen column `tabStartCol` on
 * screen row `screenRow` renders as exactly TAB_CHAR_COUNT space characters
 * inside the PTY, confirming each tab always expands by a fixed TAB_CHAR_COUNT
 * columns regardless of position.
 */
function assertTabWidth(t: EditorTest, screenRow: number, tabStartCol: number, label: string): void {
  const screenLine = t.screen.getLine(screenRow);
  const tabEndCol = tabStopAfter(tabStartCol);
  const expectedWidth = tabEndCol - tabStartCol;
  const actual = screenLine.slice(tabStartCol, tabEndCol);
  const expected = ' '.repeat(expectedWidth);
  if (actual !== expected) {
    throw new Error(
      `${label}: tab at screen col ${tabStartCol}–${tabEndCol - 1} should be ` +
      `${expectedWidth} space(s) (TAB_CHAR_COUNT=${TAB_CHAR_COUNT}), ` +
      `got ${JSON.stringify(actual)}`
    );
  }
}

export const tests: TestCase[] = [
  {
    /*
     * Verify that all lines with tabs are rendered with their text content
     * starting at the correct visual screen column (after tab expansion).
     */
    name: 'tab characters expand to correct screen columns in the rendered output',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest(120, 30);
      try {
        const file = createTempFile(dir, 'tabs.txt', FILE_CONTENT);
        await t.start([file]);

        // Sanity: all text content is visible somewhere on screen.
        t.assertContains('First line');
        t.assertContains('Second line');
        t.assertContains('Nested line');
        t.assertContains('After tab');
        t.assertContains('Sixth line');
        t.assertContains('Eighth line');
        t.assertContains('Tenth line');

        // Line 0: \tFirst line
        //   tab at screen col 4 → next stop 12 (TAB_CHAR_COUNT-space expansion)
        //   'F' lands at col 12.
        const singleTabCol = tabStopAfter(GUTTER); // 12
        t.assertInCols('First line', singleTabCol, 120,
          `'First line' should start at screen col ${singleTabCol} (after 1 tab from col ${GUTTER})`);

        // Line 5: \tSixth line — same geometry as line 0.
        t.assertInCols('Sixth line', singleTabCol, 120,
          `'Sixth line' should start at screen col ${singleTabCol}`);

        // Line 9: \tTenth line — same geometry.
        t.assertInCols('Tenth line', singleTabCol, 120,
          `'Tenth line' should start at screen col ${singleTabCol}`);

        // Line 2: \t\tNested line
        //   first tab:  screen col  4 → stop 12  (TAB_CHAR_COUNT-space expansion)
        //   second tab: screen col 12 → stop 20  (TAB_CHAR_COUNT-space expansion)
        //   'N' lands at col 20.
        const doubleTabCol = tabStopAfter(tabStopAfter(GUTTER)); // 20
        t.assertInCols('Nested line', doubleTabCol, 120,
          `'Nested line' should start at screen col ${doubleTabCol} (after 2 tabs)`);

        // Line 7: \t\tEighth line — same geometry.
        t.assertInCols('Eighth line', doubleTabCol, 120,
          `'Eighth line' should start at screen col ${doubleTabCol}`);

        // Line 3: abcd\tAfter tab
        //   'a','b','c','d' occupy screen cols 4–7 (GUTTER + 0..3)
        //   tab at screen col 8 → stop 16 (TAB_CHAR_COUNT-space expansion)
        //   'A' lands at col 16.
        const midLineTabCol = tabStopAfter(GUTTER + 4); // 16
        t.assertInCols('After tab', midLineTabCol, 120,
          `'After tab' should start at screen col ${midLineTabCol} (4 chars then tab from col 8)`);

        // Verify that each tab in the PTY is exactly TAB_CHAR_COUNT space characters wide.
        //
        //   line 0  \tFirst line       : tab at col  4 → 12 = TAB_CHAR_COUNT spaces
        //   line 2  \t\tNested line    : tab1 at col  4 → 12 = TAB_CHAR_COUNT spaces
        //                                tab2 at col 12 → 20 = TAB_CHAR_COUNT spaces
        //   line 3  abcd\tAfter tab    : tab  at col  8 → 16 = TAB_CHAR_COUNT spaces
        //   line 5  \tSixth line       : same geometry as line 0
        //   line 7  \t\tEighth line    : same geometry as line 2
        //   line 9  \tTenth line       : same geometry as line 0
        assertTabWidth(t,  1, GUTTER,               'line 0: leading tab');
        assertTabWidth(t,  3, GUTTER,               'line 2: first leading tab');
        assertTabWidth(t,  3, tabStopAfter(GUTTER),  'line 2: second leading tab');
        assertTabWidth(t,  4, GUTTER + 4,            'line 3: mid-line tab');
        assertTabWidth(t,  6, GUTTER,               'line 5: leading tab');
        assertTabWidth(t,  8, GUTTER,               'line 7: first leading tab');
        assertTabWidth(t,  8, tabStopAfter(GUTTER),  'line 7: second leading tab');
        assertTabWidth(t, 10, GUTTER,               'line 9: leading tab');
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    /*
     * Navigate through the first line (\tFirst line) one right-arrow press at
     * a time and verify the status-bar cursor position after each press.
     *
     * The tab is one buffer character, so the status-bar column counter
     * increments by 1 when the cursor crosses it — but visually the cursor
     * jumps from screen col 4 (on the tab) to screen col 12 (on 'F'),
     * a TAB_CHAR_COUNT-column visual leap.
     *
     * Line 0 contents and buffer indices:
     *   0:'\t'  1:'F'  2:'i'  3:'r'  4:'s'  5:'t'  6:' '
     *   7:'l'   8:'i'  9:'n'  10:'e'        len=11
     */
    name: 'right arrow through line starting with single tab reports correct status-bar position at each step',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest(120, 30);
      try {
        const file = createTempFile(dir, 'tabs.txt', FILE_CONTENT);
        await t.start([file]);

        // Verify the leading tab on line 0 renders as exactly TAB_CHAR_COUNT
        // spaces in the PTY before any navigation takes place.
        // Tab starts at screen col 4 (GUTTER) → next stop 12 = TAB_CHAR_COUNT spaces.
        assertTabWidth(t, 1, GUTTER, 'line 0: leading tab (col 4 → 12 = TAB_CHAR_COUNT spaces)');

        // Cursor starts at line 0, col 0 — on the tab character.
        t.assertStatusContains('1:1');

        // Right → col 1 ('F'). Visual jump: screen col 4 → 12 (TAB_CHAR_COUNT columns).
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('1:2');

        // Right → col 2 ('i')
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('1:3');

        // Right → col 3 ('r')
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('1:4');

        // Right → col 4 ('s')
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('1:5');

        // Right → col 5 ('t')
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('1:6');

        // Right → col 6 (' ')
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('1:7');

        // Right → col 7 ('l')
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('1:8');

        // Right → col 8 ('i')
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('1:9');

        // Right → col 9 ('n')
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('1:10');

        // Right → col 10 ('e')
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('1:11');

        // Right → col 11 (past last char, end of line).
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('1:12');

        // Right → wraps to line 1, col 0.
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('2:1');
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    /*
     * Navigate to line 2 (\t\tNested line) and press right one step at a time.
     *
     * Both tabs jump exactly TAB_CHAR_COUNT visual columns each:
     *   first tab:  screen col  4 → 12 (TAB_CHAR_COUNT columns)
     *   second tab: screen col 12 → 20 (TAB_CHAR_COUNT columns)
     *
     * Line 2 contents and buffer indices:
     *   0:'\t'  1:'\t'  2:'N'  3:'e'  4:'s'  5:'t'  6:'e'
     *   7:'d'   8:' '   9:'l'  10:'i' 11:'n'  12:'e'  len=13
     */
    name: 'right arrow through line with two leading tabs: each tab is one buffer character',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest(120, 30);
      try {
        const file = createTempFile(dir, 'tabs.txt', FILE_CONTENT);
        await t.start([file]);

        // Verify both leading tabs on line 2 render as exactly TAB_CHAR_COUNT
        // spaces each in the PTY before any navigation takes place.
        // Tab1: col  4 → 12 = TAB_CHAR_COUNT spaces.
        // Tab2: col 12 → 20 = TAB_CHAR_COUNT spaces.
        assertTabWidth(t, 3, GUTTER,              'line 2: first leading tab (col 4 → 12 = TAB_CHAR_COUNT spaces)');
        assertTabWidth(t, 3, tabStopAfter(GUTTER), 'line 2: second leading tab (col 12 → 20 = TAB_CHAR_COUNT spaces)');

        // Move to line 2 (two arrow-down presses from line 0).
        await t.keys(KEY.ARROW_DOWN);
        await t.keys(KEY.ARROW_DOWN);
        t.assertStatusContains('3:1'); // line 2, col 0 — on first tab

        // Right → col 1 (second tab). Visual jump: screen col 4 → 12 (TAB_CHAR_COUNT columns).
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('3:2');

        // Right → col 2 ('N'). Visual jump: screen col 12 → 20 (TAB_CHAR_COUNT columns).
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('3:3');

        // Right → col 3 ('e')
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('3:4');

        // Right → col 4 ('s')
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('3:5');

        // Right → col 5 ('t')
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('3:6');

        // Right → col 6 ('e')
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('3:7');

        // Right → col 7 ('d')
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('3:8');

        // Right → col 8 (' ')
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('3:9');

        // Right → col 9 ('l')
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('3:10');

        // Right → col 10 ('i')
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('3:11');

        // Right → col 11 ('n')
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('3:12');

        // Right → col 12 ('e')
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('3:13');

        // Right → col 13 (end of line, past 'e').
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('3:14');

        // Right → wraps to line 3, col 0.
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('4:1');
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    /*
     * Navigate to line 3 (abcd\tAfter tab) and press right one step at a time.
     *
     * After four regular characters ('a','b','c','d') the cursor sits at
     * screen col 8 (GUTTER + 4 = 4 + 4).  The following tab expands exactly
     * TAB_CHAR_COUNT columns: screen col 8 → 16.
     *
     * Line 3 contents and buffer indices:
     *   0:'a'  1:'b'  2:'c'  3:'d'  4:'\t'  5:'A'  6:'f'
     *   7:'t'  8:'e'  9:'r'  10:' ' 11:'t'  12:'a'  13:'b'  len=14
     */
    name: 'right arrow across mid-line tab produces TAB_CHAR_COUNT visual jump',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest(120, 30);
      try {
        const file = createTempFile(dir, 'tabs.txt', FILE_CONTENT);
        await t.start([file]);

        // Verify the mid-line tab on line 3 renders as exactly TAB_CHAR_COUNT
        // spaces in the PTY before any navigation takes place.
        // 'abcd' occupies cols 4–7; tab starts at col 8 → stop 16 = TAB_CHAR_COUNT spaces.
        assertTabWidth(t, 4, GUTTER + 4, 'line 3: mid-line tab (col 8 → 16 = TAB_CHAR_COUNT spaces)');

        // Move to line 3 (three arrow-down presses from line 0).
        await t.keys(KEY.ARROW_DOWN);
        await t.keys(KEY.ARROW_DOWN);
        await t.keys(KEY.ARROW_DOWN);
        t.assertStatusContains('4:1'); // line 3, col 0 — on 'a'

        // Right → col 1 ('b'), screen col 5
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('4:2');

        // Right → col 2 ('c'), screen col 6
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('4:3');

        // Right → col 3 ('d'), screen col 7
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('4:4');

        // Right → col 4 (the tab character), screen col 8.
        // The tab occupies screen cols 8–15 (TAB_CHAR_COUNT = 8 spaces).
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('4:5');

        // Right → col 5 ('A'), screen col 16.
        // Visual jump across the tab: screen col 8 → 16 = TAB_CHAR_COUNT = 8 columns.
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('4:6');

        // Confirm 'After tab' is rendered starting at col 16 (TAB_CHAR_COUNT-space expansion).
        const expectedCol = tabStopAfter(GUTTER + 4); // 16
        t.assertInCols('After tab', expectedCol, 120,
          `'After tab' must start at screen col ${expectedCol} after TAB_CHAR_COUNT (${TAB_CHAR_COUNT}) expansion`);

        // Right → col 6 ('f'), screen col 17
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('4:7');

        // Right → col 7 ('t'), screen col 18
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('4:8');

        // Right → col 8 ('e'), screen col 19
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('4:9');

        // Right → col 9 ('r'), screen col 20
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('4:10');

        // Right → col 10 (' '), screen col 21
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('4:11');

        // Right → col 11 ('t'), screen col 22
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('4:12');

        // Right → col 12 ('a'), screen col 23
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('4:13');

        // Right → col 13 ('b'), screen col 24
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('4:14');

        // Right → col 14 (end of line, past 'b').
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('4:15');

        // Right → wraps to line 4, col 0.
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('5:1');
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    /*
     * Pressing the Tab key in edit mode must insert a single literal tab
     * character (\t) into the buffer — not spaces — and the cursor must jump
     * to the next TAB_CHAR_COUNT-column tab stop.
     *
     * Setup: open an empty file and type four regular characters ('abcd') so
     * the cursor sits at buffer column 4, which maps to screen column
     * GUTTER + 4 = 4 + 4 = 8.  Screen column 8 is an exact TAB_CHAR_COUNT
     * boundary, so the following tab expands the maximum number of columns:
     *
     *   tab at screen col 8  →  next stop = (floor(8/8)+1)*8 = 16
     *                        →  8 spaces of visual expansion = TAB_CHAR_COUNT
     *
     * After pressing Tab:
     *   • Buffer column advances from 4 to 5  (one buffer character: '\t')
     *   • Status bar shows 1:6 (col 5, 1-indexed)
     *
     * We then type 'XYZ' so there is visible content at screen col 16 to
     * assert against with assertInCols, confirming the 8-column visual jump.
     *
     * Finally we save and read the file to confirm it contains exactly one
     * '\t' character — not the two spaces the old implementation inserted.
     *
     * Gutter width for a 1-line file: max(3, len("1")) + 1 = 4.
     */
    name: 'pressing Tab inserts one literal tab character and the cursor jumps TAB_CHAR_COUNT columns visually',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest(120, 30);
      try {
        const file = createTempFile(dir, 'tab_insert.txt', '');
        await t.start([file]);

        // Gutter for 1-line file: max(3, 1) + 1 = 4. Content starts at screen col 4.
        const GUTTER_1LINE = 4;

        // Type 4 characters — cursor lands at buf col 4, screen col 8.
        await t.type('abcd');
        t.assertStatusContains('1:5'); // col=4 → display 5

        // Press Tab: inserts '\t' at buf col 4 (screen col 8).
        // Tab at screen col 8 → next stop (floor(8/8)+1)*8 = 16 → 8-space expansion.
        // Buffer col advances by 1 (tab is one character); status shows 1:6.
        await t.keys(KEY.TAB);
        t.assertStatusContains('1:6'); // col=5 → display 6

        // Type 'XYZ' after the tab so we can assert its visual screen position.
        await t.type('XYZ');
        t.assertStatusContains('1:9'); // col=8 → display 9

        // Verify the inserted tab takes exactly TAB_CHAR_COUNT spaces in the PTY.
        // Tab starts at screen col 8 (GUTTER_1LINE + 4 chars 'abcd') → stop 16 = 8 spaces.
        assertTabWidth(t, 1, GUTTER_1LINE + 4, 'inserted tab at col 8 takes TAB_CHAR_COUNT=8 spaces');

        // 'XYZ' must start at screen col 16 (= GUTTER_1LINE + 4 chars + 8-space tab).
        const xyzCol = tabStopAfter(GUTTER_1LINE + 4); // (floor(8/8)+1)*8 = 16
        t.assertInCols('XYZ', xyzCol, 120,
          `'XYZ' should start at screen col ${xyzCol}: 4-char gutter + 4 chars 'abcd' + ` +
          `TAB_CHAR_COUNT (${TAB_CHAR_COUNT}) spaces of tab expansion`);

        // Save the buffer to disk and verify the file contains one literal tab,
        // not spaces.  Buffer.save() appends a trailing newline.
        await t.keys(KEY.CTRL_S, 400);

        const content = readTempFile(file);
        const expected = 'abcd\tXYZ';
        if (!content.startsWith(expected)) {
          throw new Error(
            `File should start with ${JSON.stringify(expected)} ` +
            `(one literal \\t), got ${JSON.stringify(content)}`
          );
        }
        const tabCount = (content.match(/\t/g) ?? []).length;
        if (tabCount !== 1) {
          throw new Error(
            `Expected exactly 1 tab character in file, found ${tabCount}. ` +
            `Content: ${JSON.stringify(content)}`
          );
        }
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },

  {
    /*
     * Open a file with 10 lines where line N (1-indexed) contains exactly N tab
     * characters.  Tabs are distributed throughout each line by alternating a
     * single letter and a tab (pattern: C0 \t C1 \t ... \t CN), so the tab
     * positions vary — e.g., line 3 has tabs at buffer columns 1, 3, and 5.
     *
     * The test walks every buffer position in the file using right-arrow keys,
     * pressing once per character.  After each press it verifies:
     *
     *   1. The status-bar shows the correct 1-indexed line:col.
     *   2. Whenever the cursor just moved off a tab onto the following character,
     *      that character renders exactly TAB_CHAR_COUNT columns after the tab
     *      start, and the raw PTY bytes for the tab are exactly TAB_CHAR_COUNT
     *      spaces — confirming every tab expands to exactly TAB_CHAR_COUNT cells.
     */
    name: 'walk whole file right-arrow through 10 lines with 1-10 tabs, verifying status and tab expansion at every step',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest(120, 30);
      try {
        // Build 10 lines: line N (1-indexed) has exactly N tabs and N+1 letters,
        // alternating: C0 \t C1 \t ... \t CN   (2N+1 total buffer chars).
        // Letters are drawn sequentially from POOL (wrapping if needed), so the
        // characters are predictable and not all identical.
        const POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
        let ci = 0;
        const walkLines: string[] = [];
        for (let n = 1; n <= 10; n++) {
          let line = POOL[ci++ % POOL.length];
          for (let k = 0; k < n; k++) {
            line += '\t' + POOL[ci++ % POOL.length];
          }
          walkLines.push(line);
        }

        const file = createTempFile(dir, 'walk_tabs.txt', walkLines.join('\n') + '\n');
        await t.start([file]);

        // 10-line file: gutter = max(3, len("10")) + 1 = 4.
        const GUTTER = 4;

        // Screen column of the character at buffer position bufCol in lineStr,
        // accounting for tab expansion starting from the content area (col GUTTER).
        // Mirrors DrawContext.write() in ScreenBuffer.ts.
        function screenCol(lineStr: string, bufCol: number): number {
          let col = GUTTER;
          for (let i = 0; i < bufCol; i++) {
            if (lineStr[i] === '\t') {
              col += TAB_CHAR_COUNT;
            } else {
              col++;
            }
          }
          return col;
        }

        // Cursor starts at line 1, col 1 (first character of the first line).
        t.assertStatusContains('1:1');

        for (let lineIdx = 0; lineIdx < walkLines.length; lineIdx++) {
          const lineStr = walkLines[lineIdx];
          const lineNum = lineIdx + 1;

          // Step through every buffer column on this line one right-arrow at a time.
          // The final iteration moves to past-end-of-line (bufCol = lineStr.length),
          // and the status assertion there reads lineNum:(lineStr.length+1).
          for (let bufCol = 0; bufCol < lineStr.length; bufCol++) {
            await t.keys(KEY.ARROW_RIGHT, 100);
            t.assertStatusContains(`${lineNum}:${bufCol + 2}`);

            // After moving off a tab: (1) verify the raw PTY space count is exactly
            // TAB_CHAR_COUNT, and (2) verify the following character lands exactly
            // TAB_CHAR_COUNT columns after the tab start.
            if (lineStr[bufCol] === '\t') {
              const tabScreenCol = screenCol(lineStr, bufCol);
              assertTabWidth(
                t,
                lineIdx + 1,
                tabScreenCol,
                `line ${lineNum} buf col ${bufCol}: tab at screen col ${tabScreenCol}`,
              );
              if (bufCol + 1 < lineStr.length) {
                const nextBufCol = bufCol + 1;
                const expectedScreenCol = screenCol(lineStr, nextBufCol);
                t.assertInCols(
                  lineStr[nextBufCol],
                  expectedScreenCol,
                  expectedScreenCol + 1,
                  `Line ${lineNum} buf col ${nextBufCol}: '${lineStr[nextBufCol]}' after tab ` +
                  `must be at screen col ${expectedScreenCol} (TAB_CHAR_COUNT=${TAB_CHAR_COUNT})`,
                );
              }
            }
          }

          // Advance past end-of-line to the next line's col 1.
          if (lineIdx < walkLines.length - 1) {
            await t.keys(KEY.ARROW_RIGHT, 100);
            t.assertStatusContains(`${lineNum + 1}:1`);
          }
        }
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },
];
