import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { homedir } from 'os';
import { fuzzyMatch } from './FuzzyMatcher.js';
import { sortByScore } from '../util.js';

export interface ProjectSearchResult {
  filePath: string;
  line: number;
  col: number;
  snippet: string;
  matchIndices: number[];
  score: number;
}

const SKIP_DIRS = new Set(['.git', 'node_modules', '.next', 'dist', 'build', '__pycache__', '.cache']);
const BINARY_EXTS = new Set([
  '.png','.jpg','.jpeg','.gif','.ico','.svg','.webp','.bmp',
  '.pdf','.zip','.tar','.gz','.br','.wasm','.bin','.exe','.dll','.so',
  '.ttf','.woff','.woff2','.otf','.eot',
  '.mp3','.mp4','.wav','.ogg','.flac','.avi','.mov',
  '.lock', // lock files are large and uninteresting
]);

export function findProjectRoot(startDir: string): string {
  const home = homedir();
  let dir = resolve(startDir);

  while (true) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir || dir === home) return dir;
    dir = parent;
  }
}

function* walkFiles(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const name of entries) {
    if (name.startsWith('.')) continue;
    const fullPath = join(dir, name);
    try {
      const st = statSync(fullPath);
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(name)) yield* walkFiles(fullPath);
      } else if (st.isFile()) {
        const ext = name.slice(name.lastIndexOf('.'));
        if (!BINARY_EXTS.has(ext.toLowerCase())) yield fullPath;
      }
    } catch {
      // ignore
    }
  }
}

export async function searchProject(
  needle: string,
  startDir: string,
  onResults: (results: ProjectSearchResult[]) => void,
  signal: { cancelled: boolean },
  maxResults = 200
): Promise<void> {
  if (!needle) return;

  const root = findProjectRoot(startDir);
  const results: ProjectSearchResult[] = [];
  let fileCount = 0;

  for (const filePath of walkFiles(root)) {
    if (signal.cancelled) return;
    if (results.length >= maxResults) break;

    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    // Quick pre-filter: check if all needle chars appear in file
    const lContent = content.toLowerCase();
    const lNeedle = needle.toLowerCase();
    let allPresent = true;
    for (const ch of lNeedle) {
      if (!lContent.includes(ch)) { allPresent = false; break; }
    }
    if (!allPresent) continue;

    const lines = content.split('\n');
    for (let ln = 0; ln < lines.length && results.length < maxResults; ln++) {
      const line = lines[ln];
      const match = fuzzyMatch(needle, line);
      if (match) {
        results.push({
          filePath,
          line: ln,
          col: match.indices[0] ?? 0,
          snippet: line.slice(0, 200),
          matchIndices: match.indices,
          score: match.score,
        });
      }
    }

    fileCount++;
    // Yield to the event loop every 20 files to keep the UI responsive
    if (fileCount % 20 === 0) {
      sortByScore(results);
      onResults([...results]);
      await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
    }
  }

  results.sort((a, b) => b.score - a.score);
  onResults([...results]);
}
