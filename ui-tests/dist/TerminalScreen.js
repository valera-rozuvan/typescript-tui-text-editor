/*
 * TerminalScreen — lightweight VT100 / ANSI-sequence parser.
 *
 * It maintains a 2-D character grid and interprets the subset of ANSI escape
 * sequences emitted by the editor:
 *
 *   ESC[row;colH / ESC[H   cursor position (1-indexed)
 *   ESC[2J                 clear screen
 *   ESC[K / ESC[0K         clear to end of line
 *   ESC[...m               SGR (colors, bold …) — ignored for content
 *   ESC[?25l / ESC[?25h    cursor show/hide — ignored
 *   Other CSI / OSC        silently skipped
 *
 * All other bytes are treated as printable characters and placed at the
 * current cursor position.  UTF-8 sequences arrive already decoded by
 * Node.js Buffer.toString(), so every JS character is one column wide.
 */
export class TerminalScreen {
    cols;
    rows;
    grid;
    cursorRow = 0;
    cursorCol = 0;
    constructor(cols, rows) {
        this.cols = cols;
        this.rows = rows;
        this.grid = this._blank();
    }
    /* Feed raw terminal output (already decoded from UTF-8) into the parser. */
    feed(data) {
        let i = 0;
        while (i < data.length) {
            const ch = data[i];
            const code = data.charCodeAt(i);
            if (ch === '\x1b') {
                i = this._parseEscape(data, i);
            }
            else if (ch === '\r') {
                this.cursorCol = 0;
                i++;
            }
            else if (ch === '\n') {
                this.cursorRow = Math.min(this.cursorRow + 1, this.rows - 1);
                i++;
            }
            else if (ch === '\t') {
                this.cursorCol = Math.min(this.cols - 1, (Math.floor(this.cursorCol / 8) + 1) * 8);
                i++;
            }
            else if (code >= 0x20) {
                /* Printable character (includes multi-byte Unicode already in JS string) */
                if (this.cursorRow < this.rows && this.cursorCol < this.cols) {
                    this.grid[this.cursorRow][this.cursorCol] = ch;
                }
                if (this.cursorCol < this.cols - 1)
                    this.cursorCol++;
                i++;
            }
            else {
                i++; /* skip other control chars */
            }
        }
    }
    /* Return the raw content of a row (padded to this.cols with spaces). */
    getLine(row) {
        if (row < 0 || row >= this.rows)
            return ' '.repeat(this.cols);
        return this.grid[row].join('');
    }
    /* Return the row with trailing spaces stripped. */
    getLineTrimmed(row) {
        return this.getLine(row).trimEnd();
    }
    /* True if `text` appears anywhere on screen. */
    containsText(text) {
        for (let r = 0; r < this.rows; r++) {
            if (this.getLine(r).includes(text))
                return true;
        }
        return false;
    }
    /* Find the first occurrence of `text` on screen; null if absent. */
    findText(text) {
        for (let r = 0; r < this.rows; r++) {
            const idx = this.getLine(r).indexOf(text);
            if (idx >= 0)
                return { row: r, col: idx };
        }
        return null;
    }
    /*
     * True if `text` appears somewhere within the column range [colStart, colEnd)
     * on any row.  Useful for verifying that content is in the correct pane.
     */
    containsTextInCols(text, colStart, colEnd) {
        for (let r = 0; r < this.rows; r++) {
            const slice = this.getLine(r).slice(colStart, colEnd);
            if (slice.includes(text))
                return true;
        }
        return false;
    }
    /* Human-readable dump for failure messages. */
    dump() {
        const lines = [];
        for (let r = 0; r < this.rows; r++) {
            const content = this.getLine(r);
            lines.push(`${String(r).padStart(2)}: ${content}`);
        }
        return lines.join('\n');
    }
    /* Reset the screen to the startup state. */
    reset() {
        this.grid = this._blank();
        this.cursorRow = 0;
        this.cursorCol = 0;
    }
    /* ── private ─────────────────────────────────────────────────── */
    _blank() {
        return Array.from({ length: this.rows }, () => Array(this.cols).fill(' '));
    }
    /*
     * Parse an escape sequence starting at position `i` (the ESC byte).
     * Returns the index of the first byte after the sequence.
     */
    _parseEscape(data, i) {
        const next = data[i + 1];
        if (next === '[') {
            return this._parseCSI(data, i + 2);
        }
        if (next === ']') {
            /* OSC — terminated by BEL or ST (ESC \) */
            let j = i + 2;
            while (j < data.length) {
                if (data[j] === '\x07')
                    return j + 1;
                if (data[j] === '\x1b' && data[j + 1] === '\\')
                    return j + 2;
                j++;
            }
            return j;
        }
        /* Unknown two-byte sequence or lone ESC at end */
        return i + (next !== undefined ? 2 : 1);
    }
    /*
     * Parse a CSI sequence.  `i` is the index of the first parameter byte,
     * after ESC [.  Returns the index after the final byte.
     */
    _parseCSI(data, i) {
        const start = i;
        /* Consume until a "final" byte in 0x40–0x7E */
        while (i < data.length) {
            const code = data.charCodeAt(i);
            if (code >= 0x40 && code <= 0x7e)
                break;
            i++;
        }
        if (i >= data.length)
            return i;
        const params = data.slice(start, i);
        const cmd = data[i];
        this._handleCSI(params, cmd);
        return i + 1;
    }
    _handleCSI(params, cmd) {
        if (cmd === 'H' || cmd === 'f') {
            /* Cursor position: ESC[row;colH  (1-indexed; defaults to 1) */
            const parts = params.split(';');
            const row = Math.max(0, (parseInt(parts[0], 10) || 1) - 1);
            const col = Math.max(0, (parseInt(parts[1] ?? '', 10) || 1) - 1);
            this.cursorRow = Math.min(row, this.rows - 1);
            this.cursorCol = Math.min(col, this.cols - 1);
        }
        else if (cmd === 'J') {
            const n = parseInt(params.replace(/\?/g, ''), 10);
            if (n === 2 || n === 3) {
                /* Erase entire screen */
                this.grid = this._blank();
                this.cursorRow = 0;
                this.cursorCol = 0;
            }
            else if (n === 0 || params === '') {
                /* Erase from cursor to end of screen */
                for (let c = this.cursorCol; c < this.cols; c++) {
                    if (this.cursorRow < this.rows)
                        this.grid[this.cursorRow][c] = ' ';
                }
                for (let r = this.cursorRow + 1; r < this.rows; r++) {
                    this.grid[r] = Array(this.cols).fill(' ');
                }
            }
        }
        else if (cmd === 'K') {
            const n = parseInt(params, 10);
            if (n === 0 || params === '') {
                /* Erase to end of line */
                for (let c = this.cursorCol; c < this.cols; c++) {
                    if (this.cursorRow < this.rows)
                        this.grid[this.cursorRow][c] = ' ';
                }
            }
            else if (n === 2) {
                /* Erase entire line */
                if (this.cursorRow < this.rows) {
                    this.grid[this.cursorRow] = Array(this.cols).fill(' ');
                }
            }
        }
        /* SGR (m), cursor show/hide (h/l), and all other sequences are ignored. */
    }
}
