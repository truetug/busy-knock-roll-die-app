// Card backs: the picture on the framed card of the wheel.

import { generateXpm2 } from "@busy-app/busy-lib";
import { CARD_BORDER, CARD_FILL, GOLD } from "../config.ts";
import type { CardBack, Deck } from "../deck/format.ts";

/** The user's choice in the settings: "auto" lets the deck decide. */
export const BACK_CHOICES = ["auto", "diamond", "lattice", "sparkle", "plain"] as const;
export type BackChoice = (typeof BACK_CHOICES)[number];

function pattern(color: string, grid: string[]): string {
  return generateXpm2({ palette: { "#": color, ".": "none" }, grid });
}

function checkerboard(width: number, height: number): string[] {
  return Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => ((x + y) % 2 === 0 ? "#" : ".")).join(""));
}

const DIAMOND = pattern(GOLD, ["..#..", ".###.", "#####", ".###.", "..#.."]);
const LATTICE = pattern("#7C3AEDFF", checkerboard(13, 9));
const SPARKLE = pattern(GOLD, ["...#...", "...#...", ".#.#.#.", "#######", ".#.#.#.", "...#...", "...#..."]);

const BUILT_IN: Record<Exclude<BackChoice, "auto">, string | null> = {
  diamond: DIAMOND,
  lattice: LATTICE,
  sparkle: SPARKLE,
  plain: null,
};

/** The back to draw: the user's pick if they made one, otherwise the deck's own, otherwise the diamond. */
export function backFor(deck: Deck, choice: BackChoice): CardBack {
  if (choice === "auto") return deck.back ?? { xpm: DIAMOND, fill: CARD_FILL, edge: CARD_BORDER };
  return { xpm: BUILT_IN[choice], fill: CARD_FILL, edge: CARD_BORDER };
}
