/*
 * 05_project_search — verify Ctrl+P project search returns results sorted by
 * relevance score (most relevant first).
 *
 * Scenario:
 *   1. Create a temp directory with a .git marker and 10 .txt files of
 *      original fantasy-style prose (~25 lines each).
 *   2. ch01.txt line 1 starts with "rider" → fuzzy score ~80 (start bonus +
 *      consecutive-match bonus) — the highest possible for this needle.
 *   3. ch02–ch10.txt each contain "rider" somewhere mid-line → lower scores.
 *   4. Start the editor with cwd = tempDir (no file open), so process.cwd()
 *      resolves to tempDir and project search is scoped to tempDir.
 *   5. Open project search with Ctrl+P, type "rider".
 *   6. Assert that the first result slot on screen shows "ch01.txt:1",
 *      confirming the highest-scored match is sorted to the top.
 *
 * Row maths for H=30:
 *   panelY     = floor(30 * 0.15) = 4   (0-indexed)
 *   inputRow   = panelY + 2        = 6
 *   first result row (T.moveTo uses 1-indexed):
 *     T.moveTo(inputRow + 3 + 0 + 1, ...) = T.moveTo(10, ...) → screen row 9 (0-indexed)
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { TestCase } from './types.js';
import {
  EditorTest, KEY,
  createTempDir, removeTempDir,
} from './helpers.js';

export const suite = 'project_search';

/* ── fixture file content ─────────────────────────────────────────────────── */

/*
 * ch01.txt — line 1 starts with "rider" → highest fuzzy score for needle
 * "rider" (exact match at position 0: +10 start bonus + +70 consecutive bonus).
 */
const CH01 = [
  'rider appeared at the edge of the hollow where the old oaks stood dark against the dawn',
  'the wind moved through the bare branches with a sound like distant voices',
  'he had ridden through the night and his horse was grey with frost',
  'behind him the mountains rose white against a sky the colour of iron',
  'before him the road wound down through birch trees into the valley below',
  'smoke rose from the village ahead a thin column against the pale morning',
  'he urged his horse forward and the stones of the old road clattered beneath its hooves',
  'no one was abroad in the early hour and the gates of the town still stood closed',
  'he struck the wood three times with the butt of his staff',
  'a face appeared above the parapet young and uncertain',
  'state your business the voice said though it shook a little',
  'he replied with a word that caused the gates to open without further question',
  'inside the town the streets were empty but for a few dogs',
  'he rode to the inn at the centre of the market square and dismounted',
  'the innkeeper came out and took one look at his face and said nothing',
  'a boy was called to tend the horse and the traveller was led inside',
  'he asked for water and for news and both were given freely',
  'the news was not good the valley had been watched for three days',
  'strange fires had been seen on the hillsides at night',
  'and twice the cattle had been found driven south toward the river',
  'he listened to all of it and thanked the innkeeper with a coin',
  'then he took the stairs to the upper room that was offered and shut the door',
  'he did not sleep but sat at the window watching the road that led back into the hills',
  'when the noon bell rang he was already gone',
  'the road behind him showed no footprints in the frost',
].join('\n');

/* ch02 — "rider" appears mid-line (~line 5) */
const CH02 = [
  'the watchtower had stood at the crossing for three hundred years',
  'its stones were the same dark basalt as the hills surrounding it',
  'the garrison had been reduced twice in the last year and now held only six',
  'their supplies would last another month if rationed with care',
  'at dawn a rider came in from the east bearing sealed letters',
  'the captain broke the seals and read without expression',
  'then he called his second and spoke quietly for a long time',
  'they burned the papers in the iron grate before the hour was out',
  'the six soldiers stood to arms that afternoon for the first time in months',
  'the captain would say only that they expected company',
  'the kind that does not knock before entering he added',
  'the youngest of them asked if they should send for more men',
  'the captain looked at the hills and said it would take three days',
  'and in three days it would not matter one way or the other',
  'they prepared what they could barring the outer gate with fresh timber',
  'and moving their stores to the second floor where any fight would be more even',
  'that night the watch was doubled and no one slept well',
  'fires appeared on the hillside again an hour after sunset',
  'moving south just as the messenger from the east had described',
  'the captain kept his own counsel and sharpened his sword in the dark',
  'by morning the fires were gone and the hills looked as they always had',
  'the youngest soldier said perhaps it was shepherds with their flocks',
  'the captain did not answer him',
  'he was already thinking about the next night',
  'and the night after that',
].join('\n');

/* ch03 — "rider" appears mid-line (~line 8) */
const CH03 = [
  'the hall of the warden council had not been full for twenty years',
  'dust lay on the carved chairs and the banners overhead had faded to grey',
  'she had expected argument but the silence that met her was worse',
  'they had all read the report she had sent ahead by fast messenger',
  'the maps were spread on the long table showing the routes and the numbers',
  'it was the numbers that silenced them she knew',
  'three brigades moving without any herald or declaration of intent',
  'a rider had brought word that the eastern passes were also watched',
  'which meant whatever was coming did not want anyone leaving ahead of it',
  'the eldest of the wardens finally spoke and asked what she proposed',
  'she told them precisely and watched their faces change',
  'it was not a small thing she was asking and she did not pretend otherwise',
  'but it was the only thing that gave them any chance of holding',
  'the second warden objected that the northern garrison was already stretched',
  'she agreed and said that was why they needed to send for the hill clans',
  'the hill clans had not answered a summons in forty years said the third',
  'she said she knew that and had written to them already two weeks past',
  'that brought the silence back',
  'after a long time the eldest said they would vote',
  'she left the room while they did so and stood in the cold corridor',
  'when the door opened the verdict was on the eldest face before she spoke',
  'they would do it they had no other choice',
  'she thanked them and went out into the night',
  'there was much still to arrange and very little time',
  'she began making lists in her head before she reached the bottom stair',
].join('\n');

/* ch04 — "rider" appears mid-line (~line 4) */
const CH04 = [
  'the marshes lay grey and still in the early light',
  'nothing moved on the black water between the clumps of reed',
  'she had been warned about the marsh and had not listened carefully enough',
  'then a rider on a pale horse emerged from the mist at the far edge',
  'she froze and watched it pick its way along the causeway',
  'it did not move like someone who knew the way',
  'it moved too slowly testing each step as though unsure of the ground',
  'she called out and the rider turned toward her voice',
  'it was a young man dressed in grey wool wet to the knee',
  'he had the look of someone who had been walking a long time before finding the horse',
  'she asked where he had come from and he named a town three days east',
  'she asked what he had seen on the road',
  'he told her about the column moving west along the northern track',
  'she had not known about the northern track she said',
  'he said most people did not it was older than the maps',
  'they walked together to the firmer ground beyond the reeds',
  'he accepted a piece of bread and ate it quickly without apology',
  'she asked his name and he gave one she did not recognize',
  'at the next village she bought him a dry coat and he thanked her properly',
  'then they parted ways at the crossroads each going north and south',
  'she watched him until the road bent and he was gone',
  'the marsh birds called behind her as she turned away',
  'the sound was thin and carried far in the still air',
  'she did not look back again',
  'the road ahead was long enough to occupy her thoughts entirely',
].join('\n');

/* ch05 — "rider" appears mid-line (~line 10) */
const CH05 = [
  'the old road had not been used in living memory but it was still passable',
  'the stones showed beneath the turf where the ground was thin',
  'the trees on either side had grown tall and close overhead making a tunnel of branches',
  'nothing had grazed here in years and the grass was long and pale',
  'she counted the mile markers as she went each one carved with the old script',
  'the fifth marker had been broken and lay on its side in the ditch',
  'she stopped there and checked her direction against the sun',
  'it was three hours past midday and she was still two hours from the valley',
  'when the road opened onto a cleared hillside she stopped again',
  'a rider was visible below crossing the sheep track toward the village',
  'she watched until it disappeared between the low stone walls',
  'then she pressed on down the slope toward the same track',
  'the village was small with a dozen houses around a pond',
  'smoke from three chimneys and the smell of baking bread',
  'she stopped at the well and drew water for herself and her horse',
  'the woman who came to her door was old and did not seem surprised',
  'she offered grain for the horse and soup for the traveller',
  'both were accepted with gratitude',
  'over the soup she asked about the rider who had passed through',
  'the woman said she had not seen anyone that day',
  'she finished the soup and thanked the woman and left without pressing',
  'the old road continued south and she followed it until dark',
  'she made camp in the lee of a ruined wall and slept without dreaming',
  'morning brought clear skies and a hard frost',
  'she broke the ice in her water skin and was moving before full light',
].join('\n');

/* ch06 — "rider" appears mid-line (~line 6) */
const CH06 = [
  'the bridge at the narrows was the only crossing for fifty miles',
  'the river ran high and grey with snowmelt from the northern hills',
  'the ferryman had not come out and the boat was tied to the far bank',
  'she waited an hour then called across and got no answer',
  'it was then she noticed the tracks in the mud at the near shore',
  'several horses had crossed recently the mud churned dark',
  'a rider had stopped here she could see where he had dismounted and stood',
  'the boot prints were deep and the person had walked to the edge',
  'then turned back and gone away south along the bank',
  'she found the ferryman at last in the third house upstream',
  'he had been paid to stay away that morning he said and looked afraid to say more',
  'she asked by whom and he shook his head',
  'she paid him double what he had been paid and he brought out the boat',
  'the crossing took twenty minutes in the current',
  'on the far bank she saw the tracks again continuing south',
  'she followed them for two miles before losing them in a stretch of rocky ground',
  'the road north was clear from there and she took it',
  'evening came on quickly and the stars were out before she found shelter',
  'a stone barn at the side of the road empty and dry',
  'she pulled the door shut against the wind and fed the horse from her pack',
  'then she lay down in the straw and closed her eyes',
  'she was asleep before she had time to think about the tracks',
  'and what they meant for the road ahead',
  'in the morning she would decide what to do with what she knew',
  'for now sleep was the more urgent need',
].join('\n');

/* ch07 — "rider" appears mid-line (~line 4) */
const CH07 = [
  'the siege had lasted eleven days when the relief column arrived',
  'they came from the western pass in the morning light banners barely visible in the mist',
  'the defenders on the walls saw them first and the shout went up',
  'among them a rider bearing the white pennant of the high warden raced ahead of the column',
  'the gates were opened before he reached them he came through at full gallop',
  'the commander of the garrison met him in the courtyard',
  'the message he bore was brief they would have three hundred more by evening',
  'three hundred was not enough the commander said',
  'it was enough to hold the outer wall said the messenger',
  'the commander looked at the wall and thought about it',
  'the outer wall had been lost on the fifth day',
  'then it would be enough to retake it',
  'they argued for twenty minutes while outside the mist burned off in the sun',
  'the commander looked at the slope outside the walls',
  'the siege works were extensive but not complete',
  'he called his captains and told them they would sortie at midday',
  'the relief arrived by late morning and was given no rest',
  'they were at the gates when the noon bell rang',
  'the sortie lasted two hours and the outer wall changed hands twice',
  'when it was over the garrison held it and the siege works were broken',
  'the commander found the messenger afterward and conceded the point',
  'the messenger said nothing and cleaned his sword',
  'that evening the besieging force withdrew to the treeline',
  'no one slept that night but the mood had changed',
  'by morning a flag appeared among the trees and talks began',
].join('\n');

/* ch08 — "rider" appears mid-line (~line 7) */
const CH08 = [
  'the healing gardens had been built in the old manner with walls on three sides',
  'the fourth side was open to the south and the light',
  'it was quiet there in a way that the rest of the fortress was not',
  'she walked the flagged paths between the low beds of herbs and medicinal plants',
  'most of them were bare now waiting for spring',
  'the smell of rosemary was strong even in the cold',
  'she had been told that a rider had arrived the previous night from the north',
  'that he had spoken only to the high warden and left before dawn',
  'whatever news he carried it had put lines in the warden face that were not there before',
  'she stopped at the stone bench in the corner and sat for a while',
  'the sun was warm in that sheltered place and she let herself feel it',
  'two of the healers moved between the beds trimming back the dead growth',
  'they did not speak but their movements were unhurried',
  'she thought about what the lines in the warden face might mean',
  'it was not the first time bad news had come from the north',
  'the question was always the same how much time remained',
  'the answer this time she suspected was less than anyone wanted',
  'she rose from the bench and went back to her work',
  'there were decisions to make and she was the one who had to make them',
  'she had always known it would come to this eventually',
  'she had simply hoped eventually would be further away',
  'the healers looked up as she passed and she nodded to them',
  'they returned to their work and so did she',
  'the afternoon light came low through the open side of the garden',
  'by evening the lists were made and the orders were written',
].join('\n');

/* ch09 — "rider" appears mid-line (~line 9) */
const CH09 = [
  'the scouts came back in ones and twos over the course of the afternoon',
  'each one more tired than the last and each with a different piece',
  'she assembled the pieces on the map table as they came in',
  'the first reported movement on the eastern track heading south',
  'the second had seen fires on three consecutive nights moving west',
  'the third had lost her horse in the marsh and walked the last twelve miles',
  'the fourth had been turned back at the border post which had been reinforced',
  'the fifth was late and when he arrived he looked shaken',
  'a rider came from the other side and spoke with the border guards',
  'we could not hear what was said but afterward they changed the watch rotation',
  'she marked that on the map with a question and a time',
  'the picture that was forming was not surprising but it was worse than she had hoped',
  'the movement on the eastern track was the outer edge of something larger',
  'the fires at night showed troops not herders they were too evenly spaced',
  'the reinforced border post meant whoever was moving did not want word going back',
  'she thanked the scouts and sent them to rest',
  'then she sat alone with the map for a long time',
  'when her second came in she did not look up',
  'she said get me the captain of the garrison and the keeper of the stables',
  'we are going to need horses tonight',
  'her second asked no questions which was one of the reasons she valued him',
  'the captain arrived first and she told him what she knew',
  'the keeper of the stables arrived second and she told him what she needed',
  'both of them left without a word and she went back to the map',
  'there was still one piece she did not have and she did not know where to look for it',
].join('\n');

/* ch10 — "rider" appears mid-line (~line 2) */
const CH10 = [
  'the message arrived on a morning when the sky was pale and the frost still heavy',
  'a rider came through the north gate at speed and went directly to the keep',
  'she heard the hooves in the courtyard from her window above',
  'she was at the door before the page had time to climb the stairs',
  'the letter was sealed with wax she did not recognize',
  'she broke it open and read it twice',
  'then she called for the duty officer and handed the letter across',
  'he read it and his expression did not change but his hands did',
  'he asked if the high warden had been informed',
  'she said the high warden had written the letter',
  'he was quiet for a moment and then asked what she needed',
  'she told him and he left immediately',
  'she went back to the window and looked north at the hills',
  'the sky above them was clear and the air very still',
  'the kind of still that comes before a change she thought',
  'there was perhaps a day before the news became impossible to contain',
  'she spent that day in motion from one end of the fortress to the other',
  'by evening everything that could be prepared had been',
  'she ate supper standing and had the horses saddled before the bell',
  'by midnight she was gone and the morning found the north gate standing open',
  'the duty officer folded the letter and locked it in the iron box',
  'he sat at his desk for a long while after that',
  'he had seen her face when she read the letter and he knew what it meant',
  'he began writing his own letters to the people he needed to warn',
  'by the time the noon bell rang the fortress felt different somehow',
].join('\n');

/* ── test cases ───────────────────────────────────────────────────────────── */

export const tests: TestCase[] = [
  {
    name: 'Ctrl+P project search returns results sorted by score: ch01.txt:1 ("rider" at start of line) is first',
    async fn() {
      const dir = createTempDir();
      try {
        /* Set up a minimal project: .git marker + 10 content files. */
        mkdirSync(`${dir}/.git`);
        writeFileSync(`${dir}/ch01.txt`, CH01, 'utf8');
        writeFileSync(`${dir}/ch02.txt`, CH02, 'utf8');
        writeFileSync(`${dir}/ch03.txt`, CH03, 'utf8');
        writeFileSync(`${dir}/ch04.txt`, CH04, 'utf8');
        writeFileSync(`${dir}/ch05.txt`, CH05, 'utf8');
        writeFileSync(`${dir}/ch06.txt`, CH06, 'utf8');
        writeFileSync(`${dir}/ch07.txt`, CH07, 'utf8');
        writeFileSync(`${dir}/ch08.txt`, CH08, 'utf8');
        writeFileSync(`${dir}/ch09.txt`, CH09, 'utf8');
        writeFileSync(`${dir}/ch10.txt`, CH10, 'utf8');

        /*
         * Start with cwd = dir so process.cwd() in the editor resolves to dir,
         * which makes findProjectRoot() return dir (the .git ancestor).
         * Project search is therefore scoped only to the 10 files above.
         */
        const t = new EditorTest(120, 30, dir);
        try {
          await t.start();
          t.assertLineContains(0, '[No File]');

          /* Open project search and type the needle. */
          await t.keys(KEY.CTRL_P, 400);   // open project-search panel
          await t.type('rider');             // needle = 'rider'
          await t.keys('', 500);            // extra idle to let async search complete

          /*
           * Verify that results are shown and that the top result is ch01.txt:1.
           *
           * Renderer places the first result at screen row 9 (0-indexed) for H=30:
           *   panelY   = floor(30 * 0.15) = 4
           *   inputRow = panelY + 2        = 6
           *   first result: T.moveTo(inputRow + 3 + 0 + 1) = T.moveTo(10) → row 9
           *
           * ch01.txt line 1 starts with "rider" → fuzzy score 80 (highest possible),
           * so it must be sorted first regardless of file-walk order.
           */
          t.assertLineContains(9, 'ch01.txt:1');

          /*
           * Also verify that at least one result from a different file appears
           * somewhere on screen below row 9, proving the list has multiple entries
           * and that ch01.txt:1 is genuinely first, not the only result.
           */
          const firstPos = t.screen.findText('ch01.txt:1');
          assert.ok(firstPos !== null, 'ch01.txt:1 must appear on screen');

          /* Find any result from another file (ch02–ch10). */
          let otherPos: { row: number; col: number } | null = null;
          for (let n = 2; n <= 10; n++) {
            const tag = `ch${String(n).padStart(2, '0')}.txt:`;
            otherPos = t.screen.findText(tag);
            if (otherPos !== null) break;
          }
          assert.ok(otherPos !== null, 'at least one result from ch02–ch10 must appear');
          assert.ok(
            firstPos!.row <= otherPos.row,
            `ch01.txt:1 (row ${firstPos!.row}) must appear before other results (row ${otherPos.row})`
          );

        } finally {
          t.cleanup();
        }
      } finally {
        removeTempDir(dir);
      }
    },
  },
];
