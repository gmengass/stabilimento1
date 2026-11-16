/** A free umbrella on one beach space, as quick book sees it. Line 1 is nearest the sea. */
export interface Umbrella {
  spotId: number;
  number: number;
  line: number;
  position: number;
  maxSunbeds: number;
}

/** Side by side in one line, in one line with gaps, or across lines. */
export type Layout = "adjacent" | "sameLine" | "split";

export interface SuggestedSpot {
  spotId: number;
  number: number;
  sunbeds: number;
}

export interface Suggestion {
  layout: Layout;
  /** In line order, then left to right. */
  spots: SuggestedSpot[];
}

export type SuggestResult =
  | { ok: true; suggestions: Suggestion[] }
  | { ok: false; error: "noFit"; free: number }
  | { ok: false; error: "tooManySunbeds" };

export const MAX_SUGGESTIONS = 5;

interface Candidate {
  layout: Layout;
  umbrellas: Umbrella[];
  /** Sort keys, compared in order: lower is a better suggestion. */
  rank: number[];
}

/**
 * Spreads the sunbeds as evenly as possible, the leftmost spots taking the remainder; a spot that
 * can't hold its share passes the rest to the next spots with room. Null if they can't all fit.
 */
export function spreadSunbeds(maxSunbeds: number[], sunbeds: number): number[] | null {
  const total = maxSunbeds.reduce((sum, max) => sum + max, 0);
  if (maxSunbeds.length === 0 || total < sunbeds) return null;
  const share = Math.floor(sunbeds / maxSunbeds.length);
  const extra = sunbeds % maxSunbeds.length;
  const spread = maxSunbeds.map((max, i) => Math.min(max, share + (i < extra ? 1 : 0)));
  let left = sunbeds - spread.reduce((sum, n) => sum + n, 0);
  for (let i = 0; left > 0; i++) {
    const room = Math.min(maxSunbeds[i] - spread[i], left);
    spread[i] += room;
    left -= room;
  }
  return spread;
}

function byPlace(a: Umbrella, b: Umbrella): number {
  return a.line - b.line || a.position - b.position;
}

/** Free umbrellas by line, nearest the sea first, each line left to right. */
function groupByLine(free: Umbrella[]): Umbrella[][] {
  const lines = new Map<number, Umbrella[]>();
  for (const umbrella of [...free].sort(byPlace)) {
    lines.set(umbrella.line, [...(lines.get(umbrella.line) ?? []), umbrella]);
  }
  return [...lines.values()];
}

function isAdjacent(run: Umbrella[]): boolean {
  return run.every((u, i) => i === 0 || u.position === run[i - 1].position + 1);
}

/** Every run of `count` umbrellas next to each other in a line's free list. */
function inLine(lines: Umbrella[][], count: number): Candidate[] {
  return lines.flatMap((line) =>
    Array.from({ length: Math.max(0, line.length - count + 1) }, (_, start) => {
      const run = line.slice(start, start + count);
      const span = run[run.length - 1].position - run[0].position;
      return isAdjacent(run)
        ? { layout: "adjacent" as const, umbrellas: run, rank: [0, run[0].line, run[0].position] }
        : {
            layout: "sameLine" as const,
            umbrellas: run,
            rank: [1, span, run[0].line, run[0].position],
          };
    }),
  );
}

/** The `count` umbrellas of a line closest to a position, the left one winning a tie. */
function closestTo(line: Umbrella[], position: number, count: number): Umbrella[] {
  const distance = (u: Umbrella) => Math.abs(u.position - position);
  return [...line]
    .sort((a, b) => distance(a) - distance(b) || a.position - b.position)
    .slice(0, count);
}

/** Starting at each line, fill whole lines outwards and top up from the last one. */
function acrossLines(lines: Umbrella[][], count: number): Candidate[] {
  if (count < 2) return [];
  const candidates: Candidate[] = [];
  for (let first = 0; first < lines.length; first++) {
    const taken: Umbrella[] = [];
    let last = first;
    while (last < lines.length && taken.length + lines[last].length < count) {
      taken.push(...lines[last]);
      last++;
    }
    if (last >= lines.length || last === first) continue;
    const mean = taken.reduce((sum, u) => sum + u.position, 0) / taken.length;
    const umbrellas = [...taken, ...closestTo(lines[last], mean, count - taken.length)].sort(
      byPlace,
    );
    const positions = umbrellas.map((u) => u.position);
    const lineSpan = lines[last][0].line - lines[first][0].line;
    const spread = Math.max(...positions) - Math.min(...positions);
    candidates.push({
      layout: "split",
      umbrellas,
      rank: [2, lineSpan, spread, lines[first][0].line],
    });
  }
  return candidates;
}

function compareRanks(a: Candidate, b: Candidate): number {
  for (let i = 0; i < Math.max(a.rank.length, b.rank.length); i++) {
    const diff = (a.rank[i] ?? 0) - (b.rank[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function withSunbeds(candidate: Candidate, sunbeds: number): Suggestion | null {
  const spread = spreadSunbeds(
    candidate.umbrellas.map((u) => u.maxSunbeds),
    sunbeds,
  );
  if (!spread) return null;
  return {
    layout: candidate.layout,
    spots: candidate.umbrellas.map((u, i) => ({
      spotId: u.spotId,
      number: u.number,
      sunbeds: spread[i],
    })),
  };
}

/**
 * Suggests umbrellas for a quick booking: side by side in one line first, nearest the sea and
 * leftmost first; then the closest umbrellas in one line; then the closest across lines. Only
 * groups that can hold all the sunbeds are suggested. Same input, same suggestions.
 */
export function suggestSpots(free: Umbrella[], umbrellas: number, sunbeds: number): SuggestResult {
  if (free.length < umbrellas) return { ok: false, error: "noFit", free: free.length };
  const lines = groupByLine(free);
  const suggestions = [...inLine(lines, umbrellas), ...acrossLines(lines, umbrellas)]
    .sort(compareRanks)
    .map((candidate) => withSunbeds(candidate, sunbeds))
    .filter((suggestion): suggestion is Suggestion => suggestion !== null)
    .slice(0, MAX_SUGGESTIONS);
  if (suggestions.length === 0) return { ok: false, error: "tooManySunbeds" };
  return { ok: true, suggestions };
}
