// The deck file format and its parser. Pure: no I/O.
//
// A deck is one text file, resources/deck-<id>.txt (built by tools/make_deck.py):
//   a header of KEY=value lines, ended by a line "---", then fixed-size records.
// An item's record holds the bytes of its steps one after another; each step is
// one screen of the result and Start moves on to the next. Only the header and
// the opened item's record are ever read.

import { generateXpm2 } from "@busy-app/busy-lib";
import { BACK_MAX_H, BACK_MAX_W, CARD_BORDER, CARD_FILL, SCREEN_H, SCREEN_W } from "../config.ts";

export const DECK_PREFIX = "deck-";
export const DECK_SUFFIX = ".txt";
/** Ends the header. Matched against "\n" + text, so a header may be empty of lines. */
const DELIM = "\n---\n";
const DEFAULT_SPREAD = 3;
const PALETTE_MAX = 31;
const PALETTE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+";
const ART_BYTES = SCREEN_W * SCREEN_H;

export type StepKind = "art" | "text" | "die" | "number";

export type Step = {
  kind: StepKind;
  /** Bytes in the record (0: drawn from the item number alone). */
  size: number;
  /** Where in the record those bytes start. */
  offset: number;
  /** Background colour, "#RRGGBBFF". */
  bg: string;
};

/** What a deck says its card backs look like. */
export type CardBack = {
  /** XPM2 drawn on the framed card; null for a plain back. */
  xpm: string | null;
  fill: string;
  edge: string;
};

export type Deck = {
  count: number;
  /** A result may repeat (dice, ball); otherwise drawn items leave the pool. */
  repeat: boolean;
  /** Results per reading when the user's setting says Auto. */
  spread: number;
  steps: Step[];
  /** Bytes per record: the sum of the steps' sizes. */
  recordSize: number;
  /** Where the first record starts: right after the header. */
  dataStart: number;
  intro1: string;
  intro2: string;
  /** Small tag drawn on number results, e.g. "D20". */
  label: string | null;
  /** XPM2 palette for art steps. */
  palette: Record<string, string>;
  /** The deck's own card back; null: the app's default (or the user's choice). */
  back: CardBack | null;
  file: string | null;
};

/** What the app holds before any deck is loaded. */
export const EMPTY_DECK: Deck = {
  count: 1,
  repeat: true,
  spread: 1,
  steps: [],
  recordSize: 0,
  dataStart: 0,
  intro1: "",
  intro2: "",
  label: null,
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

/** The header's key=value lines; STEP and BACK may repeat. */
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
    if (eq <= 0) continue;
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
  const steps: Step[] = [];
  let recordSize = 0;
  for (const spec of stepSpecs) {
    const [kind, bytes, bg] = spec.split(":");
    if (kind !== "art" && kind !== "text" && kind !== "die" && kind !== "number") fail(`bad STEP ${spec}`);
    if (kind === "art" && hexes.length === 0) fail("art STEP needs PAL");
    if (kind === "text" && !(Number(bytes) >= 1)) fail("text STEP needs a size");

    const stepSize = kind === "art" ? ART_BYTES : kind === "text" ? Number(bytes) : 0;
    steps.push({ kind: kind as StepKind, size: stepSize, offset: recordSize, bg: bg === undefined ? defaultBg : color(bg) });
    recordSize += stepSize;
  }

  const expected = dataStart + count * recordSize;
  if (recordSize > 0 && size !== expected) fail(`size ${size}, expected ${expected}`);

  const spread = Number(fields.SPREAD);
  return {
    count,
    repeat: fields.REPEAT === "1",
    spread: spread >= 1 ? spread : DEFAULT_SPREAD,
    steps,
    recordSize,
    dataStart,
    intro1: fields.INTRO1 ?? "",
    intro2: fields.INTRO2 ?? "PRESS START",
    label: fields.LABEL ?? null,
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

/** Cuts an item's record into its steps. */
export function decodeRecord(deck: Deck, record: string): Part[] {
  return deck.steps.map((step) => {
    const bytes = record.slice(step.offset, step.offset + step.size);
    if (step.kind === "text") return bytes.trim();
    if (step.kind !== "art") return null;

    const grid: string[] = [];
    for (let y = 0; y < SCREEN_H; y++) grid.push(bytes.slice(y * SCREEN_W, (y + 1) * SCREEN_W));
    return generateXpm2({ palette: deck.palette, grid });
  });
}
