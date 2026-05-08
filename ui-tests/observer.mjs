#!/usr/bin/env node
/*
 * ui-tests/observer.mjs — attach to a running --debug test session.
 *
 * Usage:
 *   node ui-tests/observer.mjs <socket-path>
 *
 * Controls (once connected):
 *   ENTER / Space / n  →  advance one step
 *   r                  →  run to end of current test (no more pauses)
 *   a                  →  run all remaining tests without pausing
 *   q / Ctrl+C         →  disconnect and exit
 */

import net from 'node:net';

const socketPath = process.argv[2];
if (!socketPath) {
  console.error('Usage: node ui-tests/observer.mjs <socket-path>');
  process.exit(1);
}

const socket = net.connect({ path: socketPath });
let incoming = '';

/* ── stdin raw mode ──────────────────────────────────────────────────────── */

process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding('utf8');

/* ── initial display ─────────────────────────────────────────────────────── */

write('\x1b[2J\x1b[H');
write('UI Test Observer\n');
write(`Connecting to: ${socketPath}\n`);

/* ── socket events ───────────────────────────────────────────────────────── */

socket.on('connect', () => {
  write('\x1b[2J\x1b[H');
  write('Connected. Waiting for first step...\n\n');
  write('\x1b[2m[ENTER/n] next   [r] run to end of test   [a] run all   [q] quit\x1b[0m\n');
});

socket.on('error', (err) => {
  write(`\nConnection error: ${err.message}\n`);
  process.exit(1);
});

socket.on('data', (data) => {
  incoming += data.toString('utf8');
  const lines = incoming.split('\n');
  incoming = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try { handleMsg(JSON.parse(line)); } catch {}
  }
});

socket.on('close', () => {
  write('\n\x1b[90mDebug session ended.\x1b[0m\n');
  process.stdin.setRawMode(false);
  process.exit(0);
});

/* ── message handler ─────────────────────────────────────────────────────── */

function handleMsg(msg) {
  if (msg.type === 'step') {
    renderStep(msg);
  } else if (msg.type === 'test_pass') {
    write(`  \x1b[32m✓\x1b[0m ${msg.test}\n`);
  } else if (msg.type === 'test_fail') {
    write(`  \x1b[31m✗\x1b[0m ${msg.test}\n`);
    const firstLine = String(msg.error).split('\n')[0];
    write(`    \x1b[31m${firstLine}\x1b[0m\n`);
  } else if (msg.type === 'done') {
    write('\n\x1b[1mAll tests finished.\x1b[0m\n');
    process.stdin.setRawMode(false);
    process.exit(0);
  }
}

/* ── screen renderer ─────────────────────────────────────────────────────── */

function renderStep({ suite, test, action, screen, cursor }) {
  const cols = screen[0]?.length ?? 120;

  write('\x1b[2J\x1b[H');

  /* header */
  write(`Suite:  \x1b[1m${suite}\x1b[0m\n`);
  write(`Test:   ${test}\n`);
  write(`Action: \x1b[33m${action}\x1b[0m\n`);
  write('\n');

  /* virtual screen with border */
  const bar = '─'.repeat(cols + 2);
  write(`\x1b[90m┌${bar}┐\x1b[0m\n`);
  for (let r = 0; r < screen.length; r++) {
    const row = screen[r];
    let displayRow;
    if (r === cursor.row && cursor.col < row.length) {
      displayRow =
        row.slice(0, cursor.col) +
        `\x1b[7m${row[cursor.col]}\x1b[0m` +
        row.slice(cursor.col + 1);
    } else {
      displayRow = row;
    }
    write(`\x1b[90m│\x1b[0m ${displayRow} \x1b[90m│\x1b[0m\n`);
  }
  write(`\x1b[90m└${bar}┘\x1b[0m\n`);

  write(`\nCursor: row=${cursor.row} col=${cursor.col}\n`);
  write('\n\x1b[2m[ENTER/n] next step   [r] run to end of test   [a] run all   [q] quit\x1b[0m\n');
}

/* ── keypress handler ────────────────────────────────────────────────────── */

process.stdin.on('data', (key) => {
  if (key === '\r' || key === '\n' || key === 'n' || key === ' ') {
    send({ type: 'next' });
  } else if (key === 'r') {
    send({ type: 'run' });
    write('\x1b[90m(running to end of test...)\x1b[0m\n');
  } else if (key === 'a') {
    send({ type: 'run_all' });
    write('\x1b[90m(running all remaining tests...)\x1b[0m\n');
  } else if (key === 'q' || key === '\x03') {
    socket.destroy();
    process.stdin.setRawMode(false);
    process.exit(0);
  }
});

/* ── helpers ─────────────────────────────────────────────────────────────── */

function send(msg) {
  try { socket.write(JSON.stringify(msg) + '\n'); } catch {}
}

function write(s) {
  process.stdout.write(s);
}
