// Monte Carlo test of the randomizer: `pnpm monte-carlo [--items 78] [--trials 200000] [--seed 1] [--repeat] [--luck SPEC]`
//
// Runs the app's own draw code (src/random: the generator, the pool, the draw) many times and tests, with Pearson's chi-square,
// what docs/RANDOMNESS.md promises:
//   no repeats (a card deck):  1. the first draw is uniform over the items
//                              2. dealing a whole deck gives each item each position with equal probability
//                              3. the second draw, whatever the first was, is uniform over the items that remain
//   repeats (dice, 8 ball):    1. a draw is uniform over the items
//                              2. two draws in a row are independent: every pair is equally likely
//   with --luck (a deck's scores, as in a LUCK header: `number` or `2*10,1*5,0*5`), for 0, 1, 2 and 5 turns of the dial:
//                              the frequency of every item is the one the formula gives (b^(1/g) - a^(1/g) for the group
//                              that owns [a, b), split evenly inside it), and with no turns it is uniform
// A test fails when its p-value is below 0.001 - which an ideal generator does once in a thousand runs by chance, so a failure
// is worth running again with another --seed (the same seed always repeats the same run). The exit code is 1 on any failure.

import { parseArgs } from "node:util";
import { fullPool, launchFate, pull, resolve, take } from "../src/random/draw.ts";
import { parseLuck } from "../src/random/luck.ts";
import { Rng } from "../src/random/rng.ts";
import { chiSquare, chiSquareEach, chiSquarePValue } from "./lib/stats.ts";

const { values } = parseArgs({
  options: {
    items: { type: "string", default: "78" },
    trials: { type: "string", default: "200000" },
    seed: { type: "string" },
    repeat: { type: "boolean", default: false },
    luck: { type: "string" },
  },
});

const n = Number(values.items);
const trials = Number(values.trials);
const seed = values.seed === undefined ? Math.floor(Math.random() * 2 ** 32) : Number(values.seed);
if (!Number.isInteger(n) || n < 2 || !Number.isInteger(trials) || trials < n * n * 5) {
  console.error(`need --items >= 2 and --trials >= 5 x items^2 (so that every cell is expected at least 5 times); got ${n} and ${trials}`);
  process.exit(2);
}

const rng = Rng.fromSeed(seed);
console.log(`items ${n}, trials ${trials}, seed ${seed}, ${values.repeat ? "results repeat" : "no repeats"}\n`);

let failed = false;
function report(name: string, statistic: number, df: number): void {
  const p = chiSquarePValue(statistic, df);
  const ok = p >= 0.001;
  failed ||= !ok;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: chi2 ${statistic.toFixed(1)}, df ${df}, p ${p.toFixed(4)}`);
}

/** One draw, as the game does it: the hidden numbers at the launch, the card at the stop; no dial in between. */
const first = (pool: number[]): number => {
  const chosen = resolve(pool, null, launchFate(rng), 1);
  take(pool, chosen, values.repeat);
  return chosen.value;
};

if (values.repeat) {
  const single = new Array<number>(n).fill(0);
  const pairs = new Array<number>(n * n).fill(0);
  for (let t = 0; t < trials; t++) {
    const pool = fullPool(n);
    const a = first(pool) - 1;
    const b = first(pool) - 1;
    single[a]++;
    pairs[a * n + b]++;
  }
  report("a draw is uniform over the items", chiSquare(single, trials / n), n - 1);
  report("two draws in a row are independent", chiSquare(pairs, trials / (n * n)), n * n - 1);
} else {
  const firstDraw = new Array<number>(n).fill(0);
  const positions = new Array<number>(n * n).fill(0); // item * n + position
  const second = new Array<number>(n * n).fill(0); // first * n + second (the diagonal stays empty)
  for (let t = 0; t < trials; t++) {
    const pool = fullPool(n);
    let previous = -1;
    for (let position = 0; position < n; position++) {
      const item = first(pool) - 1;
      positions[item * n + position]++;
      if (position === 0) firstDraw[item]++;
      if (position === 1) second[previous * n + item]++;
      previous = item;
    }
  }
  report("the first draw is uniform over the items", chiSquare(firstDraw, trials / n), n - 1);
  report("every item is equally likely at every position of a dealt deck", chiSquare(positions, trials / n), (n - 1) ** 2);
  const offDiagonal = second.filter((_, cell) => Math.floor(cell / n) !== cell % n);
  report(
    "the second draw is uniform over what remains, whatever the first was",
    chiSquare(offDiagonal, trials / (n * (n - 1))),
    n * (n - 1) - 1,
  );
}

if (values.luck !== undefined) {
  const scores = parseLuck(values.luck, n);
  const ranked = [...new Set(scores)].sort((a, b) => a - b);
  const sizes = ranked.map((score) => scores.filter((x) => x === score).length);

  // The probability of every item after `turns` turns: the group owning [a, b) of the unit interval has b^(1/g) - a^(1/g).
  const expectedAfter = (turns: number): number[] => {
    const gamma = pull(turns);
    const probability = new Array<number>(n).fill(0);
    let before = 0;
    ranked.forEach((score, j) => {
      const p = ((before + sizes[j]) / n) ** (1 / gamma) - (before / n) ** (1 / gamma);
      scores.forEach((x, item) => {
        if (x === score) probability[item] = p / sizes[j];
      });
      before += sizes[j];
    });
    return probability;
  };

  console.log(`\nscores ${values.luck}: ${ranked.length} groups`);
  for (const turns of [0, 1, 2, 5]) {
    const counts = new Array<number>(n).fill(0);
    for (let t = 0; t < trials; t++) counts[resolve(fullPool(n), scores, launchFate(rng), pull(turns)).value - 1]++;

    // Cells expected fewer than 5 times are merged (smallest first) so that the chi-square approximation holds.
    const cells = expectedAfter(turns)
      .map((p, item) => ({ expected: p * trials, observed: counts[item] }))
      .sort((a, b) => a.expected - b.expected);
    const binsObserved: number[] = [];
    const binsExpected: number[] = [];
    let carry = { expected: 0, observed: 0 };
    for (const cell of cells) {
      carry = { expected: carry.expected + cell.expected, observed: carry.observed + cell.observed };
      if (carry.expected >= 5) {
        binsExpected.push(carry.expected);
        binsObserved.push(carry.observed);
        carry = { expected: 0, observed: 0 };
      }
    }
    if (carry.expected > 0 && binsExpected.length > 0) {
      binsExpected[0] += carry.expected;
      binsObserved[0] += carry.observed;
    }
    const gamma = pull(turns);
    report(
      `${turns} turn${turns === 1 ? "" : "s"} of the dial (gamma ${gamma.toFixed(3)}): items come up as the formula says`,
      chiSquareEach(binsObserved, binsExpected),
      binsExpected.length - 1,
    );
  }
}

process.exit(failed ? 1 : 0);
