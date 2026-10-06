// The deck file format and its parser. Pure: no I/O.
//
// A deck is one text file, resources/deck-<id>.txt (built by tools/make-decks.ts):
//   a header of KEY=value lines, ended by a line "---", then the items.
// An item is plain text: its screens one after another, a blank line between them
// (Start moves on to the next screen), lines starting with "#" are comments. Every
// item takes the same number of bytes (RECORD; the file is UTF-8, so text may use any letters) - the last line of an item is a
// comment of dashes that fills it up - so an item is found by its number alone and
// only the header and the opened item are ever read.

import { generateXpm2 } from "@busy-app/busy-lib";
import { BACK_MAX_H, BACK_MAX_W, CARD_BORDER, CARD_FILL, SCREEN_H, SCREEN_W } from "../config.ts";
import { parseLuck } from "../random/luck.ts";

const DECK_PREFIX = "deck-";
const DECK_SUFFIX = ".txt";
/** Ends the header. Matched against "\n" + text, so a header may be empty of lines. */
const DELIM = "\n---\n";
const DEFAULT_SPREAD = 3;
const PALETTE_MAX = 31;
const PALETTE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+";
/** A screen is separated from the next by a blank line. */
const SCREEN_BREAK = /\n[ \t]*\n/;

type StepKind = "art" | "text" | "die" | "number";

/** One screen of an item's result. */
export type Step = {
  kind: StepKind;
  /** Background colour, "#RRGGBBFF". */
  bg: string;
};

/** Art and text screens are written in the item; die faces and numbers are drawn from the item's number alone. */
const hasScreenText = (step: Step): boolean => step.kind === "art" || step.kind === "text";

/** What a deck says its card backs look like. */
export type CardBack = {
  /** XPM2 drawn on the framed card; null for a plain back. */
  xpm: string | null;
  fill: string;
  edge: string;
};

export type Deck = {
  /** The deck's NAME (the title in the settings), or its id. */
  name: string;
  count: number;
  /** A result may repeat (dice, ball); otherwise drawn items leave the pool. */
  repeat: boolean;
  /** Results per reading when the user's setting says Auto. */
  spread: number;
  steps: Step[];
  /** Bytes per item (RECORD); 0 when no step has a screen written in the item. */
  recordSize: number;
  /** Where the first record starts: right after the header. */
  dataStart: number;
  intro1: string;
  intro2: string;
  /** Small tag drawn on number results, e.g. "D20". */
  label: string | null;
  /** How good each item is, for the dial's nudge (LUCK); null: the dial changes nothing. */
  luck: number[] | null;
  /** XPM2 palette for art steps. */
  palette: Record<string, string>;
  /** The deck's own card back; null: the app's default (or the user's choice). */
  back: CardBack | null;
  file: string | null;
};

/** What the app holds before any deck is loaded. */
export const EMPTY_DECK: Deck = {
  name: "",
  count: 1,
  repeat: true,
  spread: 1,
  steps: [],
  recordSize: 0,
  dataStart: 0,
  intro1: "",
  intro2: "",
  label: null,
  luck: null,
  palette: {},
  back: null,
  file: null,
};

/** One step of a loaded item: XPM2 for art, the text for text, null when the step needs no bytes. */
export type Part = string | null;

export function deckFileName(id: string): string {
  return `${DECK_PREFIX}${id}${DECK_SUFFIX}`;
}

/** "deck-tarot.txt" → "tarot"; null for other files. */
export function deckIdFromFile(name: string): string | null {
  if (!name.startsWith(DECK_PREFIX) || !name.endsWith(DECK_SUFFIX)) return null;
  return name.slice(DECK_PREFIX.length, name.length - DECK_SUFFIX.length);
}

/** Splits the header off the start of a file; null while the delimiter is not in `text` yet. */
export function splitHeader(text: string): { head: string; dataStart: number } | null {
  const end = `\n${text}`.indexOf(DELIM);
  return end < 0 ? null : { head: text.slice(0, Math.max(0, end - 1)), dataStart: end + DELIM.length - 1 };
}

/** The header's key=value lines (lines starting with "#" are comments); STEP and BACK may repeat. */
export function parseFields(head: string): {
  fields: Record<string, string>;
  stepSpecs: string[];
  backRows: string[];
} {
  const fields: Record<string, string> = {};
  const stepSpecs: string[] = [];
  const backRows: string[] = [];
  for (const line of head.split("\n")) {
    const eq = line.indexOf("=");
    if (eq <= 0 || line.startsWith("#")) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key === "STEP") stepSpecs.push(value);
    else if (key === "BACK") backRows.push(value);
    else fields[key] = value;
  }
  return { fields, stepSpecs, backRows };
}

/**
 * Turns a header into a Deck, or throws "<file>: <what is wrong>".
 * `settingsColor` stands in wherever the file says "settings" for a colour.
 */
export function parseDeck(head: string, dataStart: number, file: string, size: number, settingsColor: string): Deck {
  const fail = (why: string): never => {
    throw new Error(`${file}: ${why}`);
  };
  const color = (value: string): string => {
    if (value === "settings") return settingsColor;
    return /^[0-9a-fA-F]{6}$/.test(value) ? `#${value}FF` : fail(`bad color ${value}`);
  };

  const { fields, stepSpecs, backRows } = parseFields(head);

  const count = Number(fields.COUNT);
  if (!Number.isInteger(count) || count < 1) fail(`bad COUNT ${fields.COUNT ?? "(missing)"}`);
  if (stepSpecs.length === 0) fail("no STEP lines");

  const hexes = fields.PAL ? fields.PAL.split(",") : [];
  if (hexes.length > PALETTE_MAX) fail(`PAL has ${hexes.length} colors, max ${PALETTE_MAX}`);
  const palette: Record<string, string> = { ".": "none" };
  hexes.forEach((hex, i) => {
    palette[PALETTE_CHARS[i]] = color(hex);
  });

  const back = parseBack(fields, backRows, color, fail);

  const defaultBg = color(fields.BG ?? "2E1065");
  const steps: Step[] = stepSpecs.map((spec) => {
    const [kind, bg] = spec.split(":");
    if (kind !== "art" && kind !== "text" && kind !== "die" && kind !== "number") fail(`bad STEP ${spec}`);
    if (kind === "art" && hexes.length === 0) fail("art STEP needs PAL");
    return { kind: kind as StepKind, bg: bg === undefined ? defaultBg : color(bg) };
  });

  const written = steps.filter(hasScreenText).length;
  const recordSize = written > 0 ? Number(fields.RECORD) : 0;
  if (written > 0 && !(Number.isInteger(recordSize) && recordSize >= 1)) fail(`bad RECORD ${fields.RECORD ?? "(missing)"}`);

  const expected = dataStart + count * recordSize;
  if (recordSize > 0 && size !== expected) fail(`size ${size}, expected ${expected}`);

  let luck: number[] | null = null;
  if (fields.LUCK !== undefined) {
    try {
      luck = parseLuck(fields.LUCK, count);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  }

  const spread = Number(fields.SPREAD);
  return {
    name: fields.NAME || "",
    count,
    repeat: fields.REPEAT === "1",
    spread: spread >= 1 ? spread : DEFAULT_SPREAD,
    steps,
    recordSize,
    dataStart,
    intro1: fields.INTRO1 ?? "",
    intro2: fields.INTRO2 ?? "PRESS START",
    label: fields.LABEL ?? null,
    luck,
    palette,
    back,
    file,
  };
}

/**
 * BACK=<row> lines (one per pixel row, drawn with the BACKPAL colours) plus optional
 * BACKFILL / BACKEDGE card colours. Any of them may be given alone.
 */
function parseBack(
  fields: Record<string, string>,
  rows: string[],
  color: (value: string) => string,
  fail: (why: string) => never,
): CardBack | null {
  if (rows.length === 0 && !fields.BACKFILL && !fields.BACKEDGE) return null;

  let xpm: string | null = null;
  if (rows.length > 0) {
    const hexes = fields.BACKPAL ? fields.BACKPAL.split(",") : [];
    if (hexes.length === 0) fail("BACK needs BACKPAL");
    if (hexes.length > PALETTE_MAX) fail(`BACKPAL has ${hexes.length} colors, max ${PALETTE_MAX}`);
    const palette: Record<string, string> = { ".": "none" };
    hexes.forEach((hex, i) => {
      palette[PALETTE_CHARS[i]] = color(hex);
    });

    if (rows.length > BACK_MAX_H || rows.some((row) => row.length !== rows[0].length))
      fail(`BACK must be a rectangle up to ${BACK_MAX_W}x${BACK_MAX_H}`);
    if (rows[0].length > BACK_MAX_W) fail(`BACK must be a rectangle up to ${BACK_MAX_W}x${BACK_MAX_H}`);
    const stray = [...rows.join("")].find((c) => !(c in palette));
    if (stray !== undefined) fail(`BACK uses "${stray}", not in BACKPAL`);
    xpm = generateXpm2({ palette, grid: rows });
  }

  return {
    xpm,
    fill: fields.BACKFILL ? color(fields.BACKFILL) : CARD_FILL,
    edge: fields.BACKEDGE ? color(fields.BACKEDGE) : CARD_BORDER,
  };
}

/** The text of an item's screens: comments dropped, split at blank lines, each trimmed. */
export function splitScreens(record: string): string[] {
  const body = record
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .join("\n");
  return body
    .split(SCREEN_BREAK)
    .map((screen) =>
      screen
        .split("\n")
        .map((line) => line.trim())
        .join("\n")
        .trim(),
    )
    .filter((screen) => screen !== "");
}

/**
 * Picks one of the variants a line may offer: "TWO|DUCK" shows either one, by chance. `random` gives a number in [0, 1).
 * Each line chooses on its own, so a line without a "|" always stays as written.
 */
export function chooseVariants(text: string, random: () => number = Math.random): string {
  return text
    .split("\n")
    .map((line) => {
      if (!line.includes("|")) return line;
      const options = line.split("|").map((option) => option.trim());
      return options[Math.floor(random() * options.length)];
    })
    .join("\n");
}

/**
 * Turns an item's text into what its steps show, or throws "<file>: item <n>: <what is wrong>".
 * Art becomes XPM2; text is the lines as written, with one variant chosen for every line that offers some; steps without a
 * screen get null.
 */
export function decodeRecord(deck: Deck, record: string, item: number, random: () => number = Math.random): Part[] {
  const fail = (why: string): never => {
    throw new Error(`${deck.file}: item ${item}: ${why}`);
  };

  const screens = splitScreens(record);
  const wanted = deck.steps.filter(hasScreenText).length;
  if (screens.length !== wanted) fail(`${screens.length} screens, the header's STEPs need ${wanted}`);

  let next = 0;
  return deck.steps.map((step) => {
    if (!hasScreenText(step)) return null;
    const screen = screens[next++];
    if (step.kind === "text") return chooseVariants(screen, random);

    const grid = screen.split("\n");
    if (grid.length !== SCREEN_H || grid.some((row) => row.length !== SCREEN_W))
      fail(`art must be ${SCREEN_H} lines of ${SCREEN_W} characters`);
    const stray = [...grid.join("")].find((c) => !(c in deck.palette));
    if (stray !== undefined) fail(`art uses "${stray}", not in PAL`);
    return generateXpm2({ palette: deck.palette, grid });
  });
}
