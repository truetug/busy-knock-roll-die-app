// A deck's idea of "better": a score for each of its items. Only the dial's nudge (draw.ts) reads it; without scores the dial
// changes nothing but what is on the screen.
//
// The header line `LUCK=` says where the scores come from:
//   LUCK=number        the score of an item is its number (dice: a higher face is better)
//   LUCK=2*10,1*5,0*5  runs of `score*count`, in the order of the items: the first 10 score 2, the next 5 score 1, the last 5 score 0
// A higher score is better; items with the same score are equally good and are never told apart by the nudge.

/** Scores of the items 1..count, or throws an Error saying what is wrong with `spec`. */
export function parseLuck(spec: string, count: number): number[] {
  if (spec === "number") return Array.from({ length: count }, (_, i) => i + 1);

  const scores: number[] = [];
  for (const run of spec.split(",")) {
    const m = /^(\d+)\*(\d+)$/.exec(run.trim());
    if (m === null) throw new Error(`bad LUCK run "${run.trim()}" (expected score*count)`);
    for (let i = 0; i < Number(m[2]); i++) scores.push(Number(m[1]));
  }
  if (scores.length !== count) throw new Error(`LUCK covers ${scores.length} items, the deck has ${count}`);
  return scores;
}
