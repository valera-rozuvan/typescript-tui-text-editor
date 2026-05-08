import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const _require = createRequire(import.meta.url);
const _dirname = dirname(fileURLToPath(import.meta.url));
const native = _require(join(_dirname, '../pty/build/Release/pty_native.node'));
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
export class PtyProcess {
    fd;
    pid;
    _closed = false;
    cols;
    rows;
    constructor(execPath, args = [], cols = 120, rows = 30, cwd) {
        this.cols = cols;
        this.rows = rows;
        const result = native.spawn(execPath, args, cols, rows, cwd);
        this.fd = result.fd;
        this.pid = result.pid;
    }
    write(data) {
        if (this._closed)
            return;
        const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
        native.write(this.fd, buf);
    }
    /* Non-blocking read — returns null when no data is available. */
    readSync() {
        if (this._closed)
            return null;
        const chunk = native.read(this.fd);
        if (chunk === null || chunk.length === 0)
            return null;
        return chunk.toString('utf8');
    }
    /*
     * Accumulates all output until the PTY is silent for `idleMs` milliseconds,
     * or `maxWaitMs` elapses in total.  Uses a 15 ms event-loop yield between
     * polls so callers can use async/await naturally.
     */
    async readOutput(idleMs = 250, maxWaitMs = 6000) {
        let result = '';
        const deadline = Date.now() + maxWaitMs;
        let lastDataAt = -1;
        while (Date.now() < deadline) {
            const chunk = this.readSync();
            if (chunk !== null) {
                result += chunk;
                lastDataAt = Date.now();
            }
            else {
                if (lastDataAt >= 0 && Date.now() - lastDataAt >= idleMs)
                    break;
                await sleep(15);
            }
        }
        return result;
    }
    isAlive() {
        if (this._closed)
            return false;
        const { exited } = native.waitpid(this.pid, true);
        return !exited;
    }
    resize(cols, rows) {
        if (!this._closed)
            native.resize(this.fd, cols, rows);
    }
    kill(signal = 15) {
        if (!this._closed) {
            try {
                native.kill(this.pid, signal);
            }
            catch { }
        }
    }
    close() {
        if (!this._closed) {
            this._closed = true;
            try {
                native.close(this.fd);
            }
            catch { }
        }
    }
    /* Send SIGTERM + SIGKILL then block until the child exits. */
    cleanup() {
        if (this._closed)
            return;
        try {
            native.kill(this.pid, 15);
        }
        catch { }
        try {
            native.kill(this.pid, 9);
        }
        catch { }
        try {
            native.waitpid(this.pid, false);
        }
        catch { }
        this.close();
    }
}
