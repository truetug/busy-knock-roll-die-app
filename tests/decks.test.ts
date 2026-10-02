// Checks the deck files that ship in src/ (built by tools/make_deck.py).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SMALL_LINE, SOUND_FILES } from "../src/config.ts";
import { decodeRecord, parseDeck, parseFields, splitHeader } from "../src/deck/format.ts";
import { wrapWords } from "../src/util.ts";
import { SETTINGS_COLOR, SRC, shippedDeckFiles } from "./helpers.ts";

const decks = shippedDeckFiles();

describe("shipped decks", () => {
  it("includes the decks the app advertises", () => {
    expect(decks.map((d) => d.id)).toEqual(expect.arrayContaining(["classic", "neon", "ball", "d6", "d20"]));
  });

  describe.each(decks)("deck-$id.txt", ({ id, file, text }) => {
    const split = splitHeader(text);
    const deck = split ? parseDeck(split.head, split.dataStart, file, text.length, SETTINGS_COLOR) : null;

    it("has a header that parses and a size that matches it", () => {
      expect(split).not.toBeNull();
      expect(deck).not.toBeNull();
    });

    it("is named in its header", () => {
      expect(parseFields(split?.head ?? "").fields.NAME).toBeTruthy();
    });

    it("decodes every record, with text that fits the screen in two lines", () => {
      if (!deck) throw new Error("no deck");
      for (let item = 1; item <= deck.count && deck.recordSize > 0; item++) {
        const start = deck.dataStart + (item - 1) * deck.recordSize;
        const parts = decodeRecord(deck, text.slice(start, start + deck.recordSize));
        deck.steps.forEach((step, i) => {
          if (step.kind !== "text") return;
          const words = parts[i] ?? "";
          expect(words, `${id} item ${item}`).not.toBe("");
          expect(wrapWords(words, SMALL_LINE).length, `${id} item ${item}: "${words}"`).toBeLessThanOrEqual(2);
        });
      }
    });

    it("draws art only with palette colours", () => {
      const art = deck?.steps.find((st) => st.kind === "art");
      if (!deck || !art) return;
      const allowed = new Set(Object.keys(deck.palette));
      for (let item = 0; item < deck.count; item++) {
        const start = deck.dataStart + item * deck.recordSize + art.offset;
        const pixels = text.slice(start, start + art.size);
        expect(
          [...new Set(pixels)].filter((c) => !allowed.has(c)),
          `${id} item ${item + 1}`,
        ).toEqual([]);
      }
    });
  });
});

describe("sounds", () => {
  it("has one raw 16-bit PCM file per sound, and nothing else", () => {
    expect(readdirSync(join(SRC, "sounds")).sort()).toEqual(SOUND_FILES.map((name) => `${name}.snd`).sort());
    for (const name of SOUND_FILES) {
      const bytes = statSync(join(SRC, "sounds", `${name}.snd`)).size;
      expect(bytes % 2, `${name} is not whole samples`).toBe(0);
      expect(bytes, name).toBeGreaterThan(500);
      expect(bytes, name).toBeLessThan(200_000);
    }
  });
});

describe("settings screen", () => {
  it("lists exactly the shipped decks, in header order", () => {
    const schema = JSON.parse(readFileSync(join(SRC, "appmeta", "settings.json"), "utf8"));
    const expected = decks
      .map(({ id, text }) => {
        const { fields } = parseFields(splitHeader(text)?.head ?? "");
        return { value: id, label: fields.NAME, order: Number(fields.ORDER) || 1000 };
      })
      .sort((a, b) => a.order - b.order || (a.value < b.value ? -1 : 1))
      .map(({ value, label }) => ({ value, label }));
    expect(schema.fields.deck.options).toEqual(expected);
    expect(expected.some((o) => o.value === schema.fields.deck.default)).toBe(true);
  });
});
