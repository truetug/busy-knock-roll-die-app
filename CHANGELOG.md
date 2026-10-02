# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
follows [Semantic Versioning](https://semver.org/).

## [1.0.0]

First public release.

### Added

- The wheel: launch with the dial or Start, push it faster with more turns, slow it with Start, settle on a card. The cards are
  pre-rendered animation clips the bar plays at 60 fps, chained by a small automaton.
- Decks as files with a self-describing header and multi-step results, read by byte range.
- Tarot (classic and neon art, each with a short prediction), a magic 8 ball, a d6 and d4/d8/d10/d12/d20/d100.
- Deck discovery: deck files dropped into `resources/` show up in the settings screen.
- An error screen that names the deck file and what is wrong with it.
- Card backs as bitmaps: a deck can define its own (`BACK` lines in its header), or the user picks Diamond, Lattice, Sparkle or Plain.
- A click for every card passing the frame, timed to the wheel's speed, plus sounds for the wheel starting, settling, the result
  opening and its next step: five replaceable files in `sounds/`;
  `tools/make_sounds.py` synthesises the bundled set.
- Settings: deck, results per reading, card back, sound, colour.
