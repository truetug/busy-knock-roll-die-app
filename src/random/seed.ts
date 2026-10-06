// The app's generator: the one Rng everything is drawn from, seeded from what the bar offers, and stirred by key presses.
//
// This is the only place that looks at the clock or Math.random for randomness. The draw itself (draw.ts, rng.ts) stays pure.
//
// The seed is 12 words of 32 bits: ten from the engine's Math.random (whatever its quality, it adds entropy and cannot take any
// away) and the clock (milliseconds since 1970, in two words). Every key press then stirs the clock into the state (Rng.stir),
// so the sequence also depends on the player. The variant of a card's text is chosen from this generator too.

import { Rng } from "./rng.ts";

const TWO_32 = 4294967296;

/** Entropy words from the environment. */
function entropy(): number[] {
  const words: number[] = [];
  for (let i = 0; i < 10; i++) words.push(Math.floor(Math.random() * TWO_32));
  const now = Date.now();
  words.push(now % TWO_32, Math.floor(now / TWO_32));
  return words;
}

let current = Rng.fromWords(entropy());

/** The generator the game draws from. */
export function rng(): Rng {
  return current;
}

/** Replaces the generator: for tests and the Monte Carlo tool, which want a seeded one. */
export function useRng(replacement: Rng): void {
  current = replacement;
}

/** A player's action happened at `now` (ms): stirs the time into the generator. */
export function stir(now: number): void {
  current.stir(now);
}
