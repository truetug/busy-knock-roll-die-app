import { beforeEach, describe, expect, it } from "vitest";
import { onBack, onEncoder, onStart, tick } from "../src/game.ts";
import { fullPool, launchFate, PULL_LIMIT, pull, resolve, take } from "../src/random/draw.ts";
import { parseLuck } from "../src/random/luck.ts";
import { Rng } from "../src/random/rng.ts";
import { useRng } from "../src/random/seed.ts";
import { s } from "../src/state.ts";
import { chiSquare, chiSquarePValue } from "../tools/lib/stats.ts";
import { freshState, parseShipped } from "./helpers.ts";

/** xoshiro128** written the plain way, with BigInt, straight from the reference C code: the Rng must agree with it. */
function reference(state: bigint[]): () => number {
  const M = 0xffffffffn;
  const rotl = (x: bigint, k: bigint) => ((x << k) | (x >> (32n - k))) & M;
  return () => {
    const result = (rotl((state[1] * 5n) & M, 7n) * 9n) & M;
    const t = (state[1] << 9n) & M;
    state[2] ^= state[0];
    state[3] ^= state[1];
    state[1] ^= state[2];
    state[0] ^= state[3];
    state[2] ^= t;
    state[3] = rotl(state[3], 11n);
    return Number(result);
  };
}

describe("the generator (xoshiro128**)", () => {
  it("gives the published sequence for the state 1, 2, 3, 4", () => {
    const rng = new Rng(1, 2, 3, 4);
    expect(Array.from({ length: 6 }, () => rng.next())).toEqual([11520, 0, 5927040, 70819200, 2031721883, 1637235492]);
  });

  it("agrees with a plain BigInt version of the reference code for a long run", () => {
    const rng = new Rng(0xdeadbeef, 0x12345678, 0x9abcdef0, 0x0badf00d);
    const expected = reference([0xdeadbeefn, 0x12345678n, 0x9abcdef0n, 0x0badf00dn]);
    for (let i = 0; i < 5000; i++) expect(rng.next()).toBe(expected());
  });

  it("repeats a seeded run exactly, and differs between seeds", () => {
    const run = (seed: number) => {
      const rng = Rng.fromSeed(seed);
      return Array.from({ length: 5 }, () => rng.next());
    };
    expect(run(42)).toEqual(run(42));
    expect(run(42)).not.toEqual(run(43));
  });

  it("never sticks in the all-zero state", () => {
    const rng = new Rng(0, 0, 0, 0);
    expect(new Set(Array.from({ length: 20 }, () => rng.next())).size).toBeGreaterThan(1);
  });

  it("is a different generator once a value has been stirred in, and stays a good one", () => {
    const [a, b] = [Rng.fromSeed(1), Rng.fromSeed(1)];
    b.stir(1_760_000_000_000); // a millisecond clock: more than 32 bits
    expect(a.next()).not.toBe(b.next());
    for (let i = 0; i < 100; i++) b.stir(i);
    expect(new Set(Array.from({ length: 50 }, () => b.next())).size).toBe(50);
  });

  it("gives floats in [0, 1)", () => {
    const rng = Rng.fromSeed(7);
    for (let i = 0; i < 10_000; i++) {
      const x = rng.float();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("int(bound)", () => {
  it("stays in range, and 1 can only give 0", () => {
    const rng = Rng.fromSeed(3);
    for (let i = 0; i < 5000; i++) {
      expect(rng.int(1)).toBe(0);
      const x = rng.int(78);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(78);
    }
  });

  it("refuses a bound that is not a whole number from 1 to 2^32", () => {
    const rng = Rng.fromSeed(3);
    for (const bad of [0, -1, 2.5, Number.NaN, 2 ** 32 + 1]) expect(() => rng.int(bad)).toThrow(RangeError);
  });

  it("rejects the numbers of the incomplete last block instead of folding them in with %", () => {
    // For a bound of 3, 2^32 = 3 * 1431655765 + 1: the single value 4294967295 has no full block and must be thrown away.
    class Scripted extends Rng {
      private values = [4294967295, 4294967295, 5];
      next(): number {
        return this.values.shift() ?? 0;
      }
    }
    expect(new Scripted(1, 2, 3, 4).int(3)).toBe(5 % 3);
  });

  it("is uniform (a chi-square test with fixed seeds)", () => {
    for (const seed of [11, 12, 13]) {
      const rng = Rng.fromSeed(seed);
      const counts = new Array<number>(78).fill(0);
      const trials = 78_000;
      for (let i = 0; i < trials; i++) counts[rng.int(78)]++;
      expect(chiSquarePValue(chiSquare(counts, trials / 78), 77), `seed ${seed}`).toBeGreaterThan(0.001);
    }
  });
});

describe("the statistics used to judge it", () => {
  it("knows the textbook p-values", () => {
    expect(chiSquarePValue(3.841, 1)).toBeCloseTo(0.05, 3);
    expect(chiSquarePValue(18.307, 10)).toBeCloseTo(0.05, 3);
    expect(chiSquarePValue(0, 5)).toBe(1);
  });

  it("notices a bias of one part in ten: the test has teeth", () => {
    const rng = Rng.fromSeed(5);
    const counts = new Array<number>(10).fill(0);
    for (let i = 0; i < 100_000; i++) counts[rng.float() < 0.11 ? 0 : 1 + rng.int(9)]++; // item 0 comes 11% of the time, not 10%
    expect(chiSquarePValue(chiSquare(counts, 10_000), 9)).toBeLessThan(0.001);
  });
});

describe("a draw", () => {
  const uniform = (pool: readonly number[], rng: Rng) => resolve(pool, null, launchFate(rng), 1);

  it("takes a position of the pool uniformly: each of the items left has probability 1 / left", () => {
    const rng = Rng.fromSeed(21);
    const pool = [3, 5, 8, 13]; // whatever is left need not be 1..n
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 40_000; i++) counts[uniform(pool, rng).index]++;
    expect(chiSquarePValue(chiSquare(counts, 10_000), 3)).toBeGreaterThan(0.001);
  });

  it("gives the value at that position, and refuses an empty pool", () => {
    const rng = Rng.fromSeed(1);
    const chosen = uniform([7, 8, 9], rng);
    expect([7, 8, 9][chosen.index]).toBe(chosen.value);
    expect(() => uniform([], rng)).toThrow(RangeError);
  });

  it("takes exactly two floats (four words) from the generator, whatever happens later", () => {
    const [a, b] = [Rng.fromSeed(4), Rng.fromSeed(4)];
    launchFate(a);
    b.float();
    b.float();
    expect(a.next()).toBe(b.next());
  });

  it("takes the item out of the pool unless results repeat", () => {
    const pool = fullPool(5);
    take(pool, { index: 1, value: 2 }, false);
    expect(pool).toEqual([1, 3, 4, 5]);
    take(pool, { index: 0, value: 1 }, true);
    expect(pool).toEqual([1, 3, 4, 5]);
  });

  it("deals a deck without repeats: every item exactly once", () => {
    const rng = Rng.fromSeed(8);
    const pool = fullPool(78);
    const dealt: number[] = [];
    while (pool.length > 0) {
      const chosen = uniform(pool, rng);
      take(pool, chosen, false);
      dealt.push(chosen.value);
    }
    expect([...dealt].sort((a, b) => a - b)).toEqual(fullPool(78));
  });
});

describe("the nudge of the dial", () => {
  const tarot = parseLuck("1*22,0*56", 78);

  it("starts at nothing, weakens with every turn and never passes its limit", () => {
    expect(pull(0)).toBe(1);
    const steps = Array.from({ length: 8 }, (_, turns) => pull(turns));
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1]);
    const gains = steps.slice(1).map((g, i) => steps[i] - g);
    for (let i = 1; i < gains.length; i++) expect(gains[i]).toBeLessThan(gains[i - 1]);
    expect(pull(100)).toBeGreaterThan(0.43);
    expect(pull(100)).toBeCloseTo(PULL_LIMIT, 10);
    expect(PULL_LIMIT).toBeGreaterThan(0.4);
  });

  it("is uniform over the items with no turns, scores or not (a chi-square test)", () => {
    const rng = Rng.fromSeed(32);
    const counts = new Array<number>(78).fill(0);
    for (let i = 0; i < 78_000; i++) counts[resolve(fullPool(78), tarot, launchFate(rng), 1).value - 1]++;
    expect(chiSquarePValue(chiSquare(counts, 1000), 77)).toBeGreaterThan(0.001);
  });

  it("never makes a card worse: for the same hidden numbers a stronger nudge gives the same score or a better one", () => {
    const rng = Rng.fromSeed(33);
    let better = 0;
    for (let i = 0; i < 2000; i++) {
      const fate = launchFate(rng);
      const scores = [1, 2, 3, 5].map((turns) => tarot[resolve(fullPool(78), tarot, fate, pull(turns)).value - 1]);
      for (let k = 1; k < scores.length; k++) expect(scores[k]).toBeGreaterThanOrEqual(scores[k - 1]);
      if (scores[3] > tarot[resolve(fullPool(78), tarot, fate, 1).value - 1]) better++;
    }
    expect(better).toBeGreaterThan(100);
  });

  it("keeps every item possible: nobody is excluded, however many turns", () => {
    const rng = Rng.fromSeed(34);
    const seen = new Set<number>();
    for (let i = 0; i < 100_000; i++) seen.add(resolve(fullPool(78), tarot, launchFate(rng), pull(100)).value);
    expect(seen.size).toBe(78);
  });

  it("follows the formula: with the major arcana scoring higher, they come up with probability 1 - (56/78)^(1/gamma)", () => {
    for (const turns of [1, 3, 8]) {
      const rng = Rng.fromSeed(40 + turns);
      const gamma = pull(turns);
      const trials = 100_000;
      let major = 0;
      for (let i = 0; i < trials; i++) if (resolve(fullPool(78), tarot, launchFate(rng), gamma).value <= 22) major++;
      const p = 1 - (56 / 78) ** (1 / gamma);
      expect(Math.abs(major - trials * p), `${turns} turns`).toBeLessThan(5 * Math.sqrt(trials * p * (1 - p)));
    }
  });

  it("treats items with the same score alike: the order in the pool gives none of them an edge", () => {
    const rng = Rng.fromSeed(35);
    const counts = new Array<number>(56).fill(0); // the 56 minor arcana, all with score 0
    let n = 0;
    for (let i = 0; i < 200_000; i++) {
      const { value } = resolve(fullPool(78), tarot, launchFate(rng), pull(5));
      if (value > 22) {
        counts[value - 23]++;
        n++;
      }
    }
    expect(chiSquarePValue(chiSquare(counts, n / 56), 55)).toBeGreaterThan(0.001);
  });

  it("reads LUCK headers", () => {
    expect(parseLuck("number", 4)).toEqual([1, 2, 3, 4]);
    expect(parseLuck("2*2,0*1", 3)).toEqual([2, 2, 0]);
    expect(() => parseLuck("2*2", 3)).toThrow(/covers 2 items/);
    expect(() => parseLuck("high", 3)).toThrow(/bad LUCK run/);
  });
});

describe("the wheel and the dial", () => {
  beforeEach(() => {
    useRng(Rng.fromSeed(2024));
    freshState(parseShipped("classic"));
  });

  /** Plays a spin from the intro, doing `during` while it turns, and says which card it stopped on. */
  function playSpin(during: (now: number) => void): number {
    onStart(0);
    onStart(1000); // launches the wheel: the hidden numbers are drawn here
    for (let now = 1000; now < 120_000; now += 150) {
      during(now);
      if (tick(now) === "picked") return s.value ?? 0;
    }
    throw new Error("the wheel never stopped");
  }

  const fresh = (deck: string, seed = 2024) => {
    useRng(Rng.fromSeed(seed));
    freshState(parseShipped(deck));
  };

  it("draws the hidden numbers when the wheel is launched, and works out the card when it stops", () => {
    onStart(0);
    expect(s.fate).toBeNull();
    onStart(1000);
    expect(s.fate).not.toBeNull();
    for (let now = 1000; now < 120_000; now += 150) if (tick(now) === "picked") break;
    expect(s.value).toBeGreaterThanOrEqual(1);
    expect(s.fate).toBeNull();
  });

  it("stops on the same card whether Start brakes it or nobody touches it", () => {
    const quiet = playSpin(() => {});
    fresh("classic");
    let braked = false;
    const stopped = playSpin((now) => {
      if (now > 1500 && !braked) {
        braked = true;
        onStart(now);
      }
    });
    expect(stopped).toBe(quiet);
  });

  it("counts a turn of the dial only while the wheel reacts to it", () => {
    onStart(0);
    onStart(1000);
    onEncoder(1, 1100);
    onEncoder(-1, 1200); // the wrong way: ignored
    expect(s.turns).toBe(1);
    onStart(1300); // brake
    onEncoder(1, 1400);
    expect(s.turns).toBe(1);
  });

  it("lets a deck with scores be nudged: a turned dial never ends worse than a quiet one, and often better", () => {
    let better = 0;
    for (let seed = 1; seed <= 150; seed++) {
      fresh("classic", seed);
      const quiet = playSpin(() => {});
      fresh("classic", seed);
      const dialled = playSpin((now) => {
        if ((now - 1000) % 300 === 0 && now < 3000) onEncoder(1, now);
      });
      // The dial stirs the generator only after the launch, so both spins hold the same hidden numbers.
      expect(dialled <= 22 || quiet > 22, `seed ${seed}: ${quiet} -> ${dialled}`).toBe(true);
      if (dialled <= 22 && quiet > 22) better++;
    }
    expect(better).toBeGreaterThan(10);
  });

  it("leaves a deck without scores alone: the dial changes the show, not the card", () => {
    fresh("loto");
    const quiet = playSpin(() => {});
    fresh("loto");
    const dialled = playSpin((now) => {
      if ((now - 1000) % 300 === 0 && now < 3000) onEncoder(1, now);
    });
    expect(dialled).toBe(quiet);
  });

  it("uses up nothing when a spin is abandoned: Back starts the reading afresh", () => {
    onStart(0);
    onStart(1000);
    onBack();
    expect(s.pool).toHaveLength(78);
    expect(s.fate).toBeNull();
    expect(s.drawn).toBe(0);
  });
});
