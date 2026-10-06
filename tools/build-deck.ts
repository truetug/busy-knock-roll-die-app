// Builds src/deck-<id>.txt from a folder of 72x16 PNGs: `pnpm deck assets/decks/cosmic`.
//
// The folder name is the deck id (at most 7 characters: the bar rejects storage paths of 64+ characters). It holds
//   00.png, 01.png, ...  one picture per card, in order, 72x16, transparent background (alpha 0/255); none for a text-only deck
//   deck.json            {"name": "Cosmic", "order": 3, "bg": "RRGGBB" or "settings",
//                         "back": {"ring", "core", "fill", "edge"}     (card back colours, RRGGBB)
//                         "intro": ["ASK ALOUD,", "PRESS START"]}      (optional)
//   cards.txt            one "TITLE | text shown after the picture" line per card, in the order of the pictures. In the text
//                        " / " starts a new line, and "|" inside a line lists variants of it, one of which is shown by chance
// More than 31 colours across the deck are merged to the nearest 31. Then run `pnpm check`.

import { readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { argv } from "node:process";
import { artDeck, diamondBack, hex, pack, screenText, syncSettings, writeDeck } from "./lib/deckkit.ts";

type Meta = {
  name: string;
  order: number;
  /** One line for the README's table of decks. */
  description: string;
  bg?: string;
  intro?: [string, string];
  /** Text-only decks (no pictures): whether a barrel may come twice, and how many are drawn in a reading. */
  repeat?: boolean;
  spread?: number;
  /** For the dial's nudge: where the items' scores come from (`number`, or runs like `1*22,0*56`); see src/random/luck.ts. */
  luck?: string;
  /** The steps of a result, as in a deck header (`number`, `text`...); by default the picture and its text, or the text alone. */
  steps?: string[];
  /** The card back: a diamond in `ring` and `core`, or `rows` of those two colours (`A` is ring, `B` is core, `.` clear). */
  back: { ring: string; core: string; fill: string; edge: string; rows?: string[] };
};

/** [title, text] for every card, from cards.txt: "TITLE | text", the text's lines joined by " / ". */
function cardsOf(folder: string): [string, string][] {
  const rows = readFileSync(join(folder, "cards.txt"), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"));
  return rows.map((row) => {
    const bar = row.indexOf("|");
    if (bar < 0) throw new Error(`${folder}/cards.txt: no '|' in "${row}"`);
    return [
      row.slice(0, bar).trim().toUpperCase(),
      row
        .slice(bar + 1)
        .trim()
        .toUpperCase(),
    ];
  });
}

/** What the README's table of decks says about a deck. */
export type DeckInfo = { name: string; order: number; description: string; results: number };

export function buildDeck(path: string): DeckInfo {
  const folder = resolve(path);
  const id = basename(folder);
  const meta: Meta = JSON.parse(readFileSync(join(folder, "deck.json"), "utf8"));
  const pictures = readdirSync(folder)
    .filter((f) => /^\d\d.*\.png$/.test(f))
    .sort()
    .map((f) => join(folder, f));
  if (id.length > 7) throw new Error(`deck id '${id}' is longer than 7 characters`);

  const cards = cardsOf(folder);
  if (pictures.length > 0 && cards.length !== pictures.length) {
    throw new Error(`${folder}/cards.txt: needs ${pictures.length} lines (one per picture), found ${cards.length}`);
  }
  const art = pictures.length > 0 ? artDeck(pictures) : null;
  const steps = meta.steps ?? (art ? ["art", "text:1E1B4B"] : ["text"]);
  // The screens written in an item, in the order of the steps that show them.
  const written = steps.map((step) => step.split(":")[0]).filter((kind) => kind === "art" || kind === "text");
  if (written.includes("art") && !art) throw new Error(`${folder}: an art step needs pictures`);
  const { record, body } = pack(
    cards.map(([title, text], n) => {
      const screens = written.map((kind) => (kind === "art" ? (art?.pics[n] ?? "") : screenText(text)));
      return `# ${n + 1} ${title}\n${screens.join("\n\n")}`;
    }),
  );
  const { ring, core, fill, edge, rows } = meta.back;
  const back = rows ? { BACKPAL: `${ring},${core}`, rows, fill, edge } : diamondBack(11, 9, ring, core, fill, edge);
  const [intro1, intro2] = meta.intro ?? ["ASK ALOUD,", "PRESS START"];
  writeDeck(
    id,
    meta.name,
    meta.order,
    {
      COUNT: cards.length,
      RECORD: record,
      REPEAT: meta.repeat ? 1 : 0,
      SPREAD: meta.spread ?? (art ? 3 : 1),
      BG: meta.bg ?? "settings",
      ...(meta.luck ? { LUCK: meta.luck } : {}),
      INTRO1: intro1,
      INTRO2: intro2,
      ...(art ? { PAL: art.palette.map(hex).join(",") } : {}),
    },
    steps,
    body,
    back,
  );
  return { name: meta.name, order: meta.order, description: meta.description, results: meta.spread ?? (art ? 3 : 1) };
}

if (import.meta.main) {
  const folders = argv.slice(2);
  if (folders.length === 0) {
    console.error("usage: pnpm deck <folder> [folder...]   e.g. pnpm deck assets/decks/cosmic");
    process.exit(2);
  }
  for (const folder of folders) buildDeck(folder);
  syncSettings();
}
