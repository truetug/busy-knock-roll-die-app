import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type Deck, deckIdFromFile, parseDeck, splitHeader } from "../src/deck/format.ts";
import { resetReading, resetWheel, s } from "../src/state.ts";

export const SRC = join(import.meta.dirname, "..", "src");
/** A record read as bytes (one character per byte, as `shippedDeckFiles` gives it) decoded as the UTF-8 text it holds. */
export const utf8 = (bytes: string): string => Buffer.from(bytes, "latin1").toString("utf8");

export const SETTINGS_COLOR = "#7C3AEDFF";

/** The deck files shipped in src/, by id. */
export function shippedDeckFiles(): { id: string; file: string; text: string }[] {
  return readdirSync(SRC)
    .map((file) => ({ file, id: deckIdFromFile(file) }))
    .filter((d): d is { file: string; id: string } => d.id !== null)
    .map((d) => ({ ...d, text: readFileSync(join(SRC, d.file), "latin1") }));
}

export function parseShipped(id: string): Deck {
  const deck = shippedDeckFiles().find((d) => d.id === id);
  if (!deck) throw new Error(`no shipped deck ${id}`);
  const split = splitHeader(deck.text);
  if (!split) throw new Error(`${deck.file}: no header`);
  return parseDeck(utf8(split.head), split.dataStart, deck.file, deck.text.length, SETTINGS_COLOR);
}

/** Puts the app state back to a loaded start screen with the given deck. */
export function freshState(deck: Deck, spreadSetting: number | null = null): void {
  s.deck = deck;
  s.spreadSetting = spreadSetting;
  s.loaded = true;
  s.auto = false;
  s.random = false;
  s.upNext = "";
  s.autoAt = 0;

  s.errorText = "";
  s.phase = "intro";
  s.parts = [];
  s.partIndex = 0;
  s.partsFailed = false;
  s.back = "auto";
  s.soundOn = true;
  s.sound = null;
  s.clicks = [];
  s.clickedUntil = 0;
  s.commands = [];
  s.value = null;
  s.revealStep = 0;
  s.blink = 0;
  resetWheel();
  resetReading();
}
