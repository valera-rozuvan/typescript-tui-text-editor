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
 * Tab stop formula: nextStop = (floor(screenCol / TAB_CHAR_COUNT) + 1) * TAB_CHAR_COUNT
 *
 *   Tab at content start (screen col 4):   next stop =  8  → 4-space jump
 *   Tab at screen col 8 (8-column aligned): next stop = 16  → 8-space jump (= TAB_CHAR_COUNT)
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
 * Mirrors DrawContext.write() in ScreenBuffer.ts.
 */
function tabStopAfter(screenCol: number): number {
  return (Math.floor(screenCol / TAB_CHAR_COUNT) + 1) * TAB_CHAR_COUNT;
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
        //   tab at screen col 4 → next stop 8 (4-space expansion)
        //   'F' lands at col 8.
        const singleTabCol = tabStopAfter(GUTTER); // 8
        t.assertInCols('First line', singleTabCol, 120,
          `'First line' should start at screen col ${singleTabCol} (after 1 tab from col ${GUTTER})`);

        // Line 5: \tSixth line — same geometry as line 0.
        t.assertInCols('Sixth line', singleTabCol, 120,
          `'Sixth line' should start at screen col ${singleTabCol}`);

        // Line 9: \tTenth line — same geometry.
        t.assertInCols('Tenth line', singleTabCol, 120,
          `'Tenth line' should start at screen col ${singleTabCol}`);

        // Line 2: \t\tNested line
        //   first tab:  screen col 4 → stop  8  (4-space expansion)
        //   second tab: screen col 8 → stop 16  (8-space expansion = TAB_CHAR_COUNT)
        //   'N' lands at col 16.
        const doubleTabCol = tabStopAfter(tabStopAfter(GUTTER)); // 16
        t.assertInCols('Nested line', doubleTabCol, 120,
          `'Nested line' should start at screen col ${doubleTabCol} (after 2 tabs)`);

        // Line 7: \t\tEighth line — same geometry.
        t.assertInCols('Eighth line', doubleTabCol, 120,
          `'Eighth line' should start at screen col ${doubleTabCol}`);

        // Line 3: abcd\tAfter tab
        //   'a','b','c','d' occupy screen cols 4–7 (GUTTER + 0..3)
        //   tab at screen col 8 → stop 16 (full TAB_CHAR_COUNT = 8 space expansion)
        //   'A' lands at col 16.
        const midLineTabCol = tabStopAfter(GUTTER + 4); // 16
        t.assertInCols('After tab', midLineTabCol, 120,
          `'After tab' should start at screen col ${midLineTabCol} (4 chars then tab from col 8)`);
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
     * jumps from screen col 4 (on the tab) to screen col 8 (on 'F'),
     * a 4-column visual leap.
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

        // Cursor starts at line 0, col 0 — on the tab character.
        t.assertStatusContains('1:1');

        // Right → col 1 ('F'). Visual jump: screen col 4 → 8 (4 columns).
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
     * The first tab jumps the cursor 4 visual columns (screen col 4 → 8).
     * The second tab is now at screen col 8, which is an exact TAB_CHAR_COUNT
     * boundary, so it jumps the full 8 columns (screen col 8 → 16).
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

        // Move to line 2 (two arrow-down presses from line 0).
        await t.keys(KEY.ARROW_DOWN);
        await t.keys(KEY.ARROW_DOWN);
        t.assertStatusContains('3:1'); // line 2, col 0 — on first tab

        // Right → col 1 (second tab). Visual jump: screen col 4 → 8 (4 columns).
        await t.keys(KEY.ARROW_RIGHT);
        t.assertStatusContains('3:2');

        // Right → col 2 ('N'). Visual jump: screen col 8 → 16 (TAB_CHAR_COUNT = 8 columns).
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
     * screen col 8 (GUTTER + 4 = 4 + 4).  That is exactly a TAB_CHAR_COUNT
     * boundary, so the following tab expands the full 8 columns: screen col 8
     * → 16.  This is the case that demonstrates a full TAB_CHAR_COUNT visual
     * jump of the cursor.
     *
     * Line 3 contents and buffer indices:
     *   0:'a'  1:'b'  2:'c'  3:'d'  4:'\t'  5:'A'  6:'f'
     *   7:'t'  8:'e'  9:'r'  10:' ' 11:'t'  12:'a'  13:'b'  len=14
     */
    name: 'right arrow across mid-line tab aligned to tab-stop boundary produces full TAB_CHAR_COUNT visual jump',
    async fn() {
      const dir = createTempDir();
      const t = new EditorTest(120, 30);
      try {
        const file = createTempFile(dir, 'tabs.txt', FILE_CONTENT);
        await t.start([file]);

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

        // Confirm 'After tab' is rendered starting at col 16 (after the 8-space expansion).
        const expectedCol = tabStopAfter(GUTTER + 4); // 16
        t.assertInCols('After tab', expectedCol, 120,
          `'After tab' must start at screen col ${expectedCol} after the full TAB_CHAR_COUNT (${TAB_CHAR_COUNT}) expansion`);

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
];
