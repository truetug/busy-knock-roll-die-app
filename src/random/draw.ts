// How a card is drawn. Pure: it takes the numbers a generator (rng.ts) has given and the pool, and returns a choice.
// Everything is spelled out in docs/RANDOMNESS.md; this is the short version.
//
//   1. At the LAUNCH of the wheel two hidden numbers are drawn, u and v, uniform in [0, 1) (`launchFate`).
//   2. While it spins, each turn of the dial the wheel reacts to nudges u towards the good end, a little less each time (`pull`).
//   3. At the STOP the card is worked out from u, v, the nudge, the pool and the deck's scores (`resolve`). Nothing random is
//      left to chance at that point: the same inputs always give the same card.
//
// With no turns of the dial there is no nudge, and the card is uniform over the pool: every item left has probability exactly
// 1 / pool.length. A deck whose results may repeat leaves the pool as it is (every draw uniform over all items, independent);
// any other deck takes the drawn item out (`take`), so the next draw is uniform over what remains - a perfectly shuffled pile dealt.

import type { Rng } from "./rng.ts";

/** The two hidden numbers of a draw. `u` picks how good the card is (what the dial can nudge); `v` picks among equally good cards. */
export type Fate = { u: number; v: number };

export type Draw = {
  /** Position of the drawn item in the pool. */
  index: number;
  /** The item: its number, 1-based. */
  value: number;
};

/** How much the first turn of the dial pulls (0.3 = 30% of the way), and how much of that the next turn keeps. */
const PULL_FIRST = 0.3;
const PULL_KEEP = 0.6;

/**
 * The strength of the nudge after `turns` turns: gamma = (1 - a1)(1 - a2)...(1 - a_turns) with a_k = PULL_FIRST * PULL_KEEP^(k-1).
 * 1 means no nudge; smaller is stronger. It falls by less each turn and never goes below PULL_LIMIT (about 0.43), so the dial
 * can tilt the odds but never take over.
 */
export function pull(turns: number): number {
  let gamma = 1;
  let a = PULL_FIRST;
  for (let k = 0; k < turns; k++) {
    gamma *= 1 - a;
    a *= PULL_KEEP;
  }
  return gamma;
}

/** Where gamma ends up after any number of turns. */
export const PULL_LIMIT = pull(60);

/** The hidden numbers of a draw, taken from the generator. Exactly two calls, whatever happens afterwards. */
export function launchFate(rng: Rng): Fate {
  return { u: rng.float(), v: rng.float() };
}

/** The pool of a fresh reading: the items 1..count, in order. (The order does not matter - the draw does not read it.) */
export function fullPool(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i + 1);
}

/**
 * The card for `fate` after a nudge of strength `gamma`, from `pool`; `scores` are the deck's (null: no nudge possible).
 *
 * The items left are grouped by score. The nudged number u' = u^gamma (for gamma < 1 it is pushed towards 1, never past it) falls
 * into one group - the group of the worst items owns the lowest part of [0, 1), in proportion to its size, the best the highest -
 * and v picks uniformly inside it. With gamma = 1, u' is uniform and so is the card. With gamma < 1 the group that owns the
 * interval [a, b) of [0, 1) comes up with probability b^(1/gamma) - a^(1/gamma), which docs/RANDOMNESS.md works out and
 * tools/monte-carlo.ts checks.
 */
export function resolve(pool: readonly number[], scores: readonly number[] | null, fate: Fate, gamma: number): Draw {
  if (pool.length === 0) throw new RangeError("nothing to draw from: the pool is empty");

  const groups = new Map<number, number[]>(); // score -> positions in the pool, in order
  for (let index = 0; index < pool.length; index++) {
    const score = scores === null ? 0 : scores[pool[index] - 1];
    const group = groups.get(score);
    if (group === undefined) groups.set(score, [index]);
    else group.push(index);
  }
  const ranked = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([, positions]) => positions);

  // u' * pool.length is where we land on a line that holds the worst item first and the best last.
  const at = fate.u ** gamma * pool.length;
  let before = 0;
  let group = ranked[ranked.length - 1];
  for (const candidate of ranked) {
    if (at < before + candidate.length) {
      group = candidate;
      break;
    }
    before += candidate.length;
  }
  const index = group[Math.min(group.length - 1, Math.floor(fate.v * group.length))];
  return { index, value: pool[index] };
}

/** Takes a drawn item out of the pool, unless the deck lets results repeat. The pool must be as it was when `chosen` was worked out. */
export function take(pool: number[], chosen: Draw, repeat: boolean): void {
  if (!repeat) pool.splice(chosen.index, 1);
}
