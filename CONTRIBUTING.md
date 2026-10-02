# Contributing

Thanks for helping. Bug reports, deck files and code are all welcome.

## Setup

```sh
corepack enable
pnpm install
pnpm check      # typecheck, lint, tests - run before every push
```

Node 24 is required (`.nvmrc`). Python 3 with Pillow (`pip install -r tools/requirements.txt`) is needed only to regenerate deck
files with `pnpm decks`. Changing the wheel's look or speeds means re-running `tools/make_anim.py`, which needs the BUSY Bar firmware
checkout for its animation encoder (`FIRMWARE_SCRIPTS=<firmware>/scripts`) and `colorlog`; commit its output.

## Before you open a pull request

- `pnpm check` passes. `pnpm format` fixes formatting and import order.
- Behaviour changes come with a test: rules in `tests/game.test.ts`, the deck format in `tests/format.test.ts`, screens in
  `tests/screens.test.ts`. Shipped decks are validated by `tests/decks.test.ts`.
- If you changed `tools/make_deck.py`, `tools/make_sounds.py` or the artwork, run `pnpm decks` and commit the regenerated
  `src/deck-*.txt`, `src/sounds/` and `src/appmeta/settings.json`; CI fails if they are out of date.
- Add a line to `CHANGELOG.md` under "Unreleased".
- Keep commits focused and say why in the message.

## Where things go

The layers are described in the README. In short: pure logic in `deck/format.ts`, `game.ts` and `util.ts`; anything that talks to the
bar in `deck/store.ts`, `deck/discovery.ts` and `display.ts`; looks in `view/`. Keep the rules free of drawing and I/O so they stay
testable.

The code runs on a small JS engine with a tiny heap. Prefer fewer, smaller allocations, avoid `.finally()` on promises, and send
at most one request to the bar at a time - the comments in `display.ts` and `main.ts` explain why.

## Testing on a bar

`pnpm push <address> [token]` builds and uploads the app. Press Start on the bar's launcher entry to run it. Screenshots are available
at `GET /api/screen?display=0`.

## Releasing

Bump `version` in `src/appmeta/manifest.json` and `package.json`, move the changelog entries under the new version, then push a tag
equal to the version (`1.0.1`). The release workflow checks the tag against the manifest and attaches the package.
