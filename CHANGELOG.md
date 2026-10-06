# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
follows [Semantic Versioning](https://semver.org/).

## [1.0.0]

First public release.

### Added

- `make` builds the app and keeps it as `builds/<id>-<version>-<commit>-<time>.tgz` (the app catalog can be tried with these).

### Changed

- The deck files (`src/deck-*.txt`) are built from `assets/` by `pnpm build` and `pnpm test` instead of being committed; the README's table
  of decks is written by the same tool.
- Starting the app no longer reads the header of every deck: only when a deck file was added or removed.
- `tools/check-deck.ts` uses the app's own parser, so it can not disagree with the app.

### Fixed

- Screens flickered when they changed: every frame was sent whole and the elements of the old screen were cleared by a request of their
  own, so old and new showed together for as long as it took. Now (`src/screen.ts`) the app knows what is on the bar's screen and sends
  only what changed, in one request; an element that leaves the screen is redrawn in that request as an invisible one of the same kind.
- Slowing down and stopping sometimes did not play: the wheel's clips now end in a longer constant-speed stretch (1.1 s), the bar's
  real delay (it is slow while the animation plays) is measured with the queueing included, a launch is timed from when the bar took it,
  and a click is no longer sent while a clip is waiting to go out.
- Screens overlapped or were cleared in the wrong order: the strip is taken away only once the opening card covers it, the first frame
  of a wheel goes out before its strip, and a strip's clips go out before a frame.
- The release workflow attached an archive that did not exist (`dist/<id>.tgz` is renamed to `<id>-<version>.tgz`).

- Auto play is Off, One game or Random game (another deck for every game; the countdown names it).
- Auto play (a setting): no start screen, it spins by itself, shows each screen of a result for 3 seconds and, after a game, "next game
  in 5" - for ever. Start skips a wait, Back quits.
- A spin lasts at least 12 seconds and shows every card of the deck at least once (launch levels 5 and 6); the deck's text is in English
  except in the two Russian decks, Fairy tales and Lotto.
- Deck headers are padded to end on a 1 KiB boundary: a block read of a header that cut a Cyrillic letter in two killed the bar's
  JavaScript engine (fatal error 120). `pnpm check-deck` checks it.
- More decks: roulette (`roul`), a coin, runes (24), the I Ching (64 hexagrams), playing cards (52), dominoes (28), two dice (36
  throws, so the sums come up as they do), bingo (75), rock-paper-scissors, a compass, what to eat, and the position helper for a
  physical tarot deck (`tcount`: "count N cards from the top"). The ones with pictures are drawn by code (`tools/make-generated-decks.ts`);
  playing cards, dominoes and two dice are nudged by the dial towards the higher ranks and sums.
- A reference randomizer (`src/random/`, docs/RANDOMNESS.md): xoshiro128** with exactly uniform draws, the result drawn once at the
  launch of the wheel (the spin cannot change it), seeded from the clock and stirred by key presses; `pnpm monte-carlo` tests it
  with chi-square.
- The dial now nudges the draw: each turn the wheel reacts to pulls the card a little towards the good end of the deck (`LUCK` scores:
  dice by number, the 8 ball by tone, the tarot decks major arcana first), each turn weaker than the last and bounded; the frame warms
  as it does. Without turns the draw is exactly uniform.
- A Russian lotto deck (`loto`): 90 barrels, a whole game without repeats, a big number and then its folk name. Text lines may list
  variants with `|` (one is shown by chance); decks may be text only; `SPREAD` of 10 or more makes a deck a game.
- One neutral wheel animation for every deck: only the middle card shows the deck's card back, and it lights up when the wheel settles.
- `pnpm deck <folder>` (`tools/build-deck.ts`): a folder of 72×16 PNGs becomes a deck file. New Cosmic and Fairy tales decks; Tarot and Neon redrawn. See docs/MAKING_A_DECK.md.
- The wheel: launch with the dial or Start, push it faster with more turns, slow it with Start, settle on a card. The cards are
  pre-rendered animation clips the bar plays at 60 fps, chained by a small automaton.
- Decks as plain, hand-editable text files: a self-describing header, then items made of multi-line screens separated by blank
  lines (art as a 16-line picture, text as it is shown), read by byte range; `tools/check-deck.ts` finds an item whose size is off.
- Tarot (classic and neon art, each with a short prediction), a magic 8 ball, a d6 and d4/d8/d10/d12/d20/d100.
- Deck discovery: deck files dropped into `resources/` show up in the settings screen.
- An error screen that names the deck file and what is wrong with it.
- Card backs as bitmaps: a deck can define its own (`BACK` lines in its header), or the user picks Diamond, Lattice, Sparkle or Plain.
- A click for every card passing the frame, timed to the wheel's speed, plus sounds for the wheel starting, settling, the result
  opening and its next step: five replaceable files in `sounds/`;
  `tools/make-sounds.ts` synthesises the bundled set.
- Settings: deck, results per reading, card back, sound, colour.
