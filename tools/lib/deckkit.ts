// Shared pieces for building deck files (src/deck-<id>.txt): text packing, art quantising, the file writer.
// See make-decks.ts for the format. Used by build-deck.ts (a deck from a folder of images) and make-decks.ts (everything).

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { wrapWords } from "../../src/util.ts";

export const W = 72;
export const H = 16;
export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+".slice(0, 31);
export const DELIM = "---\n";
const ROOT = join(import.meta.dirname, "..", "..");
export const SRC = join(ROOT, "src");
/** The data the tools work from: pictures and texts of the decks. */
export const ASSETS = join(ROOT, "assets");
/** Spare bytes in every item, so text can be lengthened a little by hand. */
const SLACK = 24;
/** The size of the blocks the app reads a header in (src/deck/store.ts). */
const HEADER_BLOCK = 1024;

export type Rgb = [number, number, number];

/** The rows a screen of these lines is shown in: at most two lines of 13 characters (a longer word does not fit at all). */
function rowsOf(lines: string[]): string[] {
  const rows = lines.flatMap((l) => wrapWords(l, 13));
  if (rows.length > 2 || rows.some((r) => r.length > 13)) {
    throw new Error(`"${lines.join(" / ")}" does not fit in two lines of 13 characters`);
  }
  return rows;
}

/**
 * A text screen as it is written in the item. The text is lines joined by " / "; a line may list variants with "|", the app
 * showing one of them by chance. Every variant has to fit the screen on its own. Text without variants is stored wrapped.
 */
export function screenText(text: string): string {
  const lines = text.split(" / ").map((l) => l.trim());
  if (!lines.some((l) => l.includes("|"))) return rowsOf(lines).join("\n");

  const first = lines.map((l) => l.split("|")[0].trim());
  lines.forEach((line, i) => {
    for (const variant of line.split("|")) rowsOf(first.map((f, j) => (j === i ? variant.trim() : f)));
  });
  return lines
    .map((l) =>
      l
        .split("|")
        .map((v) => v.trim())
        .join("|"),
    )
    .join("\n");
}

/** Size in the file: items are UTF-8 and RECORD counts bytes. */
const bytes = (text: string): number => Buffer.byteLength(text);

/** Pads every item to the same size with a comment of dashes. Returns the record size and the bytes. */
export function pack(items: string[]): { record: number; body: string } {
  const texts = items.map((item) => `${item.replace(/\n+$/, "")}\n`);
  const record = Math.floor((Math.max(...texts.map(bytes)) + SLACK + 7) / 8) * 8;
  return { record, body: texts.map((t) => `${t}# ${"-".repeat(record - bytes(t) - 3)}\n`).join("") };
}

/** Reads a 72x16 PNG as rows of [r, g, b, a] pixels. */
function load(path: string): number[][] {
  const png = PNG.sync.read(readFileSync(path));
  if (png.width !== W || png.height !== H) throw new Error(`${path}: ${png.width}x${png.height}, expected ${W}x${H}`);
  return Array.from({ length: W * H }, (_, i) => [...png.data.subarray(i * 4, i * 4 + 4)]);
}

const distance = (a: Rgb, b: Rgb): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Merges `colors` down to `limit` by median cut: split the box with the widest channel at its median until there are enough. */
function reduce(colors: Rgb[], limit: number): Rgb[] {
  const boxes: Rgb[][] = [colors];
  while (boxes.length < limit) {
    const range = (box: Rgb[], c: number) => Math.max(...box.map((p) => p[c])) - Math.min(...box.map((p) => p[c]));
    const widest = boxes
      .filter((b) => b.length > 1)
      .map((box) => ({ box, c: [0, 1, 2].reduce((best, c) => (range(box, c) > range(box, best) ? c : best), 0) }))
      .sort((a, b) => range(b.box, b.c) - range(a.box, a.c))[0];
    if (!widest) break;
    const sorted = [...widest.box].sort((a, b) => a[widest.c] - b[widest.c]);
    boxes.splice(boxes.indexOf(widest.box), 1, sorted.slice(0, sorted.length >> 1), sorted.slice(sorted.length >> 1));
  }
  return boxes.map((box) => [0, 1, 2].map((c) => Math.round(box.reduce((sum, p) => sum + p[c], 0) / box.length)) as Rgb);
}

/** The pictures as 16 lines of 72 characters ('.' transparent, else a palette letter), and the palette (at most 31 colours). */
export function artDeck(files: string[]): { palette: Rgb[]; pics: string[] } {
  const cards = files.map(load);
  const seen = new Map<string, Rgb>();
  for (const card of cards) {
    for (const p of card) if (p[3] > 127) seen.set(`${p[0]},${p[1]},${p[2]}`, [p[0], p[1], p[2]]);
  }
  const colors = [...seen.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const palette = colors.length > 31 ? reduce(colors, 31) : colors;
  const nearest = new Map<string, number>();
  for (const [key, color] of seen) {
    let best = 0;
    palette.forEach((c, i) => {
      if (distance(color, c) < distance(color, palette[best])) best = i;
    });
    nearest.set(key, best);
  }
  const pics = cards.map((card) => {
    const flat = card.map((p) => (p[3] > 127 ? ALPHABET[nearest.get(`${p[0]},${p[1]},${p[2]}`) ?? 0] : ".")).join("");
    return Array.from({ length: H }, (_, y) => flat.slice(y * W, (y + 1) * W)).join("\n");
  });
  return { palette, pics };
}

export const hex = (c: Rgb): string =>
  c
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

export type Back = { BACKPAL: string; rows: string[]; fill: string; edge: string };

/** Concentric diamonds: a ring (palette A) around a core (palette B). */
export function diamondBack(width: number, height: number, ring: string, core: string, fill: string, edge: string): Back {
  const rows = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const d = Math.abs(x - (width - 1) / 2) / ((width - 1) / 2) + Math.abs(y - (height - 1) / 2) / ((height - 1) / 2);
      return d >= 0.8 && d <= 1.0 ? "A" : d <= 0.4 ? "B" : ".";
    }).join(""),
  );
  return { BACKPAL: `${ring},${core}`, rows, fill, edge };
}

/** Writes src/deck-<id>.txt: the header (NAME, ORDER, then `fields`, the STEP lines, the card back), DELIM, `body`. */
export function writeDeck(
  id: string,
  title: string,
  order: number,
  fields: Record<string, string | number>,
  steps: string[],
  body = "",
  back?: Back,
): void {
  const head = Object.entries({ NAME: title, ORDER: order, ...fields }).map(([k, v]) => `${k}=${v}`);
  head.push(...steps.map((s) => `STEP=${s}`));
  if (back) head.push(`BACKPAL=${back.BACKPAL}`, `BACKFILL=${back.fill}`, `BACKEDGE=${back.edge}`, ...back.rows.map((r) => `BACK=${r}`));
  // The app reads the header in blocks of 1 KiB (a byte range each) and decodes every block on its own. A block that ends in the
  // middle of a two-byte letter is invalid UTF-8, and the bar's JavaScript engine dies on it ("fatal error 120"). So the header is
  // padded with a comment until it, delimiter included, ends exactly on a block boundary: the first block is the header and nothing
  // else, and records (whole letters, from their own start) are never cut.
  const prefix = `${head.join("\n")}\n`;
  const fixed = Buffer.byteLength(prefix) + DELIM.length;
  const dashes = Math.ceil((fixed + 3) / HEADER_BLOCK) * HEADER_BLOCK - fixed - 3;
  const out = `${prefix}# ${"-".repeat(dashes)}\n${DELIM}${body}`;
  writeFileSync(join(SRC, `deck-${id}.txt`), out);
  console.log(id, Buffer.byteLength(out), "bytes");
}

/** The table of decks in the README, between its markers, from what the decks say about themselves. */
export function syncReadme(decks: { name: string; order: number; description: string; results: number }[]): void {
  const path = join(ROOT, "README.md");
  const rows = [...decks].sort((a, b) => a.order - b.order).map((d) => `| ${d.name} | ${d.description} | ${d.results} |`);
  const table = ["| Deck | What you get | Results per reading |", "| --- | --- | --- |", ...rows].join("\n");
  const readme = readFileSync(path, "utf8");
  const next = readme.replace(/(<!-- decks:start -->\n)[\s\S]*?(\n<!-- decks:end -->)/, `$1${table}$2`);
  if (next !== readme) writeFileSync(path, next);
}

/** The settings screen lists whatever decks exist: rewrites its deck options from the headers of src/deck-*.txt. */
export function syncSettings(): void {
  const found = readdirSync(SRC)
    .filter((f) => /^deck-.+\.txt$/.test(f))
    .map((f) => {
      const head = readFileSync(join(SRC, f), "latin1").split("\n---\n", 1)[0];
      const fields = Object.fromEntries(
        head
          .split("\n")
          .filter((l) => l.includes("=") && !l.startsWith("#"))
          .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
      );
      return { order: Number(fields.ORDER) || 1000, value: f.slice(5, -4), label: fields.NAME };
    })
    .sort((a, b) => a.order - b.order || (a.value < b.value ? -1 : 1));
  const path = join(SRC, "appmeta", "settings.json");
  const settings = JSON.parse(readFileSync(path, "utf8"));
  settings.fields.deck.options = found.map(({ value, label }) => ({ value, label }));
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
}
