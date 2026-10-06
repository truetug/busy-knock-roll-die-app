# Contributing

Thanks for helping. Bug reports, deck files and code are all welcome.

## Setup

```sh
corepack enable
pnpm install
pnpm check      # typecheck, lint, tests - run before every push
```

Node 24 is required (`.nvmrc`); the deck and sound tooling (`pnpm decks`, `pnpm deck`, `pnpm check-deck`) is plain TypeScript run by
Node. Python 3 with Pillow (`pip install -r tools/requirements.txt`) is needed only for the wheel's animations: changing its look or speeds means re-running `tools/make_anim.py`, which needs the BUSY Bar firmware
checkout for its animation encoder (`FIRMWARE_SCRIPTS=<firmware>/scripts`) and `colorlog`; commit its output.

## Before you open a pull request

- `pnpm check` passes. `pnpm format` fixes formatting and import order.
- Behaviour changes come with a test: rules in `tests/game.test.ts`, the deck format in `tests/format.test.ts`, screens in
  `tests/screens.test.ts`. Shipped decks are validated by `tests/decks.test.ts`.
- If you touched `src/random/`, run `pnpm monte-carlo` (see docs/RANDOMNESS.md).
- If you edited a deck file by hand, run `pnpm check-deck src/deck-<id>.txt` (items keep their size: see docs/DECKS.md).
- If you changed `tools/make-decks.ts`, `tools/make-generated-decks.ts` or anything in `assets/`, run `pnpm decks` and commit what it
  regenerates (`assets/decks/*/cards.txt` and pictures of the generated decks, `src/appmeta/settings.json`, the README's table of decks).
  The deck files themselves, `src/deck-*.txt`, are not committed: build and test make them. If you changed `tools/make-sounds.ts`, run
  `pnpm sounds` and commit `src/sounds/`. CI fails if any of it is out of date.
- Add a line to `CHANGELOG.md` under "Unreleased".
- Keep commits focused and say why in the message.

## Where things go

The layers are described in the README. In short: pure logic in `deck/format.ts`, `game.ts` and `util.ts`; anything that talks to the
bar in `deck/store.ts`, `deck/discovery.ts` and `display.ts`; looks in `view/`. Keep the rules free of drawing and I/O so they stay
testable.

The code runs on a small JS engine with a tiny heap. Prefer fewer, smaller allocations, avoid `.finally()` on promises, and send
at most one request to the bar at a time - the comments in `display.ts` and `main.ts` explain why.

## Testing on a bar

`pnpm push <address> [token]` builds and uploads the app (without an address `tools/bar.sh` looks for the bar on your network; if it is behind a jump host, describe that in `.bar.env`, see `.bar.env.example`). Press Start on the bar's launcher entry to run it. Screenshots are available
at `GET /api/screen?display=0`.

## Releasing

Bump `version` in `src/appmeta/manifest.json` and `package.json`, move the changelog entries under the new version, then push a tag
equal to the version (`1.0.1`). The release workflow checks the tag against the manifest and attaches the package.
