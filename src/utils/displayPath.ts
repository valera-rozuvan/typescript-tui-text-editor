export function displayPath(p: string): string {
  return process.platform === 'win32' ? p.replace(/\\/g, '/') : p;
}
