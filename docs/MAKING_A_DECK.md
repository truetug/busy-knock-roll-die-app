# Making a deck from pictures: a walk-through

This is how the Fairy tales deck (`fairy`) was made from a folder of generated artwork. The same steps work for any set of
72×16 pictures. The reference for the file format itself is [DECKS.md](DECKS.md).

## 0. What you start with

A folder with one PNG per card plus whatever notes came with it. For Fairy tales that was 78 pictures `00.png`…`77.png`, a
manifest, and a catalogue of meanings in Russian. Look before you convert:

```sh
ls source-folder/*.png | wc -l            # one picture per card, numbered from 00
file source-folder/00.png                 # must be 72 x 16, RGBA
```

The tooling needs, and refuses to build without:

- every picture exactly **72×16**;
- a **transparent background** (a pixel is either fully transparent or opaque; alpha above 127 counts as opaque);
- pictures numbered `NN.png` in the order the deck should have them (the order is the file-name order).

The deck may use any number of colours; more than 31 across the whole deck are merged to the nearest 31 (Fairy tales uses 6, so
nothing is merged). Fewer colours is better: the deck file stays small and the pictures stay crisp.

## 1. Put the pictures in a deck folder

Everything a deck is made from lives in `assets/` (pictures, `deck.json`, texts); `tools/` holds only the code that turns it into
`src/deck-<id>.txt`.

The folder name becomes the deck id, and the bar rejects storage paths of 64 or more characters, so **keep the id to 7
characters or fewer** (`fairy`, `cosmic`, `neon`).

```sh
mkdir assets/decks/fairy
cp source-folder/[0-7][0-9].png assets/decks/fairy/      # only the card pictures, not atlases or previews
```

## 2. Write `deck.json`

```json
{"name": "Fairy tales", "order": 4, "description": "78 cards from Russian fairy tales", "bg": "533E45",
 "back": {"ring": "FFD56A", "core": "FF565E", "fill": "533E45", "edge": "FFD56A"}}
```

- `name` is the label in the app's settings (keep it short).
- `order` is its place in the list; keep the numbers unique (see the other `deck.json` files; the 8 ball and the dice come last, ordered in
  `tools/make-decks.ts`).
- `description` is the line the README's table of decks gets.
- `intro` (optional) is the two-line start phrase, `["ASK ALOUD,", "PRESS START"]` by default; write it in the deck's language.
- `luck` (optional) says which cards the dial's nudge favours: runs `score*count` in the order of the cards, e.g. `"1*22,0*56"` for
  "the first 22 (the major arcana) above the rest"; leave it out and the dial changes only the show. See docs/RANDOMNESS.md.
- `bg` is the background behind the picture: take the artwork's own dark colour (the palette is in the deck's `PAL=` line after
  a first build), or `"settings"` to follow the user's colour setting.
- `back` colours the card back on the wheel: a ring and a core for the diamond, a `fill` for the card body, an `edge` for its
  outline. Take them from the artwork's palette so the wheel looks like part of the deck.

## 3. Write `cards.txt`

One line per card, `TITLE | text`, in the order of the pictures. The title only appears in the file (as a comment, so you can find
a card when editing); the text is what the bar shows after the picture.

```
IVAN THE FOOL | TAKE THE FIRST STEP
EMELYA AND THE PIKE | WISH WITH CARE
```

Rules for the text, all checked by the tool:

- **Two lines of 13 characters at most.** The display is 72 pixels wide; words wrap on spaces, so a 26-character message with
  short words fits and one long word does not. Aim for 12–24 characters: a short command or a hint, not a paragraph.
- **Capitals, any language the bar's font has** (Latin and Cyrillic both work; checked on the bar). The file is UTF-8 and
  `RECORD` counts bytes, so a Cyrillic letter takes two; the tools count this for you. The header may use them too (the start phrase of Fairy tales is Russian); the app finds the first item by byte.
  The artwork's own catalogue of Fairy tales had long Russian interpretations; for the deck each card got a short line that
  keeps the "upright" meaning (the *Ivan the Fool* card → "СДЕЛАЙ ПЕРВЫЙ ШАГ"). A deck's title is a comment, so it may be
  in any language too.

The Fairy tales pictures follow the usual tarot order, so the texts were written by position: card 0 is the Fool, 1 the Magician,
22–35 wands, 36–49 cups, 50–63 swords, 64–77 pentacles. A deck may have any number of cards.

## Text-only decks and variants

A folder without pictures builds a text deck: `cards.txt` alone gives the cards, and `deck.json` can say `"repeat": false`,
`"spread": 90` (a whole game), `"steps": ["number", "text"]` (a big number, then the text) and a `back` with its own `rows`
(`A` is `ring`, `B` is `core`). In the text, ` / ` starts a new line and `|` lists variants of a line, one shown by chance. See
`assets/decks/loto`, built from three lists of the folk names of lotto barrels (a number with no folk name there is called by
its number in words). Every variant must fit two lines of 13 characters; the tool says which one does not.

## Decks drawn by code

Some decks have no source pictures to convert: the pictures follow from the deck's structure (roulette pockets, the six lines of a
hexagram, the pips of a domino). `tools/make-generated-decks.ts` draws them with `tools/lib/pixels.ts` (a 72×16 canvas with lines,
bitmaps and a 3×5 font) into `assets/decks/<id>/` together with `cards.txt`; the `deck.json` next to them is written by hand.
`pnpm decks` runs it before building the decks. To add one, add a function there that returns the cards (title, text, picture) and a
`write(...)` line, and write the deck's `deck.json`. A deck may show the picture alone (`"steps": ["art"]`), or the text first, or a
number (`"steps": ["text", "number"]`).

## 4. Build and check

```sh
pnpm deck assets/decks/fairy          # writes src/deck-fairy.txt and adds "Fairy tales" to the settings list
pnpm check-deck src/deck-fairy.txt   # every item the right size, 16 lines of 72 for art, at most 2 lines for text
```

`pnpm decks` rebuilds every deck from `assets/`, and refreshes the deck list and the README's table; `pnpm build` and `pnpm test` do it first.
The deck files `src/deck-*.txt` are not committed; CI fails if what `pnpm decks` writes into `assets/` and `src/appmeta/` differs from what is committed.

## 5. Try it on the bar

```sh
pnpm check                       # typecheck, lint, tests (the shipped decks are tested too)
pnpm build && sh tools/push.sh <bar address> <token>
```

The cards passing by on the wheel are the same dim strip for every deck; only the middle card shows the deck's card back, so
there is nothing to render for a new deck. Open the app, choose the deck in **Setup → Deck**, press Start. Look for: the card back readable on the wheel; the
picture readable on the chosen background; the text fitting; the reading ending without an error screen. If the deck cannot be
loaded, the bar shows which file and item is wrong.

## Checklist

- [ ] 72×16 RGBA pictures `00…NN.png`, transparent background
- [ ] folder name ≤ 7 characters, unique `order`
- [ ] `deck.json` colours taken from the artwork
- [ ] `cards.txt`, text ≤ 2 × 13 characters
- [ ] `pnpm deck …` and `pnpm check-deck …` pass
- [ ] `pnpm check` passes; committed `src/deck-<id>.txt`, `settings.json`, 
