# How a card is drawn

What decides which card you get, what does not, and how to check it. The code is in `src/random/`; the game's use of it is two
calls in `src/game.ts` (`spin` and `pick`).

## In one paragraph

When the wheel is **launched** (Start, or a turn of the dial at rest), the app takes two hidden random numbers from the generator
and nothing else random happens in that spin. While the wheel turns, each turn of the dial *the wheel reacts to* nudges the draw
a little towards the good end of the deck, and each nudge is weaker than the one before. When the wheel **stops**, the card is
worked out - with no more chance involved - from the hidden numbers, the nudges so far and the deck's scores. With no turns of the
dial the card is exactly uniform over what can still come up. The speed of the wheel, how long it spins and Start used as the
brake change nothing; the dial changes the odds, within a limit, until the moment it stops reacting.

## The sequence, step by step

1. **Reading starts** (the start screen, or the end of the previous reading): the pool is `1..count` of the deck, nothing drawn.
2. **Launch** (`spin` in `game.ts`): the generator is stirred with the clock, then two floats are drawn: `u` and `v`, uniform in
   [0, 1) - the **hidden numbers** (`launchFate`). `u` will pick how good the card is, `v` picks among equally good cards. That is
   all the generator is asked for in this spin, whatever happens next.
3. **Spin** (`wheel.ts`): the clips of the animation are chained. Each turn of the dial the wheel reacts to - a clockwise turn
   while it is spinning and not braking or coming to rest - counts as a **turn** (`s.turns`) and lights the frame. A turn the wheel
   does not react to (the wrong way round, during the brake, during the last slowing down) is not counted: what you cannot see
   work does not work. The only other random thing in the app is *how fast the wheel starts* (one of three launch levels, chosen
   with the engine's `Math.random`), which is looks only.
4. **Stop** (`pick`, `resolve` in `random/draw.ts`): the card is worked out from `u`, `v`, the pool, the deck's scores and the
   turns (below); unless the deck lets results repeat, the item leaves the pool.
5. **Back** during a spin starts the reading afresh (full pool, nothing drawn), so an abandoned spin uses nothing up.

Drawing the numbers at the launch and working out the card at the stop is what lets the dial matter until the last moment, and
the draw stay reproducible: `resolve` is a plain function (pool, scores, `u`, `v`, nudge) → card.

## The nudge of the dial

A deck can say which of its items are better (the `LUCK` header, `docs/DECKS.md`): dice by their number, the 8 ball by the tone
of the answer, the tarot decks by "major arcana above minor". A deck without scores - the lotto - cannot be nudged: its dial only
changes the show.

- Each counted turn `k` pulls with strength `a_k = 0.3 · 0.6^(k−1)`: 0.3, 0.18, 0.108, ... The nudge after `n` turns is
  `γ = (1 − a_1)(1 − a_2)…(1 − a_n)`: 1 with no turns, 0.700, 0.574, 0.512, 0.480, 0.460, ... and never below 0.434 (`PULL_LIMIT`).
  Every turn counts for less than the one before and the sum is bounded: the dial can tilt the odds, not take over.
- The nudged number is `u' = u^γ`. For γ < 1 it moves towards 1 - the good end - and never reaches it.
- The items left in the pool are grouped by score. Lay the groups on a line from worst to best, each as long as its size; `u'`
  (scaled to the length of the pool) lands in one group, and `v` picks an item inside that group uniformly. Items with the same
  score are never told apart, whatever their order in the pool or in the file.
- So the group owning the part `[a, b)` of the unit interval (a = items worse than it / pool size, b = a + its size / pool size)
  comes up with probability `b^(1/γ) − a^(1/γ)`; each of its items has an equal share. With γ = 1 that is just `b − a` - uniform.

For example (results repeat or the first draw of a reading):

| Turns | γ | 8 ball: positive | tarot: a major arcana | d6: a six | d20: 16 or more |
| --- | --- | --- | --- | --- | --- |
| 0 | 1.000 | 50.0% | 28.2% | 16.7% | 25.0% |
| 1 | 0.700 | 62.9% | 37.7% | 22.9% | 33.7% |
| 2 | 0.574 | 70.1% | 43.9% | 27.2% | 39.4% |
| 3 | 0.512 | 74.2% | 47.6% | 30.0% | 43.0% |
| 5 | 0.460 | 77.8% | 51.3% | 32.7% | 46.5% |
| many | 0.434 | 79.8% | 53.4% | 34.3% | 48.5% |

Every item stays possible at any number of turns, and a spin where the dial is never touched is as fair as a draw can be.
A reading without repeats nudges each of its draws on its own: the pool shrinks, and the draw is the same function of what is left.

## Which item, with what probability

- **Without turns** (or a deck without scores), **no repeats** (tarot and the other picture decks, the lotto): the pool shrinks by
  the drawn item and every draw is uniform over what remains - with 78 cards, the first card has probability 1/78, the second 1/77
  each of the 77 left, and so on. A whole reading is a uniformly random sequence of distinct items, exactly as if a perfectly
  shuffled deck were dealt from the top. The probabilities are *conditional*: given what was dealt before, each remaining item is
  equally likely.
- **Results that repeat** (the dice, the 8 ball): the pool never shrinks, every draw is uniform over all items and independent of
  the others.
- **With turns**: as above, per draw.
- **A spread** (several results in one reading) is just several draws in a row from the same pool.
- **Variants of a text line** (`кол|копейка|рупь`): chosen when the item is opened, uniformly, by the same generator. They do not
  influence which item came up.

The pool is kept in order (`1..count`, minus what was drawn); nothing reads that order, so there is no shuffle and exactly one
source of randomness to reason about.

## The generator

`src/random/rng.ts`: **xoshiro128\*\*** (Blackman & Vigna, 2018): 128 bits of state, 32-bit output, period 2^128 − 1, designed by its
authors to pass the usual statistical test batteries, and cheap on a small engine. It is written with 32-bit arithmetic only, with no dependencies, so
that it behaves identically on the bar, in the tests and in the Monte Carlo tool. The tests check it against the published values
for the state (1, 2, 3, 4) and against a BigInt transcription of the reference C code over 5000 outputs.

- **`int(bound)`** is exactly uniform: it throws away the numbers of the incomplete last block of 2³² values instead of reducing
  with `%` (which would make small results slightly more likely). For 78 items the chance that a number is rejected is about 5 in 10⁹ (2³² mod 78 = 22, out of 2³²).
- **`float()`** gives 53 random bits in [0, 1).
- **Seeding** (`src/random/seed.ts`, the only file that looks at the clock or `Math.random`): when the app starts, 12 words of 32
  bits - ten from `Math.random` and the clock in two words - are stirred into the state, then 16 outputs are discarded. The
  engine's `Math.random` is *not* trusted for the distribution (its algorithm is unspecified); it is one ingredient of the seed,
  and a weak one can only add less entropy, never bias the numbers.
- **Stirring**: every key press stirs its time (ms) into the state. This adds unpredictability for the *next* draws; it does not
  disturb the uniformity of anything.
- **Seeding for tests**: `Rng.fromSeed(n)` is fully deterministic; `useRng(...)` swaps it in. The shipped app has no setting,
  menu or file that does this - nothing in the app lets anyone choose or bend a result.

### What it is not

Not cryptographic: from enough consecutive outputs the state can be recovered and the future predicted. And the *seed* is only as
unpredictable as the bar's clock and `Math.random` are (the bar's engine may seed `Math.random` poorly; a clock to the millisecond
carries a few dozen bits at best). For choosing a tarot card or a lotto barrel that is more than enough; for a lottery with money
on it, it would not be.

## Checking it: Monte Carlo

```sh
pnpm monte-carlo                                  # 78 items, 200 000 trials, a random seed
pnpm monte-carlo --items 90 --trials 500000 --seed 7
pnpm monte-carlo --items 6 --repeat               # a deck whose results repeat
pnpm monte-carlo --items 78 --luck "1*22,0*56"    # also the nudge of the dial, for the tarot's scores
pnpm monte-carlo --items 100 --repeat --luck number
```

It runs the app's own `draw`/`take` over the generator many times and applies Pearson's chi-square to:

| Test | What a pass means |
| --- | --- |
| first draw over the items | each item is equally likely |
| every item at every position of a dealt deck | a reading is a uniformly random order |
| second draw given the first (all pairs) | the next draw is uniform over what remains, whatever came before |
| *(repeat decks)* a draw; two draws in a row | uniform and independent |
| *(`--luck`)* 0, 1, 2 and 5 turns of the dial | every item comes up as often as the formula above says |

A p-value below 0.001 fails (an ideal generator does that one run in a thousand), and the run can be repeated exactly with the same
`--seed`. `pnpm test` runs the same kind of checks with fixed seeds, including one that must *fail* (a deliberately biased die), to
show the test would notice.

The unit tests (`tests/random.test.ts`) also pin down the behaviour above: the hidden numbers are drawn at launch and the card at the
stop; braking or doing nothing gives the same card for the same seed; a turned dial never ends worse than a quiet one (same seed, same
numbers) and often better; a deck without scores ignores the dial; the nudge weakens turn by turn and has a limit; items with the
same score stay equally likely; an abandoned spin uses nothing up.

## Changing it safely

- Keep `src/random/rng.ts` and `draw.ts` pure and free of imports; they are the part that can be argued about.
- Anything that picks a *result* must go through `launchFate`/`resolve` and `rng()`. Anything cosmetic may use `Math.random`, and must not be read by
  the draw.
- Changing the generator changes every seeded sequence: update the test vectors and say so in the changelog.
