// Draws the decks that are made by code rather than by hand: for each, assets/decks/<id>/NN.png (when it has pictures) and
// cards.txt. Their deck.json files are written by hand, next to the output. Run by `pnpm decks` before the decks are built;
// the output is committed, so CI can check it is up to date.
//
//   roul    European roulette: the 37 pockets on their colours
//   cards   the 52 playing cards, ace high
//   runes   the 24 runes of the Elder Futhark
//   iching  the 64 hexagrams of the I Ching, in King Wen's order
//   domino  the 28 bones of a double-six set
//   2d6     the 36 throws of two dice
//   dirs    the 8 directions of the compass, with an arrow
//   bingo   the 75 balls of bingo, a letter and a number
//   tcount  the positions 1..78 of a physical tarot deck: "count N cards from the top"

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Canvas, PIPS, textWidth } from "./lib/pixels.ts";

const ASSETS = join(import.meta.dirname, "..", "assets", "decks");

type Card = { title: string; text: string; picture?: Canvas };

/** Writes a deck's pictures (00.png, 01.png...) and its cards.txt. */
function write(id: string, note: string, cards: Card[]): void {
  const dir = join(ASSETS, id);
  mkdirSync(dir, { recursive: true });
  for (const [i, card] of cards.entries()) card.picture?.save(join(dir, `${String(i).padStart(2, "0")}.png`));
  const lines = cards.map((card) => `${card.title} | ${card.text}`);
  writeFileSync(join(dir, "cards.txt"), `# ${note}\n# Written by tools/make-generated-decks.ts: change it there.\n${lines.join("\n")}\n`);
  console.log(id, cards.length, "cards");
}

// ── Roulette ────────────────────────────────────────────────────────────────
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function roulette(): Card[] {
  return Array.from({ length: 37 }, (_, pocket) => {
    const field = pocket === 0 ? "0B7A3B" : RED_NUMBERS.has(pocket) ? "C1121F" : "15151A";
    const picture = new Canvas(field);
    const digits = String(pocket);
    picture.text(digits, Math.floor((72 - textWidth(digits, 3)) / 2), 0, "FFFFFF", 3);
    const text =
      pocket === 0
        ? "ZERO / GREEN"
        : `${RED_NUMBERS.has(pocket) ? "RED" : "BLACK"} / ${pocket % 2 === 0 ? "EVEN" : "ODD"}, ${pocket <= 18 ? "1-18" : "19-36"}`;
    return { title: String(pocket), text, picture };
  });
}

// ── Playing cards ───────────────────────────────────────────────────────────
const SUITS = [
  {
    name: "SPADES",
    red: false,
    rows: ["....X....", "...XXX...", "..XXXXX..", ".XXXXXXX.", "XXXXXXXXX", "XXXXXXXXX", ".XX.X.XX.", "....X....", "...XXX..."],
  },
  {
    name: "HEARTS",
    red: true,
    rows: [".XX...XX.", "XXXX.XXXX", "XXXXXXXXX", "XXXXXXXXX", ".XXXXXXX.", "..XXXXX..", "...XXX...", "....X....", "........."],
  },
  {
    name: "DIAMONDS",
    red: true,
    rows: ["....X....", "...XXX...", "..XXXXX..", ".XXXXXXX.", "XXXXXXXXX", ".XXXXXXX.", "..XXXXX..", "...XXX...", "....X...."],
  },
  {
    name: "CLUBS",
    red: false,
    rows: ["...XXX...", "..XXXXX..", "...XXX...", ".XX.X.XX.", "XXXXXXXXX", "XXXXXXXXX", ".XX.X.XX.", "....X....", "...XXX..."],
  },
];
const RANKS = [
  ["2", "TWO"], ["3", "THREE"], ["4", "FOUR"], ["5", "FIVE"], ["6", "SIX"], ["7", "SEVEN"], ["8", "EIGHT"],
  ["9", "NINE"], ["10", "TEN"], ["J", "JACK"], ["Q", "QUEEN"], ["K", "KING"], ["A", "ACE"],
]; // biome-ignore format: one rank per entry

function playingCards(): Card[] {
  return RANKS.flatMap(([mark, rank]) =>
    SUITS.map((suit) => {
      const ink = suit.red ? "C1121F" : "15151A";
      const picture = new Canvas("F8F8F2");
      const group = textWidth(mark, 2) + 8 + 9;
      const x = Math.floor((72 - group) / 2);
      picture.text(mark, x, 3, ink, 2);
      picture.bitmap(suit.rows, x + textWidth(mark, 2) + 8, 3, ink);
      return { title: `${rank} OF ${suit.name}`, text: `${rank} / OF ${suit.name}`, picture };
    }),
  );
}

// ── Runes ───────────────────────────────────────────────────────────────────
// Strokes in a box 6 wide and 12 high: [x1, y1, x2, y2].
type Strokes = number[][];
const RUNES: [string, string, Strokes][] = [
  ["FEHU", "WEALTH", [[1, 0, 1, 12], [1, 4, 5, 0], [1, 8, 5, 4]]],
  ["URUZ", "STRENGTH", [[1, 12, 1, 0], [1, 0, 5, 4], [5, 4, 5, 12]]],
  ["THURISAZ", "THORN", [[1, 0, 1, 12], [1, 3, 5, 6], [5, 6, 1, 9]]],
  ["ANSUZ", "MESSAGE", [[1, 0, 1, 12], [1, 0, 5, 3], [1, 5, 5, 8]]],
  ["RAIDHO", "JOURNEY", [[1, 0, 1, 12], [1, 0, 5, 3], [5, 3, 1, 6], [1, 6, 5, 12]]],
  ["KENAZ", "TORCH", [[4, 2, 1, 6], [1, 6, 4, 10]]],
  ["GEBO", "GIFT", [[1, 2, 5, 10], [1, 10, 5, 2]]],
  ["WUNJO", "JOY", [[1, 0, 1, 12], [1, 0, 5, 3], [5, 3, 1, 6]]],
  ["HAGALAZ", "HAIL", [[1, 0, 1, 12], [5, 0, 5, 12], [1, 4, 5, 8]]],
  ["NAUTHIZ", "NEED", [[3, 0, 3, 12], [1, 4, 5, 8]]],
  ["ISA", "ICE, PAUSE", [[3, 0, 3, 12]]],
  ["JERA", "HARVEST", [[3, 1, 1, 4], [1, 4, 3, 7], [3, 5, 5, 8], [5, 8, 3, 11]]],
  ["EIHWAZ", "ENDURANCE", [[3, 0, 3, 12], [3, 0, 1, 3], [3, 12, 5, 9]]],
  ["PERTHRO", "MYSTERY", [[1, 0, 1, 12], [1, 0, 5, 3], [5, 3, 1, 6], [1, 6, 5, 9], [5, 9, 1, 12]]],
  ["ALGIZ", "PROTECTION", [[3, 0, 3, 12], [3, 5, 1, 1], [3, 5, 5, 1]]],
  ["SOWILO", "THE SUN", [[4, 0, 2, 4], [2, 4, 4, 8], [4, 8, 2, 12]]],
  ["TIWAZ", "VICTORY", [[3, 0, 3, 12], [3, 0, 1, 4], [3, 0, 5, 4]]],
  ["BERKANO", "GROWTH", [[1, 0, 1, 12], [1, 0, 5, 3], [5, 3, 1, 6], [1, 6, 5, 9], [5, 9, 1, 12]]],
  ["EHWAZ", "MOVEMENT", [[1, 0, 1, 12], [5, 0, 5, 12], [1, 0, 3, 3], [3, 3, 5, 0]]],
  ["MANNAZ", "HUMANITY", [[1, 0, 1, 12], [5, 0, 5, 12], [1, 0, 5, 6], [5, 0, 1, 6]]],
  ["LAGUZ", "WATER", [[1, 0, 1, 12], [1, 0, 5, 4]]],
  ["INGWAZ", "SEED", [[3, 2, 5, 6], [5, 6, 3, 10], [3, 10, 1, 6], [1, 6, 3, 2]]],
  ["DAGAZ", "DAWN", [[1, 1, 1, 11], [5, 1, 5, 11], [1, 1, 5, 11], [1, 11, 5, 1]]],
  ["OTHALA", "HERITAGE", [[3, 0, 5, 3], [5, 3, 3, 6], [3, 6, 1, 3], [1, 3, 3, 0], [3, 6, 1, 12], [3, 6, 5, 12]]],
]; // biome-ignore format: one rune per entry

function runes(): Card[] {
  return RUNES.map(([name, meaning, strokes], i) => {
    const picture = new Canvas("1E1B4B");
    for (const [x1, y1, x2, y2] of strokes) {
      picture.line(30 + x1 * 2, 1 + (y1 * 14) / 12, 30 + x2 * 2, 1 + (y2 * 14) / 12, "E0B84C");
    }
    picture.text(String(i + 1), 3, 1, "8B7FD6");
    return { title: name, text: `${name} / ${meaning}`, picture };
  });
}

// ── I Ching ─────────────────────────────────────────────────────────────────
// The trigrams, bottom line first: Heaven 111, Lake 110, Fire 101, Thunder 100, Wind 011, Water 010, Mountain 001, Earth 000.
const TRIGRAM: Record<string, number[]> = {
  H: [1, 1, 1], L: [1, 1, 0], F: [1, 0, 1], T: [1, 0, 0], W: [0, 1, 1], A: [0, 1, 0], M: [0, 0, 1], E: [0, 0, 0],
}; // biome-ignore format: one per line is longer than it reads
// The 64 hexagrams in King Wen's order: upper trigram, lower trigram, name.
const HEXAGRAMS: [string, string][] = [
  ["HH", "THE CREATIVE"], ["EE", "THE RECEPTIVE"], ["AT", "DIFFICULTY AT THE BEGINNING"], ["MA", "YOUTHFUL FOLLY"], ["AH", "WAITING"],
  ["HA", "CONFLICT"], ["EA", "THE ARMY"], ["AE", "HOLDING TOGETHER"], ["WH", "SMALL TAMING"], ["HL", "TREADING"], ["EH", "PEACE"], ["HE", "STANDSTILL"],
  ["HF", "FELLOWSHIP"], ["FH", "GREAT POSSESSION"], ["EM", "MODESTY"], ["TE", "ENTHUSIASM"], ["LT", "FOLLOWING"],
  ["MW", "WORK ON THE DECAYED"], ["EL", "APPROACH"], ["WE", "CONTEMPLATION"], ["FT", "BITING THROUGH"], ["MF", "GRACE"], ["ME", "SPLITTING APART"],
  ["ET", "RETURN"], ["HT", "INNOCENCE"], ["MH", "GREAT TAMING"], ["MT", "NOURISHMENT"], ["LW", "GREAT EXCESS"], ["AA", "THE ABYSMAL"],
  ["FF", "THE CLINGING"], ["LM", "INFLUENCE"], ["TW", "DURATION"], ["HM", "RETREAT"], ["TH", "GREAT POWER"], ["FE", "PROGRESS"],
  ["EF", "DARKENING OF THE LIGHT"], ["WF", "THE FAMILY"], ["FL", "OPPOSITION"], ["AM", "OBSTRUCTION"], ["TA", "DELIVERANCE"], ["ML", "DECREASE"],
  ["WT", "INCREASE"], ["LH", "BREAKTHROUGH"], ["HW", "COMING TO MEET"], ["LE", "GATHERING TOGETHER"], ["EW", "PUSHING UPWARD"], ["LA", "OPPRESSION"],
  ["AW", "THE WELL"], ["LF", "REVOLUTION"], ["FW", "THE CAULDRON"], ["TT", "THE AROUSING"], ["MM", "KEEPING STILL"], ["WM", "DEVELOPMENT"], ["TL", "THE MARRYING MAIDEN"],
  ["TF", "ABUNDANCE"], ["FM", "THE WANDERER"], ["WW", "THE GENTLE"], ["LL", "THE JOYOUS"], ["WA", "DISPERSION"], ["AL", "LIMITATION"],
  ["WL", "INNER TRUTH"], ["TM", "SMALL EXCESS"], ["AF", "AFTER COMPLETION"], ["FA", "BEFORE COMPLETION"],
]; // biome-ignore format: five to a row

function iChing(): Card[] {
  return HEXAGRAMS.map(([trigrams, name], i) => {
    const lines = [...TRIGRAM[trigrams[1]], ...TRIGRAM[trigrams[0]]]; // bottom to top
    const picture = new Canvas("1E1B4B");
    lines.forEach((solid, k) => {
      const y = 12 - k * 2;
      if (solid) picture.rect(16, y, 40, 1, "E0B84C");
      else {
        picture.rect(16, y, 17, 1, "E0B84C");
        picture.rect(39, y, 17, 1, "E0B84C");
      }
    });
    const number = String(i + 1);
    picture.text(number, 3, 1, "8B7FD6");
    return { title: `${i + 1} ${name}`, text: name, picture };
  });
}

// ── Dominoes and two dice ───────────────────────────────────────────────────
function dominoes(): { cards: Card[]; sums: number[] } {
  const bones: [number, number][] = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) bones.push([a, b]);
  bones.sort((p, q) => p[0] + p[1] - (q[0] + q[1]) || p[0] - q[0]); // worst first: the dial favours the bigger sums
  const WORDS = ["BLANK", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX"];
  const cards = bones.map(([a, b]) => {
    const picture = new Canvas("F4EEDC");
    picture.rect(35, 1, 2, 14, "8A7F66");
    [a, b].forEach((face, half) => {
      const cx = half === 0 ? 17 : 54;
      for (const [col, row] of PIPS[face]) picture.rect(cx - 10 + col * 9 + 0, 2 + row * 5, 3, 3, "15151A");
    });
    return { title: `${a}-${b}`, text: a === b ? `DOUBLE / ${WORDS[a]}` : `${WORDS[a]} / ${WORDS[b]}`, picture };
  });
  return { cards, sums: bones.map(([a, b]) => a + b) };
}

function twoDice(): { cards: Card[]; sums: number[] } {
  const throws: [number, number][] = [];
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) throws.push([a, b]);
  throws.sort((p, q) => p[0] + p[1] - (q[0] + q[1]) || p[0] - q[0]);
  const cards = throws.map(([a, b]) => {
    const picture = new Canvas("0F3D2E");
    [a, b].forEach((face, d) => {
      const x = d === 0 ? 14 : 44;
      picture.rect(x, 1, 14, 14, "F8F8F2");
      for (const [col, row] of PIPS[face]) picture.rect(x + 2 + col * 4 + 1, 3 + row * 4 + 1, 2, 2, "15151A");
    });
    picture.rect(32, 7, 6, 2, "F8F8F2");
    picture.rect(34, 5, 2, 6, "F8F8F2");
    return { title: `${a}+${b}`, text: `SUM / ${a + b}`, picture };
  });
  return { cards, sums: throws.map(([a, b]) => a + b) };
}

// ── Compass ─────────────────────────────────────────────────────────────────
const DIRECTIONS: [string, number, number][] = [
  ["NORTH", 0, -1], ["NORTHEAST", 1, -1], ["EAST", 1, 0], ["SOUTHEAST", 1, 1],
  ["SOUTH", 0, 1], ["SOUTHWEST", -1, 1], ["WEST", -1, 0], ["NORTHWEST", -1, -1],
]; // biome-ignore format: two to a row

function compass(): Card[] {
  return DIRECTIONS.map(([name, dx, dy]) => {
    const picture = new Canvas("12294A");
    const length = Math.hypot(dx, dy);
    const [ux, uy] = [dx / length, dy / length];
    const reach = dx !== 0 && dy !== 0 ? 9 : dx !== 0 ? 14 : 7; // the screen is wider than it is tall
    const [cx, cy] = [36, 8];
    const [tipX, tipY] = [cx + ux * reach * (dx !== 0 && dy !== 0 ? 1.4 : 1), cy + uy * reach];
    const [tailX, tailY] = [cx - ux * reach * (dx !== 0 && dy !== 0 ? 1.4 : 1), cy - uy * reach];
    picture.line(tailX, tailY, tipX, tipY, "E0B84C");
    for (const turn of [0.6, -0.6]) {
      const [hx, hy] = [ux * Math.cos(turn) - uy * Math.sin(turn), ux * Math.sin(turn) + uy * Math.cos(turn)];
      picture.line(tipX, tipY, tipX - hx * 5 * (dx !== 0 && dy !== 0 ? 1.2 : 1), tipY - hy * 5, "E0B84C");
    }
    return { title: name, text: name, picture };
  });
}

// ── Bingo and the tarot count ───────────────────────────────────────────────
function bingo(): Card[] {
  return Array.from({ length: 75 }, (_, i) => ({ title: String(i + 1), text: "BINGO"[Math.floor(i / 15)] }));
}

function tarotCount(): Card[] {
  return Array.from({ length: 78 }, (_, i) => {
    const n = i + 1;
    return { title: String(n), text: n === 1 ? "TOP / CARD" : `COUNT ${n} / FROM THE TOP` };
  });
}

write(
  "roul",
  "European roulette: the 37 pockets, 0 first. The picture is the pocket's number on its colour; Start shows colour, parity and half.",
  roulette(),
);
write(
  "cards",
  "The 52 playing cards, from the lowest (2) to the highest (ace), the suits in turn: spades, hearts, diamonds, clubs.",
  playingCards(),
);
write("runes", "The 24 runes of the Elder Futhark, in their traditional order.", runes());
write(
  "iching",
  "The 64 hexagrams of the I Ching in King Wen's order; the picture draws the six lines, the lowest at the bottom.",
  iChing(),
);
const bones = dominoes();
write("domino", "The 28 bones of a double-six set, ordered by the sum of their pips (the dial favours the bigger).", bones.cards);
const pairs = twoDice();
write("2d6", "The 36 throws of two dice, ordered by their sum, so that the sums come up as often as they do with real dice.", pairs.cards);
write("dirs", "The eight directions of the compass.", compass());
write("bingo", "The 75 balls of bingo: the letter first, then the number.", bingo());
write("tcount", "A position in a physical tarot deck of 78: count that many cards from the top.", tarotCount());

// The runs for the decks' LUCK lines (score*count, worst first): the sums of the dominoes and of the two dice.
const runs = (sums: number[]): string => {
  const out: string[] = [];
  for (const sum of sums) {
    const last = out[out.length - 1]?.split("*");
    if (last && Number(last[0]) === sum) out[out.length - 1] = `${sum}*${Number(last[1]) + 1}`;
    else out.push(`${sum}*1`);
  }
  return out.join(",");
};
console.log(`domino luck: ${runs(bones.sums)}`);
console.log(`2d6 luck: ${runs(pairs.sums)}`);
