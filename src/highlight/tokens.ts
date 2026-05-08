export type TokenType =
  | 'normal' | 'keyword' | 'string' | 'number' | 'comment'
  | 'operator' | 'punctuation' | 'type' | 'function' | 'property'
  | 'variable' | 'constant' | 'tag' | 'attribute' | 'selector'
  | 'value' | 'heading' | 'emphasis' | 'strong' | 'link' | 'code'
  | 'directive';

export interface Token {
  type: TokenType;
  start: number;
  length: number;
}

export type LineTokens = Token[];

export interface TokenizerState {
  inBlockComment: boolean;
  inMultiLineString: boolean;
  multiLineStringChar: string;
}

export function defaultState(): TokenizerState {
  return { inBlockComment: false, inMultiLineString: false, multiLineStringChar: '' };
}

export interface Tokenizer {
  tokenizeLine(line: string, state: TokenizerState): { tokens: LineTokens; nextState: TokenizerState };
}

// Catppuccin Mocha palette RGB
export const THEME = {
  bg:            [30, 30, 46]   as [number,number,number],
  bgAlt:         [24, 24, 37]   as [number,number,number],
  surface0:      [49, 50, 68]   as [number,number,number],
  surface1:      [69, 71, 90]   as [number,number,number],
  surface2:      [88, 91, 112]  as [number,number,number],
  fg:            [205,214,244]  as [number,number,number],
  fgDim:         [166,173,200]  as [number,number,number],
  subtext:       [147,153,178]  as [number,number,number],
  overlay:       [108,112,134]  as [number,number,number],
  blue:          [137,180,250]  as [number,number,number],
  green:         [166,227,161]  as [number,number,number],
  yellow:        [249,226,175]  as [number,number,number],
  peach:         [250,179,135]  as [number,number,number],
  red:           [243,139,168]  as [number,number,number],
  mauve:         [203,166,247]  as [number,number,number],
  pink:          [245,194,231]  as [number,number,number],
  teal:          [148,226,213]  as [number,number,number],
  sky:           [137,220,235]  as [number,number,number],
  lavender:      [180,190,254]  as [number,number,number],
  // semantic
  titleActiveBg: [49, 50, 68]   as [number,number,number],
  titleInactiveBg:[24,24,37]    as [number,number,number],
  titleActiveFg: [205,214,244]  as [number,number,number],
  titleInactiveFg:[108,112,134] as [number,number,number],
  gutterFg:      [108,112,134]  as [number,number,number],
  currentLineBg: [40, 40, 60]   as [number,number,number],
  statusBg:      [17, 17, 27]   as [number,number,number],
  statusFg:      [205,214,244]  as [number,number,number],
  borderActive:  [137,180,250]  as [number,number,number],
  borderInactive:[69, 71, 90]   as [number,number,number],
  selectionBg:   [69, 71, 90]   as [number,number,number],
  searchMatchFg: [249,226,175]  as [number,number,number],
  searchMatchBg: [69, 71, 90]   as [number,number,number],
};

export function tokenColor(type: TokenType): [number,number,number] {
  switch (type) {
    case 'keyword':    return THEME.blue;
    case 'string':     return THEME.green;
    case 'number':     return THEME.peach;
    case 'comment':    return THEME.overlay;
    case 'function':   return THEME.mauve;
    case 'type':       return THEME.yellow;
    case 'property':   return THEME.sky;
    case 'variable':   return THEME.fg;
    case 'constant':   return THEME.peach;
    case 'operator':   return THEME.blue;
    case 'punctuation':return THEME.fgDim;
    case 'tag':        return THEME.red;
    case 'attribute':  return THEME.yellow;
    case 'selector':   return THEME.mauve;
    case 'value':      return THEME.green;
    case 'heading':    return THEME.blue;
    case 'emphasis':   return THEME.pink;
    case 'strong':     return THEME.peach;
    case 'link':       return THEME.teal;
    case 'code':       return THEME.green;
    case 'directive':  return THEME.teal;
    default:           return THEME.fg;
  }
}
