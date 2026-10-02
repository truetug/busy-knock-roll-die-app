# Deck files

A deck is a single text file, `resources/deck-<id>.txt`, made of a **header** and **records**. The app reads the header when it
starts and, when something is picked, only that item's record - by HTTP Range request - so decks can be large.

The `<id>` is the file's name between `deck-` and `.txt` (letters, digits, `-`, `_`), at most 7 characters (with the app id `app.busy.knock_roll`): the bar's storage API
refuses paths of 64 characters or more. The app lists every such file in
**Settings → Deck**.

## Header

Lines of `KEY=value`, ended by a line that is exactly `---`. The header may be any length (up to 4 KiB).

| Key | Meaning |
| --- | --- |
| `NAME` | short title for the settings screen (default: the id) |
| `ORDER` | position in the settings list; unnumbered decks come last, by id |
| `COUNT` | number of items – required |
| `REPEAT` | `1`: a result may repeat (dice, ball); default `0`, drawn items leave the pool |
| `SPREAD` | results per reading when the setting says Auto, default 3 |
| `BG` | background colour `RRGGBB`, or `settings` for the user's colour setting; default `2E1065` |
| `INTRO1`, `INTRO2` | the two lines of the start screen, about 13 characters each |
| `LABEL` | small tag on number results, e.g. `D20` |
| `PAL` | art only: comma-separated `RRGGBB`, at most 31 |
| `BACK`, `BACKPAL`, `BACKFILL`, `BACKEDGE` | the deck's own card back, see below; all optional |
| `STEP` | one screen of a result; repeat the line for several – required, in order |

### Steps

`STEP=kind[:bytes[:background]]`

| Step | Bytes in the record | Shows |
| --- | --- | --- |
| `art` | 1152 (72×16) | a picture: one character per pixel; `.` is transparent, otherwise the character picks a `PAL` entry (`A` is the first, then `B`... `Z`, `a`... `z`, `0`... `9`, `+`) |
| `text:N` | `N` | text, space-padded, shown on at most two lines of 13 characters (upper case reads best) |
| `die` | 0 | a die face with as many pips as the item's number (1–6) |
| `number` | 0 | the item's number, large |

A step may name its own background: `STEP=text:32:1E1B4B`.

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

## Records

Item *n* (1-based) starts at `dataStart + (n − 1) × recordSize`, where `dataStart` is the first byte after the `---` line and
`recordSize` is the sum of the steps' bytes. Inside a record the steps follow one another in the header's order. A deck whose steps
need no bytes (`die`, `number`) has no records at all.

The file size must equal `dataStart + COUNT × recordSize`; otherwise the app refuses the deck and says so.

## Examples

A 20-sided die, a complete file:

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

Three answers (each record is exactly 32 bytes, padded with spaces):

```
NAME=Yes or no
COUNT=3
REPEAT=1
SPREAD=1
INTRO1=ASK ALOUD,
STEP=text:32
---
YES                             NO                              ASK AGAIN                       
```

## What goes wrong, and what the screen says

| Screen | Cause |
| --- | --- |
| `deck-x.txt` / `file not found` | the deck chosen in the settings was removed |
| `bad COUNT ...` | `COUNT` missing, not a whole number, or below 1 |
| `no STEP lines` / `bad STEP ...` | no steps, or an unknown kind |
| `art STEP needs PAL` / `PAL has N colors, max 31` | art without a palette, or too many colours |
| `text STEP needs a size` | `text` without `:bytes` |
| `bad color ...` | a colour that is not six hex digits |
| `name too long ...` | the deck id makes the file's path longer than the storage API accepts |
| `BACK needs BACKPAL`, `BACK must be a rectangle up to 15x11`, `BACK uses "x", not in BACKPAL` | a card back that does not fit the rules above |
| `size A, expected B` | the file is shorter or longer than the header and `COUNT` say |
| `no "---" line ending the header` | the delimiter is missing or beyond 4 KiB |

Press **Start** on an error screen to fall back to the Tarot deck, **Back** to quit. The full message is also in the bar's log.

## Making decks

`tools/make_deck.py` shows one way: it packs 72×16 PNGs (transparent background) into art records, quantising to 31 colours, and
adds texts. Run it with `pnpm decks`. Any program that writes the format above works just as well.
