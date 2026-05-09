import type { Layout } from './Layout.js';
import type { FileBrowser } from './FileBrowser.js';
import type { Highlighter } from '../highlight/Highlighter.js';
import { THEME } from '../highlight/tokens.js';
import type { DrawContext } from '../terminal/ScreenBuffer.js';

export type EditorMode = 'edit' | 'filebrowser' | 'search' | 'jstransform';

export function renderStatusBar(
  ctx: DrawContext,
  layout: Layout,
  mode: EditorMode,
  highlighter: Highlighter,
  fileBrowser: FileBrowser,
  message: string,
  termWidth: number,
  termHeight: number
): void {
  ctx.moveTo(termHeight - 1, 0); // last row, 0-indexed
  ctx.setBg(THEME.statusBg);
  ctx.setFg(THEME.statusFg);

  if (message) {
    ctx.write(message.padEnd(termWidth).slice(0, termWidth));
    ctx.reset();
    return;
  }

  const modeStr = mode === 'filebrowser'  ? ' BROWSE ' :
                  mode === 'search'       ? ' SEARCH ' :
                  mode === 'jstransform'  ? '   JS   ' : ' EDIT   ';

  if (mode === 'filebrowser') {
    const left = `${modeStr}  ${fileBrowser.currentDir}`;
    const line = left.slice(0, termWidth).padEnd(termWidth);
    ctx.setBold(true);
    ctx.write(line);
    ctx.reset();
    return;
  }

  const pane = layout.panes[layout.activePaneIndex];
  const buf = pane?.buffer;

  const fileName = buf ? (buf.filePath ?? '[No Name]') : '[No File]';
  const modifiedTag = buf?.modified ? ' MODIFIED' : '';
  const readonlyTag = buf?.readOnly ? ' READONLY' : '';
  const langName = buf ? highlighter.languageName(buf) : '';

  let position = '';
  if (buf) {
    const ln = pane.cursor.line + 1;
    const col = pane.cursor.col + 1;
    position = `${ln}:${col}`;
  }

  const left = `${modeStr}  ${fileName}${modifiedTag}${readonlyTag}`;
  const right = `${langName}  ${position} `;

  const mid = termWidth - left.length - right.length;
  const line = mid > 0 ? left + ' '.repeat(mid) + right : (left + right).slice(0, termWidth);

  ctx.setBold(true);
  ctx.write(line.slice(0, termWidth).padEnd(termWidth));
  ctx.reset();
}
