// The random number generator: xoshiro128** (Blackman & Vigna, 2018), 128 bits of state, 32-bit output, period 2^128 - 1.
//
// Pure: no I/O, no clock, no Math.random, no imports - the same code runs on the bar, in the tests and in the Monte Carlo tool
// (tools/monte-carlo.ts). Given the same seed it gives the same numbers everywhere. See docs/RANDOMNESS.md for what the app
// guarantees about its draws and how they rest on this file.
//
// Why not Math.random: the bar's JavaScript engine does not promise anything about its generator (algorithm, period, seeding).
// A reference needs a generator that is written down, has published test vectors and can be seeded: this one is, and
// nothing outside this file is trusted for the *distribution* of a draw - only, at most, for the entropy of the seed.
//
// Not cryptographic: the next number can be predicted from enough outputs. For a card draw, that is fine.

const TWO_32 = 4294967296;

/** 32-bit unsigned multiplication, exact (Math.imul without relying on it being there). */
function mul32(a: number, b: number): number {
  return ((a & 0xffff) * b + ((((a >>> 16) * b) & 0xffff) << 16)) >>> 0;
}

const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;

/** SplitMix32 step: the usual way to turn one 32-bit seed into a well-mixed sequence. Returns [new state, output]. */
function splitMix32(state: number): [number, number] {
  const next = (state + 0x9e3779b9) >>> 0;
  let z = next;
  z = mul32(z ^ (z >>> 16), 0x85ebca6b);
  z = mul32(z ^ (z >>> 13), 0xc2b2ae35);
  return [next, (z ^ (z >>> 16)) >>> 0];
}

export class Rng {
  /** The four words of state; never all zero. */
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;
  /** Which state word the next stirred-in value goes into. */
  private slot = 0;

  /** From the four state words as they are (the form the published test vectors use). All zero is replaced by a fixed state. */
  constructor(s0: number, s1: number, s2: number, s3: number) {
    this.s0 = s0 >>> 0;
    this.s1 = s1 >>> 0;
    this.s2 = s2 >>> 0;
    this.s3 = s3 >>> 0;
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
  }

  /** A generator for a 32-bit seed: the same seed always gives the same sequence. */
  static fromSeed(seed: number): Rng {
    let state = seed >>> 0;
    const words: number[] = [];
    for (let i = 0; i < 4; i++) {
      const [next, out] = splitMix32(state);
      state = next;
      words.push(out);
    }
    return new Rng(words[0], words[1], words[2], words[3]);
  }

  /**
   * A generator seeded from any number of 32-bit words (entropy gathered from wherever it can be): each word is stirred into
   * the state, then the first outputs are thrown away so that a poor seed does not show in the numbers.
   */
  static fromWords(words: number[]): Rng {
    const rng = new Rng(0x9e3779b9, 0x243f6a88, 0xb7e15162, 0x7f4a7c15);
    for (const word of words) rng.stir(word);
    for (let i = 0; i < 16; i++) rng.next();
    return rng;
  }

  /** The next 32 random bits, as an unsigned integer in [0, 2^32). */
  next(): number {
    const result = mul32(rotl(mul32(this.s1, 5), 7), 9);
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  /**
   * Mixes one more value into the state (the time of a key press, say) and steps the generator. It adds unpredictability to
   * what comes next; it never makes the numbers less uniform, and numbers already drawn are not touched.
   */
  stir(value: number): void {
    const word = value >>> 0;
    const high = Math.floor(value / TWO_32) >>> 0; // a millisecond clock does not fit in 32 bits
    switch (this.slot++ & 3) {
      case 0:
        this.s0 = (this.s0 ^ word) >>> 0;
        break;
      case 1:
        this.s1 = (this.s1 ^ word) >>> 0;
        break;
      case 2:
        this.s2 = (this.s2 ^ word) >>> 0;
        break;
      default:
        this.s3 = (this.s3 ^ word) >>> 0;
    }
    this.s0 = (this.s0 ^ high) >>> 0;
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
    this.next();
  }

  /**
   * A uniformly random integer in [0, bound), `bound` a whole number from 1 to 2^32. Exactly uniform: numbers from the
   * incomplete last block of 2^32 values are rejected rather than folded in with `%`, which would favour small results.
   */
  int(bound: number): number {
    if (!Number.isInteger(bound) || bound < 1 || bound > TWO_32) throw new RangeError(`bound ${bound} is not a whole number in 1..2^32`);
    const limit = TWO_32 - (TWO_32 % bound);
    let x = this.next();
    while (x >= limit) x = this.next();
    return x % bound;
  }

  /** A random number in [0, 1) with 53 bits of precision, like Math.random but from this generator. */
  float(): number {
    const high = this.next() >>> 5; // 27 bits
    const low = this.next() >>> 6; // 26 bits
    return (high * 67108864 + low) / 9007199254740992;
  }
}
