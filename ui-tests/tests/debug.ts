import type { DebugServer } from './DebugServer.js';

export let activeDebugServer: DebugServer | null = null;

export function setDebugServer(s: DebugServer | null): void {
  activeDebugServer = s;
}
