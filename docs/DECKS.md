# Deck files

A deck is a single text file, `resources/deck-<id>.txt`: a **header**, then the **items**. It is meant to be read and edited by
hand: screens are plain multi-line text with a blank line between them. The app reads the header when it starts and, when
something is picked, only that item (by HTTP Range request), so decks can be large.

The `<id>` is the file's name between `deck-` and `.txt` (letters, digits, `-`, `_`), at most 7 characters (with the app id
`app.busy.knock_roll`): the bar's storage API refuses paths of 64 characters or more. The app lists every such file in
**Settings → Deck**.

A look at a real deck, the 8 ball (the `---` line ends the header):

```
NAME=8 ball
COUNT=20
RECORD=56
REPEAT=1
SPREAD=1
BG=0B1B4D
INTRO1=ASK ALOUD,
INTRO2=PRESS START
STEP=text
---
# 1
IT IS CERTAIN
# -----------------------------------
# 2
IT IS
DECIDEDLY SO
# ------------------------------
```

## Header

Lines of `KEY=value`, ended by a line that is exactly `---`. The header may be any length (up to 4 KiB). Lines starting with `#` are comments.

**The header, with its `---` line, must end on a multiple of 1024 bytes.** Pad it with a comment line of dashes just before the `---`
(`tools/make-decks.ts` does this for you; the first example above is shortened). The app reads the header in blocks of 1 KiB, each a
byte range decoded on its own; a block that ends in the middle of a two-byte letter (Cyrillic, say) is invalid UTF-8, and the bar's
JavaScript engine dies on it with "fatal error 120" - the app then needs a restart of the bar. A header that ends on a block boundary
keeps the first block free of any letter of the items. `pnpm check-deck` reports a header that does not.

| Key | Meaning |
| --- | --- |
| `NAME` | short title for the settings screen (default: the id) |
| `ORDER` | position in the settings list; unnumbered decks come last, by id |
| `COUNT` | number of items – required |
| `RECORD` | bytes per item – required when a step has a screen written in the item (`art`, `text`) |
| `REPEAT` | `1`: a result may repeat (dice, ball); default `0`, drawn items leave the pool |
| `SPREAD` | results per reading when the setting says Auto, default 3. From 10 up it is a whole game (a lotto's 90 barrels): the setting does not apply and no progress pips are drawn |
| `LUCK` | which items are better, for the dial's nudge ([RANDOMNESS.md](RANDOMNESS.md)): `number` (the item number is the score, for dice) or runs `score*count` in item order, e.g. `1*22,0*56` (the first 22 score 1, the next 56 score 0). Higher is better; without it the dial changes only the show |
| `BG` | background colour `RRGGBB`, or `settings` for the user's colour setting; default `2E1065` |
| `INTRO1`, `INTRO2` | the two lines of the start screen, about 13 characters each |
| `LABEL` | small tag on number results, e.g. `D20` |
| `PAL` | art only: comma-separated `RRGGBB`, at most 31 |
| `BACK`, `BACKPAL`, `BACKFILL`, `BACKEDGE` | the deck's own card back, see below; all optional |
| `STEP` | one screen of a result; repeat the line for several – required, in order |

### Steps

`STEP=kind[:background]`; each line is one screen of an item's result, shown in order, and Start moves on to the next.

| Step | Written in the item | Shows |
| --- | --- | --- |
| `art` | 16 lines of 72 characters | a picture: one character per pixel; `.` is transparent, otherwise the character picks a `PAL` entry (`A` is the first, then `B`... `Z`, `a`... `z`, `0`... `9`, `+`) |
| `text` | up to 2 lines of 13 characters | text, as written (upper case reads best; any letters the font has, Cyrillic included). A line may list **variants** with `|`: `SWAN|GOOSE|PAIR` shows one of them, by chance, every time the item is opened. Each line chooses on its own |
| `die` | nothing | a die face with as many pips as the item's number (1–6) |
| `number` | nothing | the item's number, large |

A step may name its own background: `STEP=text:1E1B4B`.

### Card backs

The wheel shows face-down cards; the framed one in the middle carries a small picture. A deck can define its own, so its cards look
like part of the set:

```
BACKPAL=FFD24D,C4B5FD
BACKFILL=2E1065
BACKEDGE=FFD24D
BACK=.....A.....
BACK=....A.A....
BACK=...A...A...
BACK=..A..B..A..
BACK=AA.BBBBB.AA
BACK=..A..B..A..
BACK=...A...A...
BACK=....A.A....
BACK=.....A.....
```

- `BACK` lines are the picture, one pixel row each: all rows the same length, **at most 15×11**. `.` is transparent; any other character
  is the `BACKPAL` colour with that index (`A` is the first, then `B`...), up to 31 colours.
- `BACKFILL` is the card's body and `BACKEDGE` its outline (side cards; the framed one is outlined in gold). Either may be given
  without a picture.
- Without any of these the deck uses the app's default diamond. The user can override every deck's back in **Settings → Card
  back** (Diamond, Lattice, Sparkle, Plain); the default, Auto, uses the deck's own.

## Items

The file is UTF-8: `RECORD` and the offsets count bytes (a Cyrillic letter is two), while the line limits count characters.

Item *n* (1-based) is the `RECORD` bytes starting at `dataStart + (n − 1) × RECORD`, where `dataStart` is the first byte after the
`---` line. An item is its screens (those steps that are written in it, in the order of the `STEP` lines) as plain text:

- a **blank line** ends a screen; extra blank lines and trailing spaces do no harm (they are cut when the item is shown);
- lines starting with **`#`** are comments: a title at the top, and the last line of every item - a run of dashes - which fills
  the item up to exactly `RECORD` bytes;
- an `art` screen is exactly 16 lines of 72 characters; a `text` screen at most 2 lines of 13 characters (longer lines are wrapped
  and anything past two lines is cut).

Every item has the same size, so that an item can be found by its number alone without reading the file. That is the one thing
to keep in mind when editing: **the dashes line is the slack.** Take a character out of a text and add a dash to the dashes line;
put one in and remove a dash. `tools/check-deck.ts` points at the first item whose size is off (a wrong item shifts all that follow):

```sh
pnpm check-deck src/deck-ball.txt
```

The file's size must equal `dataStart + COUNT × RECORD`, otherwise the app refuses the deck and says so. A deck whose steps need
nothing written (`die`, `number`) has no items at all. Generated decks leave 24 spare bytes in every item.

## Examples

A 20-sided die, a complete file (nothing is written in the items, so there are none):

```
NAME=d20
LABEL=D20
COUNT=20
REPEAT=1
SPREAD=1
INTRO1=ROLL D20
INTRO2=PRESS START
STEP=number
---
```

Three answers, 18 bytes each: the text, then a line of dashes that fills the rest (this is what `tools/check-deck.ts` counts):

```
NAME=Yes or no
COUNT=3
RECORD=18
REPEAT=1
SPREAD=1
INTRO1=ASK ALOUD,
STEP=text
---
YES
# -----------
NO
# ------------
ASK AGAIN
# -----
```

## What goes wrong, and what the screen says

| Screen | Cause |
| --- | --- |
| `deck-x.txt` / `file not found` | the deck chosen in the settings was removed |
| `bad COUNT ...` | `COUNT` missing, not a whole number, or below 1 |
| `no STEP lines` / `bad STEP ...` | no steps, or an unknown kind |
| `art STEP needs PAL` / `PAL has N colors, max 31` | art without a palette, or too many colours |
| `bad RECORD ...` | `RECORD` missing or not a whole number, in a deck with `art` or `text` steps |
| `item N: ... screens, the header's STEPs need M` | an item with a different number of screens than the `STEP` lines that are written in it |
| `item N: art must be 16 lines of 72 characters` / `art uses "x", not in PAL` | an art screen that is the wrong shape, or uses a character with no colour |
| `bad color ...` | a colour that is not six hex digits |
| `name too long ...` | the deck id makes the file's path longer than the storage API accepts |
| `BACK needs BACKPAL`, `BACK must be a rectangle up to 15x11`, `BACK uses "x", not in BACKPAL` | a card back that does not fit the rules above |
| `size A, expected B` | the file is shorter or longer than `COUNT` × `RECORD` say: some item was edited without keeping its size |
| `no "---" line ending the header` | the delimiter is missing or beyond 4 KiB |

Press **Start** on an error screen to fall back to the Tarot deck, **Back** to quit. The full message is also in the bar's log.

## Making decks

A step-by-step example is in [MAKING_A_DECK.md](MAKING_A_DECK.md).

Decks made of pictures are built from a folder of PNGs:

```sh
pnpm deck assets/decks/cosmic        # writes src/deck-cosmic.txt and adds it to the settings list
```

The folder name is the deck id (at most 7 characters). It holds:

- `00.png`, `01.png`, … - one 72×16 picture per card, in order, transparent background. More than 31 colours across the deck are
  merged to the nearest 31.
- `deck.json` - `{"name": "Cosmic", "order": 3, "bg": "050816", "back": {"ring": "7DD3FC", "core": "FACC15", "fill": "050816", "edge": "6366F1"}}`
  (`bg` may be `"settings"`; optional `"intro": ["ASK ALOUD,", "PRESS START"]`).
- `cards.txt` - one `TITLE | text shown after the picture` line per card, in the order of the pictures.

`pnpm decks` rebuilds every deck. Any program that writes the
format above works just as well.
