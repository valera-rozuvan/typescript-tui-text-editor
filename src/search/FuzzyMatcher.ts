export interface FuzzyMatch {
  score: number;
  indices: number[];
}

export function fuzzyMatch(needle: string, haystack: string): FuzzyMatch | null {
  if (needle.length === 0) return { score: 0, indices: [] };
  if (needle.length > haystack.length) return null;

  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();

  // Find matching indices
  const indices: number[] = [];
  let hi = 0;
  for (let ni = 0; ni < n.length; ni++) {
    let found = false;
    while (hi < h.length) {
      if (h[hi] === n[ni]) {
        indices.push(hi);
        hi++;
        found = true;
        break;
      }
      hi++;
    }
    if (!found) return null;
  }

  // Score the match
  let score = 0;

  // Bonus for matches at start
  if (indices[0] === 0) score += 10;

  // Bonus for consecutive matches
  let consecutive = 1;
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === indices[i - 1] + 1) {
      consecutive++;
      score += consecutive * 5;
    } else {
      consecutive = 1;
    }
  }

  // Bonus for matches after word boundaries
  for (const idx of indices) {
    if (idx === 0) continue;
    const prev = haystack[idx - 1];
    if (prev === ' ' || prev === '/' || prev === '_' || prev === '-' || prev === '.') {
      score += 8;
    }
    if (prev >= 'a' && prev <= 'z' && haystack[idx] >= 'A' && haystack[idx] <= 'Z') {
      score += 8; // camelCase boundary
    }
  }

  // Penalty for gap size
  let totalGap = 0;
  for (let i = 1; i < indices.length; i++) {
    totalGap += indices[i] - indices[i - 1] - 1;
  }
  score -= totalGap;

  // Penalty for distance from start
  score -= indices[0];

  return { score, indices };
}

export function fuzzyFilter<T>(
  needle: string,
  items: T[],
  key: (item: T) => string
): Array<{ item: T; match: FuzzyMatch }> {
  if (needle.length === 0) {
    return items.map(item => ({ item, match: { score: 0, indices: [] } }));
  }

  const results: Array<{ item: T; match: FuzzyMatch }> = [];
  for (const item of items) {
    const match = fuzzyMatch(needle, key(item));
    if (match) results.push({ item, match });
  }
  results.sort((a, b) => b.match.score - a.match.score);
  return results;
}
