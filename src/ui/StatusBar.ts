import type { Layout } from './Layout.js';
import type { Highlighter } from '../highlight/Highlighter.js';
import { Terminal } from '../terminal/Terminal.js';
import { THEME } from '../highlight/tokens.js';

export type EditorMode = 'edit' | 'filebrowser' | 'search';

export function renderStatusBar(
  layout: Layout,
  mode: EditorMode,
  highlighter: Highlighter,
  message: string,
  termWidth: number,
  termHeight: number
): string {
  let out = '';
  out += Terminal.moveTo(termHeight, 1); // last row, 1-indexed
  out += Terminal.bgRgb(THEME.statusBg);
  out += Terminal.fgRgb(THEME.statusFg);

  if (message) {
    out += message.padEnd(termWidth).slice(0, termWidth);
    out += Terminal.reset;
    return out;
  }

  const pane = layout.panes[layout.activePaneIndex];
  const buf = pane?.buffer;

  const modeStr = mode === 'filebrowser' ? ' BROWSE ' :
                  mode === 'search'      ? ' SEARCH ' : ' EDIT   ';

  const fileName = buf ? (buf.filePath ?? '[No Name]') : '[No File]';
  const modified = buf?.modified ? ' ●' : '';
  const langName = buf ? highlighter.languageName(buf) : '';

  let position = '';
  if (buf) {
    const ln = pane.cursor.line + 1;
    const col = pane.cursor.col + 1;
    position = `${ln}:${col}`;
  }

  const left = `${modeStr}  ${fileName}${modified}`;
  const right = `${langName}  ${position} `;

  const mid = termWidth - left.length - right.length;
  const line = mid > 0 ? left + ' '.repeat(mid) + right : (left + right).slice(0, termWidth);

  out += Terminal.bold;
  out += line.slice(0, termWidth).padEnd(termWidth);
  out += Terminal.reset;

  return out;
}
