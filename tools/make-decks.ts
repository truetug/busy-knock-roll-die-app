// Builds every src/deck-<id>.txt: a variable-length text header, a delimiter line, then the items - all plain, readable text.
//
// Decks made of pictures come from the folders in assets/decks (see build-deck.ts, which builds one); the 8 ball and the dice
// are written here. The shared pieces are in lib/deckkit.ts.
//
// Header: one KEY=value per line, ended by the line "---"; lines starting with "#" are comments.
//   NAME    short title shown in the app's settings (the deck id is the file name: deck-<id>.txt)
//   ORDER   position in the settings list (optional; unnumbered decks follow, by id)
//   LABEL   small tag drawn on "number" results, e.g. D20
//   COUNT   items in the deck
//   REPEAT  1: a result may repeat (dice, ball); 0: drawn items leave the pool
//   SPREAD  results per reading, unless the user's setting overrides it
//   BG      default reveal background, RRGGBB, or "settings" (the user's colour setting)
//   INTRO1/INTRO2  the two lines of the start screen
//   PAL     comma-separated RRGGBB for art steps, at most 31 (xpm2 allows 32 colours incl. transparent)
//   RECORD  bytes per item (when any step has a screen written in the item)
//   BACK    repeatable; one pixel row of the card back drawn on the wheel's framed card, up to 15x11, '.' transparent,
//           otherwise the BACKPAL index as ALPHABET[i]
//   BACKPAL comma-separated RRGGBB for BACK
//   BACKFILL/BACKEDGE  colours of the card back's body and outline, RRGGBB
//   STEP    repeatable; one screen of an item's result, shown in order, Start moves to the next:
//             art[:bg]            a picture: 16 lines of 72 characters, '.' transparent, else the PAL index as ALPHABET[i]
//             text[:bg]           text: up to two lines of 13 characters
//             die                 a die face for the item number (nothing written in the item)
//             number[:bg]         the item number (nothing written in the item)
// Item n (1-based) is the RECORD bytes at dataStart + (n-1)*RECORD. It is its screens in the order of the STEP lines, a blank
// line between them; lines starting with "#" are comments (a title line at the top, and the last line: a run of dashes that
// fills the item up to RECORD bytes, so an item can be edited as text - keep the total, adding dashes for every character removed).

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDeck } from "./build-deck.ts";
import { ASSETS, type Back, pack, screenText, syncReadme, syncSettings, writeDeck } from "./lib/deckkit.ts";

const DECKS = join(ASSETS, "decks");
const ANSWERS = readFileSync(join(ASSETS, "texts", "ball.txt"), "utf8")
  .split("\n")
  .filter((l) => l.trim() && !l.startsWith("#"));
const INTRO = { INTRO1: "ASK ALOUD,", INTRO2: "PRESS START" };
const BALL_BACK: Back = {
  BACKPAL: "FFFFFF",
  rows: [".AAA.", "A...A", "A...A", ".AAA.", "A...A", "A...A", ".AAA."],
  fill: "0B1B4D",
  edge: "5B7BD5",
};

// Decks made of pictures: one folder each in assets/decks.
const infos = readdirSync(DECKS)
  .sort()
  .map((folder) => buildDeck(join(DECKS, folder)));

const ball = pack(ANSWERS.map((answer, n) => `# ${n + 1}\n${screenText(answer.toUpperCase())}`));
writeDeck(
  "ball",
  "8 ball",
  17,
  { COUNT: ANSWERS.length, RECORD: ball.record, REPEAT: 1, SPREAD: 1, BG: "0B1B4D", LUCK: "2*10,1*5,0*5", ...INTRO },
  ["text"],
  ball.body,
  BALL_BACK,
);

const DICE: Record<number, number> = { 4: 19, 6: 20, 8: 21, 10: 22, 12: 23, 20: 24, 100: 25 };
for (const [sides, order] of Object.entries(DICE)) {
  const n = Number(sides);
  const common = {
    REPEAT: 1,
    SPREAD: 1,
    BG: "2E1065",
    LUCK: "number",
    INTRO1: n === 6 ? "ROLL THE DIE" : `ROLL D${n}`,
    INTRO2: "PRESS START",
  };
  if (n === 6) writeDeck("d6", "d6", order, { COUNT: 6, ...common }, ["die"]);
  else writeDeck(`d${n}`, `d${n}`, order, { LABEL: `D${n}`, COUNT: n, ...common }, ["number"]);
}

syncSettings();
syncReadme([
  ...infos,
  { name: "8 ball", order: 17, description: "one of 20 classic answers; the dial favours the positive ones", results: 1 },
  { name: "d4 ... d100", order: 19, description: "a die face (d6) or a big number; the dial favours the higher", results: 1 },
]);
