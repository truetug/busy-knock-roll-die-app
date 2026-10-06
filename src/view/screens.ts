// What each phase looks like. Reads the state, returns the elements to show.

import {
  BLACK,
  CARD_BORDER,
  CARD_FILL,
  CENTER_H,
  CENTER_W,
  DOTS_SPACING,
  DOTS_Y,
  ERROR_RED,
  GAME_SPREAD_MIN,
  GOLD,
  REVEAL_STEPS,
  SCREEN_H,
  SCREEN_W,
  SMALL_LINE,
  TINY_LINE,
  WHEEL_Y,
  WHITE,
} from "../config.ts";
import type { Step } from "../deck/format.ts";
import { PULL_LIMIT, pull } from "../random/draw.ts";
import { s } from "../state.ts";
import { colorDistance, lerp, mixColor, wrapWords } from "../util.ts";
import { backFor } from "./backs.ts";
import { background, bitmap, type Elem, rect, text } from "./elements.ts";

const MID_X = SCREEN_W / 2;

/** The frame for the current phase. Nothing until the deck is loaded. */
export function frame(): Elem[] {
  if (!s.loaded) return [];

  switch (s.phase) {
    case "error":
      return errorScreen();
    case "intro":
      return introScreen();
    case "reveal":
      return revealScreen();
    default:
      return [...wheelScreen(), ...progressDots()];
  }
}

// ── Intro and error ─────────────────────────────────────────────────────────

function introScreen(): Elem[] {
  if (s.auto) {
    // Between games: when each game has a deck of its own, the one that comes next is named.
    const first = s.random && s.upNext !== "" ? s.upNext.slice(0, SMALL_LINE) : "NEXT GAME";
    return [text("intro-1", MID_X, 4, first, "small", WHITE), text("intro-2", MID_X, 12, `IN ${s.countdown}`, "small", GOLD)];
  }
  return [text("intro-1", MID_X, 4, s.deck.intro1, "small", WHITE), text("intro-2", MID_X, 12, s.deck.intro2, "small", GOLD)];
}

/** The deck file's problem in small type: the file's name, then what is wrong with it. */
function errorScreen(): Elem[] {
  const sep = s.errorText.indexOf(": ");
  const file = sep > 0 ? s.errorText.slice(0, sep) : "DECK ERROR";
  const detail = sep > 0 ? s.errorText.slice(sep + 2) : s.errorText;
  const lines = [file, ...wrapWords(detail, TINY_LINE).slice(0, 2)];

  return lines.map((line, i) => text(`err-${i}`, 1, 1 + i * 5, line, "tiny", i === 0 ? ERROR_RED : WHITE, "top_left"));
}

// ── The wheel ───────────────────────────────────────────────────────────────

/**
 * The frame the wheel spins under. The cards themselves are an animation the bar plays (see display.ts),
 * drawn below this; the framed card in the middle is the pick-to-be.
 */
function wheelScreen(): Elem[] {
  const back = backFor(s.deck, s.back);
  const blinkOn = s.phase === "ready" && Math.floor(s.blink / 2) % 2 === 0;
  // Spinning, the middle card is just one of the cards; it is lit as the wheel comes to rest (and while waiting for Start).
  const resting = s.wheel.clip.startsWith("stop-");
  const border =
    s.phase === "spin" ? (resting ? GOLD : s.braking ? WHITE : mixColor(back.edge, glow(back.edge), nudged())) : blinkOn ? WHITE : GOLD;

  const elements = [rect("frame", MID_X, WHEEL_Y, CENTER_W, CENTER_H, back.fill, { radius: 2, border, z: 2 })];
  if (back.xpm) elements.push(bitmap("back", MID_X, WHEEL_Y, back.xpm, "center", 3));
  return elements;
}

/** What the frame warms to: gold, or white where the card's own edge is gold already. */
function glow(edge: string): string {
  return colorDistance(edge, GOLD) < 150 ? WHITE : GOLD;
}

/** How far the dial has nudged the draw so far, 0 to 1: the frame warms to gold as it does. */
function nudged(): number {
  return s.turns === 0 ? 0 : (1 - pull(s.turns)) / (1 - PULL_LIMIT);
}

/** Pips along the bottom: one per result in this reading, filled once drawn. */
function progressDots(): Elem[] {
  if (s.spreadTarget <= 1 || s.spreadTarget >= GAME_SPREAD_MIN) return [];

  const left = MID_X - ((s.spreadTarget - 1) * DOTS_SPACING) / 2;
  return Array.from({ length: s.spreadTarget }, (_, i) =>
    rect(`dot-${i}`, Math.round(left + i * DOTS_SPACING), DOTS_Y, 4, 2, i < s.drawn ? GOLD : CARD_BORDER, { align: "top_mid", z: 5 }),
  );
}

// ── The result ──────────────────────────────────────────────────────────────

/** A text screen as shown: the lines as written, any longer than the screen wrapped, at most two (the rest is cut). */
export function textLines(text: string): string[] {
  return text
    .split("\n")
    .flatMap((line) => wrapWords(line, SMALL_LINE))
    .slice(0, 2);
}

/** Pip offsets from a die face's centre, per face value. */
// biome-ignore format: one face per line reads as the die
const PIPS: number[][][] = [
  [],
  [[0, 0]],
  [[-4, -4], [4, 4]],
  [[-4, -4], [0, 0], [4, 4]],
  [[-4, -4], [4, -4], [-4, 4], [4, 4]],
  [[-4, -4], [4, -4], [0, 0], [-4, 4], [4, 4]],
  [[-4, -4], [4, -4], [-4, 0], [4, 0], [-4, 4], [4, 4]],
];

/** The picked card growing out of its slot, then the item's steps one by one. */
function revealScreen(): Elem[] {
  if (s.value === null) return [];

  const grown = Math.min(1, s.revealStep / REVEAL_STEPS);
  if (grown < 1) {
    const card = rect("reveal-card", MID_X, WHEEL_Y, lerp(CENTER_W, SCREEN_W, grown), lerp(CENTER_H, SCREEN_H, grown), s.deck.steps[0].bg, {
      radius: lerp(2, 0, grown),
      border: GOLD,
    });
    return [card];
  }

  return stepScreen(s.deck.steps[s.partIndex], s.parts[s.partIndex] ?? null, s.value);
}

function numberScreen(value: number, bg: string): Elem[] {
  return [background("reveal-card", bg), text("reveal-num", MID_X, 8, String(value), "extra_large", WHITE, "center", 1)];
}

/** One step of an item's result. */
function stepScreen(step: Step, part: string | null, value: number): Elem[] {
  // Not loaded yet: just the background. Failed to load: the number, so the draw is not wasted.
  if (part === null && (step.kind === "text" || step.kind === "art")) {
    return s.partsFailed ? numberScreen(value, CARD_FILL) : [background("reveal-card", step.bg)];
  }

  switch (step.kind) {
    case "art":
      return [background("art-bg", step.bg), bitmap("art", 0, 0, part ?? "", "top_left", 1)];

    case "text": {
      const lines = textLines(part ?? "");
      const rows = lines.map((line, i) => text(`ans-${i}`, MID_X, lines.length === 1 ? 8 : 4 + i * 8, line, "small", WHITE, "center", 1));
      return [background("reveal-card", step.bg), ...rows];
    }

    case "die": {
      const face = rect("die", MID_X, 8, 14, 14, WHITE, { radius: 3, z: 1 });
      const pips = (PIPS[value] ?? []).map(([dx, dy], i) => rect(`pip-${i}`, MID_X + dx, 8 + dy, 2, 2, BLACK, { z: 2 }));
      return [background("reveal-card", step.bg), face, ...pips];
    }

    case "number": {
      const elements = numberScreen(value, step.bg);
      if (s.deck.label !== null) elements.push(text("die-label", 2, 1, s.deck.label, "tiny", GOLD, "top_left", 2));
      return elements;
    }
  }
}
