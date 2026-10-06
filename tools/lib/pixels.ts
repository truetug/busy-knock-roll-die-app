// A 72x16 canvas for drawing the pictures of generated decks (roulette, playing cards, runes...): rectangles, lines, little
// bitmaps and a 3x5 font, saved as the PNG the deck builder reads. No antialiasing: every pixel is one colour or transparent.

import { writeFileSync } from "node:fs";
import { PNG } from "pngjs";

export type Rgb = [number, number, number];

const rgb = (hex: string): Rgb => [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as Rgb;

export class Canvas {
  readonly png = new PNG({ width: 72, height: 16 });

  /** A canvas filled with `background` (a hex colour), or transparent when none is given. */
  constructor(background?: string) {
    if (background) this.rect(0, 0, 72, 16, background);
  }

  set(x: number, y: number, color: string): void {
    if (x < 0 || y < 0 || x >= 72 || y >= 16) return;
    this.png.data.set([...rgb(color), 255], (y * 72 + x) * 4);
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) this.set(x + dx, y + dy, color);
  }

  /** A one pixel line (Bresenham). */
  line(x0: number, y0: number, x1: number, y1: number, color: string): void {
    let [x, y] = [Math.round(x0), Math.round(y0)];
    const [xe, ye] = [Math.round(x1), Math.round(y1)];
    const [dx, dy] = [Math.abs(xe - x), -Math.abs(ye - y)];
    const [sx, sy] = [x < xe ? 1 : -1, y < ye ? 1 : -1];
    let err = dx + dy;
    for (;;) {
      this.set(x, y, color);
      if (x === xe && y === ye) return;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /** A bitmap given as rows of characters: `X` is drawn, anything else is left. Each pixel becomes `scale` x `scale`. */
  bitmap(rows: readonly string[], x: number, y: number, color: string, scale = 1): void {
    rows.forEach((row, ry) => {
      [...row].forEach((c, rx) => {
        if (c === "X") this.rect(x + rx * scale, y + ry * scale, scale, scale, color);
      });
    });
  }

  /** Text in the 3x5 font (digits and the letters A B G I J K N O Q), `scale` times bigger; returns the width drawn. */
  text(text: string, x: number, y: number, color: string, scale = 1): number {
    let cursor = x;
    for (const char of text) {
      this.bitmap(FONT[char] ?? FONT[" "], cursor, y, color, scale);
      cursor += 4 * scale;
    }
    return cursor - x - scale;
  }

  save(path: string): void {
    writeFileSync(path, PNG.sync.write(this.png));
  }
}

/** The width of `text` in the 3x5 font at `scale`. */
export const textWidth = (text: string, scale = 1): number => Math.max(0, [...text].length * 4 * scale - scale);

const FONT: Record<string, string[]> = {
  " ": ["...", "...", "...", "...", "..."],
  "0": ["XXX", "X.X", "X.X", "X.X", "XXX"],
  "1": [".X.", "XX.", ".X.", ".X.", "XXX"],
  "2": ["XXX", "..X", "XXX", "X..", "XXX"],
  "3": ["XXX", "..X", "XXX", "..X", "XXX"],
  "4": ["X.X", "X.X", "XXX", "..X", "..X"],
  "5": ["XXX", "X..", "XXX", "..X", "XXX"],
  "6": ["XXX", "X..", "XXX", "X.X", "XXX"],
  "7": ["XXX", "..X", "..X", "..X", "..X"],
  "8": ["XXX", "X.X", "XXX", "X.X", "XXX"],
  "9": ["XXX", "X.X", "XXX", "..X", "XXX"],
  A: [".X.", "X.X", "XXX", "X.X", "X.X"],
  B: ["XX.", "X.X", "XX.", "X.X", "XX."],
  G: ["XXX", "X..", "X.X", "X.X", "XXX"],
  I: ["XXX", ".X.", ".X.", ".X.", "XXX"],
  J: ["..X", "..X", "..X", "X.X", "XXX"],
  K: ["X.X", "X.X", "XX.", "X.X", "X.X"],
  N: ["XX.", "X.X", "X.X", "X.X", "X.X"],
  O: ["XXX", "X.X", "X.X", "X.X", "XXX"],
  Q: ["XXX", "X.X", "X.X", "XXX", "..X"],
};

/** Pips of a die face on a 3x3 grid, as [column, row] with 0, 1, 2. */
export const PIPS: number[][][] = [
  [],
  [[1, 1]],
  [[0, 0], [2, 2]],
  [[0, 0], [1, 1], [2, 2]],
  [[0, 0], [2, 0], [0, 2], [2, 2]],
  [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
]; // biome-ignore format: one face per row
