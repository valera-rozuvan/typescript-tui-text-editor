/*
 * 07_scroll_rendering — verify that the virtual-screen diff renderer stays
 * consistent as the cursor moves down through a 500-line file one line at a
 * time.
 *
 * After every down-arrow press the test asserts three things for each row
 * in the visible viewport:
 *   1. The status bar reports the correct line number.
 *   2. The content area of every visible row starts with the expected text.
 *   3. The space after each line's text is clean — no stray characters left
 *      over from a previously-rendered longer line on that row.
 *
 * Lines intentionally alternate between long and short lengths (every 7th
 * line is short) to maximally exercise the diff algorithm: when a long line
 * scrolls to a row that must now show a short line, the diff renderer must
 * overwrite the stale trailing characters with spaces.
 *
 * Terminal: 120 × 30
 *   pane height   = 30 - 1 = 29  (status bar is the bottom terminal row)
 *   contentHeight = 29 - 1 = 28  (first pane row is the title bar)
 *   gutterWidth   = Math.max(3, len("500")) + 1 = 4
 *   scrollLine    = max(0, cursorLine - 27)
 *   visible range = [scrollLine, scrollLine + 27]
 *   content cols  = [gutterWidth, COLS) = [4, 120)
 */
import type { TestCase } from './types.js';
import { EditorTest, KEY, createTempDir, createTempFile, removeTempDir } from './helpers.js';

export const suite = 'scroll_rendering';

/* ── Constants ───────────────────────────────────────────────────────────── */

const NUM_LINES      = 500;
const COLS           = 120;
const ROWS           = 30;
const CONTENT_HEIGHT = ROWS - 2;   // pane.contentHeight = (ROWS-1) - 1
const GUTTER_WIDTH   = 4;          // Math.max(3, len("500")) + 1

/* ── Content generation ──────────────────────────────────────────────────── */

/*
 * Long sentences (~75 chars) and short sentences (~10 chars) are interleaved:
 * every 7th line (0-indexed) uses a short sentence.  This creates the hardest
 * case for the diff algorithm — a row that previously held a long line must
 * have its trailing cells cleared when the viewport shifts and a short line
 * takes that screen row.
 */
const LONG_SENTENCES: string[] = [
  'The stone path curved gently through a canopy of ancient oaks toward the pale sky.',
  'Grey mist gathered in the valley below as the last sunlight left the ridge.',
  'Cold water rushed over mossy rocks in the ravine far below the forest trail.',
  'Lanterns flickered along the winding street as the evening crowds dispersed.',
  'The old map showed trails long forgotten by all but the mountain folk here.',
  'Frost crept silently across the window glass in the early hours before dawn.',
  'Three riders appeared on the horizon moving swiftly toward the small village.',
  'Smoke rose in lazy spirals from the chimneys of a dozen distant farmhouses.',
  'The bridge had stood for six hundred years and still it held firm and true.',
  'Heavy clouds rolled in from the north and promised snow before nightfall came.',
  'She found the letter tucked inside the hollow of the great silver beech tree.',
  'Words carved into the stone door frame had worn away past all possible reading.',
  'A narrow boat drifted silently past the reeds at the margin of the wide marsh.',
  'The merchant weighed each coin carefully before adding it to his leather purse.',
  'Wind swept unbroken through the tall grass of the open plain without any mercy.',
  'Stars appeared one by one as the last amber light faded from the western sky.',
  'The answer they sought was buried deep in the archives of a forgotten library.',
  'Two paths diverged at the crest of the hill and neither looked well travelled.',
  'Rain hammered the clay roof tiles and turned the whole courtyard into a lake.',
  'An iron key hung on a peg beside the door but it opened nothing in this place.',
  'The forest grew steadily denser as they descended into the bowl of the valley.',
  'Morning brought clear skies and the distant sound of a waterfall high in hills.',
  'She recognised the seal pressed into the wax but refused to break it just yet.',
  'The captain ordered the sails furled as the harbour mouth finally came to view.',
  'Twelve stone steps led down into a chamber the size of a grand and ancient hall.',
  'Ivy had long since swallowed the carved inscription set above the stone archway.',
  'A fire burned low in the grate and cast long shadows across the cold flagstones.',
  'The trail ended without warning at the edge of a wide and perfectly silent river.',
  'He counted thirty seven steps from the gate to the well and then abruptly stopped.',
  'Snow had filled the valley overnight leaving the whole world hushed and brilliant.',
  'No one knew whose footprints led to the door and then so abruptly disappeared.',
  'The lighthouse beam swept across dark water at its slow and perfectly even rhythm.',
  'Parchment crinkled softly under her fingers as she unrolled the ancient torn scroll.',
  'Dusk turned the surface of the lake into a mirror reflecting all the sky colours.',
  'The pass through the mountains was dangerously narrow and strewn with loose shale.',
  'A single lamp burned on in the upper window of the otherwise entirely dark tower.',
  'Thorn bushes lined both sides of the narrow path making passage very difficult.',
  'He left no note behind but the chair by the dying fire was still warm to touch.',
  'Far below the cliff edge the ocean churned ceaselessly against pale limestone.',
  'The wagon ruts in the soft mud told of very heavy loads moved under cover of night.',
  'Bells rang in the distant abbey marking the slow passing of another grey hour.',
  'A crack in the low ceiling let in a single thread of pale grey dawn light above.',
  'The lock was old and desperately stiff but it yielded at last to the correct key.',
  'Dry leaves skittered across the empty courtyard driven by a sudden sharp cold gust.',
  'He had crossed this same river a hundred times but never in such dangerously high water.',
  'The faded painting showed a city that none of them had ever visited or even heard named.',
  'She wound the brass clock carefully and set it gently back on the stone mantelpiece.',
  'Nothing moved on the bare hillside except the slow shadow of one drifting grey cloud.',
  'The cellar smelled strongly of dark earth and old wood and something harder to name.',
  'At the edge of the world the sky turned colours no painter had ever managed to capture.',
];

const SHORT_SENTENCES: string[] = [
  'No word came.',
  'Wait here.',
  'Gone now.',
  'Too late.',
  'Stand firm.',
  'Check again.',
  'Not yet seen.',
];

/* Build the text for every line (without newline). */
function buildLines(): string[] {
  const lines: string[] = [];
  for (let i = 0; i < NUM_LINES; i++) {
    const tag      = `L${String(i + 1).padStart(4, '0')}`;
    const sentence = (i % 7 === 0)
      ? SHORT_SENTENCES[Math.floor(i / 7) % SHORT_SENTENCES.length]
      : LONG_SENTENCES[i % LONG_SENTENCES.length];
    lines.push(`${tag} ${sentence}`);
  }
  return lines;
}

/* ── Viewport helpers ────────────────────────────────────────────────────── */

/*
 * Mirrors Pane.scrollToCursor(): scrollLine advances only when the cursor
 * would leave the bottom of the content area.
 */
function scrollLineFor(cursorLine: number): number {
  return Math.max(0, cursorLine - (CONTENT_HEIGHT - 1));
}

function visibleRange(cursorLine: number): { first: number; last: number; scrollLine: number } {
  const sl = scrollLineFor(cursorLine);
  return {
    scrollLine: sl,
    first:      sl,
    last:       Math.min(NUM_LINES - 1, sl + CONTENT_HEIGHT - 1),
  };
}

/* ── Per-row content assertion ───────────────────────────────────────────── */

/*
 * Assert that terminal row `screenRow` (0-indexed) contains:
 *   • the expected line text in the content area (cols GUTTER_WIDTH..COLS-1), and
 *   • only space characters in the cells that follow the text on that row.
 *
 * "Stray characters" are non-space characters in those trailing cells; they
 * would indicate that the diff renderer failed to overwrite a cell that
 * belonged to a longer line rendered previously on the same screen row.
 */
function assertRowContent(
  screenLine: string,   // t.screen.getLine(screenRow) — full COLS-wide string
  screenRow:  number,
  lineIndex:  number,   // 0-indexed file line shown on this row
  lineTexts:  string[],
  context:    string,
): void {
  const contentArea  = screenLine.slice(GUTTER_WIDTH);          // cols 4..119
  const expectedText = lineTexts[lineIndex];

  /* Check that the expected line text appears at the start of the content area. */
  if (!contentArea.startsWith(expectedText)) {
    const got = contentArea.slice(0, expectedText.length);
    throw new Error(
      `${context}\n` +
      `  Expected in content area: ${JSON.stringify(expectedText)}\n` +
      `  Got:                      ${JSON.stringify(got)}\n` +
      `  Full row ${screenRow}:    ${JSON.stringify(screenLine)}`,
    );
  }

  /* Check that every cell after the text is a space (no stale content). */
  const trailing   = contentArea.slice(expectedText.length);
  const firstStray = trailing.search(/[^ ]/);
  if (firstStray >= 0) {
    const strayCol = GUTTER_WIDTH + expectedText.length + firstStray;
    throw new Error(
      `${context}\n` +
      `  Stray character ${JSON.stringify(trailing[firstStray])} at terminal column ${strayCol} ` +
      `(row ${screenRow}, after "${expectedText.slice(-10)}")\n` +
      `  Full row ${screenRow}: ${JSON.stringify(screenLine)}`,
    );
  }
}

/* ── Tests ───────────────────────────────────────────────────────────────── */

export const tests: TestCase[] = [
  {
    name: 'diff renderer stays correct while navigating down through 500 lines one by one',
    async fn() {
      const dir       = createTempDir();
      const t         = new EditorTest(COLS, ROWS);
      const lineTexts = buildLines();
      const content   = lineTexts.join('\n') + '\n';

      try {
        const file = createTempFile(dir, 'scroll_test.txt', content);
        await t.start([file]);

        /* ── initial state: cursor on line 1 (0-indexed line 0) ──────── */
        t.assertStatusContains('1:1', 'Initial: status must show 1:1');
        {
          const { first, last, scrollLine } = visibleRange(0);
          for (let li = first; li <= last; li++) {
            const screenRow = 1 + (li - scrollLine); // +1 for pane title bar
            assertRowContent(
              t.screen.getLine(screenRow),
              screenRow, li, lineTexts,
              `Initial: viewport line ${li + 1} (screen row ${screenRow})`,
            );
          }
        }

        /* ── press ↓ 499 times, verifying the full viewport each time ── */
        for (let step = 0; step < NUM_LINES - 1; step++) {
          /*
           * 60 ms idle window: the editor re-renders synchronously on every
           * keystroke (< 5 ms), so 60 ms is a safe margin.
           */
          await t.keys(KEY.ARROW_DOWN, 60);

          const cursorLine  = step + 1;          // 0-indexed
          const displayLine = cursorLine + 1;    // 1-indexed for status bar

          /* 1. Status bar must show the correct line number. */
          t.assertStatusContains(
            `${displayLine}:`,
            `Step ${step + 1}: status must show line ${displayLine}`,
          );

          /* 2 & 3. Every visible row must have the right text and no trailing stray chars. */
          const { first, last, scrollLine } = visibleRange(cursorLine);
          for (let li = first; li <= last; li++) {
            const screenRow = 1 + (li - scrollLine);
            assertRowContent(
              t.screen.getLine(screenRow),
              screenRow, li, lineTexts,
              `Step ${step + 1} (cursor=line ${displayLine}, viewport ${first + 1}–${last + 1}): ` +
              `file line ${li + 1} on screen row ${screenRow}`,
            );
          }
        }
      } finally {
        t.cleanup();
        removeTempDir(dir);
      }
    },
  },
];
