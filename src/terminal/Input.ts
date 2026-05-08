export interface KeyEvent {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  char: string;
}

export function parseKeys(data: Uint8Array): KeyEvent[] {
  const buf = data;
  const events: KeyEvent[] = [];
  let i = 0;

  while (i < buf.length) {
    const b = buf[i];

    if (b === 0x1b) {
      // Escape or escape sequence
      if (i + 1 >= buf.length) {
        events.push(ev('escape'));
        i++;
        continue;
      }

      const next = buf[i + 1];

      if (next === 0x5b) {
        // CSI: ESC [
        i += 2;
        const start = i;
        while (i < buf.length && (buf[i] < 0x40 || buf[i] > 0x7e)) i++;
        if (i < buf.length) {
          const seq = String.fromCharCode(...Array.from(buf.slice(start, i + 1)));
          const e = parseCSI(seq);
          if (e) events.push(e);
          i++;
        }
        continue;
      }

      if (next === 0x4f) {
        // SS3: ESC O (function keys on some terminals)
        i += 2;
        if (i < buf.length) {
          const ss3Map: Record<number, string> = {
            0x50: 'f1', 0x51: 'f2', 0x52: 'f3', 0x53: 'f4',
            0x48: 'home', 0x46: 'end',
            0x41: 'up', 0x42: 'down', 0x43: 'right', 0x44: 'left',
          };
          const key = ss3Map[buf[i]];
          if (key) events.push(ev(key));
          i++;
        }
        continue;
      }

      // Alt + key
      i++;
      const alt = parseOne(buf, i);
      if (alt) {
        events.push({ ...alt.event, alt: true });
        i += alt.bytes;
      } else {
        i++;
      }
      continue;
    }

    // Ctrl characters
    if (b === 0x0d || b === 0x0a) { events.push(ev('enter')); i++; continue; }
    if (b === 0x09) { events.push(ev('tab')); i++; continue; }
    if (b === 0x7f || b === 0x08) { events.push(ev('backspace')); i++; continue; }
    if (b === 0x00) { events.push({ key: ' ', ctrl: true, alt: false, shift: false, char: '' }); i++; continue; }

    if (b >= 0x01 && b <= 0x1a) {
      // Ctrl+A through Ctrl+Z
      const letter = String.fromCharCode(b + 0x60);
      events.push({ key: letter, ctrl: true, alt: false, shift: false, char: '' });
      i++;
      continue;
    }

    if (b === 0x1c) { events.push({ key: '\\', ctrl: true, alt: false, shift: false, char: '' }); i++; continue; }
    if (b === 0x1d) { events.push({ key: ']', ctrl: true, alt: false, shift: false, char: '' }); i++; continue; }
    if (b === 0x1e) { events.push({ key: '^', ctrl: true, alt: false, shift: false, char: '' }); i++; continue; }
    if (b === 0x1f) { events.push({ key: '_', ctrl: true, alt: false, shift: false, char: '' }); i++; continue; }

    // Regular character (potentially UTF-8)
    const parsed = parseOne(buf, i);
    if (parsed) {
      events.push(parsed.event);
      i += parsed.bytes;
    } else {
      i++;
    }
  }

  return events;
}

function ev(key: string): KeyEvent {
  return { key, ctrl: false, alt: false, shift: false, char: '' };
}

function parseOne(buf: Uint8Array, i: number): { event: KeyEvent; bytes: number } | null {
  if (i >= buf.length) return null;
  const b = buf[i];

  if (b >= 0x20 && b < 0x7f) {
    const ch = String.fromCharCode(b);
    return { event: { key: ch, ctrl: false, alt: false, shift: false, char: ch }, bytes: 1 };
  }

  // UTF-8 multi-byte
  let byteCount = 0;
  let cp = 0;
  if ((b & 0xe0) === 0xc0) { byteCount = 2; cp = b & 0x1f; }
  else if ((b & 0xf0) === 0xe0) { byteCount = 3; cp = b & 0x0f; }
  else if ((b & 0xf8) === 0xf0) { byteCount = 4; cp = b & 0x07; }

  if (byteCount > 0 && i + byteCount <= buf.length) {
    for (let j = 1; j < byteCount; j++) {
      cp = (cp << 6) | (buf[i + j] & 0x3f);
    }
    const ch = String.fromCodePoint(cp);
    return { event: { key: ch, ctrl: false, alt: false, shift: false, char: ch }, bytes: byteCount };
  }

  return null;
}

function parseCSI(seq: string): KeyEvent | null {
  const final = seq[seq.length - 1];
  const params = seq.slice(0, -1);
  const parts = params.split(';');

  // Modifier bits from param 2 (1-indexed): shift=1, alt=2, ctrl=4
  const modRaw = parts.length >= 2 ? (parseInt(parts[1]) || 1) : 1;
  const mod = modRaw - 1;
  const shift = (mod & 1) !== 0;
  const alt   = (mod & 2) !== 0;
  const ctrl  = (mod & 4) !== 0;
  const base = { ctrl, alt, shift, char: '' };

  switch (final) {
    case 'A': return { ...base, key: 'up' };
    case 'B': return { ...base, key: 'down' };
    case 'C': return { ...base, key: 'right' };
    case 'D': return { ...base, key: 'left' };
    case 'H': return { ...base, key: 'home' };
    case 'F': return { ...base, key: 'end' };
    case 'P': return { ...base, key: 'f1' };
    case 'Q': return { ...base, key: 'f2' };
    case 'S': return { ...base, key: 'f4' };
    case '~': {
      switch (parts[0]) {
        case '1': return { ...base, key: 'home' };
        case '3': return { ...base, key: 'delete' };
        case '4': return { ...base, key: 'end' };
        case '5': return { ...base, key: 'pageup' };
        case '6': return { ...base, key: 'pagedown' };
        case '7': return { ...base, key: 'home' };
        case '8': return { ...base, key: 'end' };
        case '11': return { ...base, key: 'f1' };
        case '12': return { ...base, key: 'f2' };
        case '13': return { ...base, key: 'f3' };
        case '14': return { ...base, key: 'f4' };
        case '15': return { ...base, key: 'f5' };
        case '17': return { ...base, key: 'f6' };
        case '18': return { ...base, key: 'f7' };
        case '19': return { ...base, key: 'f8' };
        case '20': return { ...base, key: 'f9' };
        case '21': return { ...base, key: 'f10' };
        case '23': return { ...base, key: 'f11' };
        case '24': return { ...base, key: 'f12' };
        case '200': return { ...base, key: 'bracketed-paste-start' };
        case '201': return { ...base, key: 'bracketed-paste-end' };
      }
      break;
    }
    case 'u': {
      // kitty keyboard protocol
      const codePoint = parseInt(parts[0]);
      if (!isNaN(codePoint)) {
        const ch = String.fromCodePoint(codePoint);
        return { ...base, key: ch, char: ctrl || alt ? '' : ch };
      }
      break;
    }
  }

  return null;
}
