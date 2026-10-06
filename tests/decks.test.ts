// Checks the deck files that ship in src/ (built by tools/make-decks.ts).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SOUND_FILES } from "../src/config.ts";
import { decodeRecord, parseDeck, parseFields, splitHeader } from "../src/deck/format.ts";
import { textLines } from "../src/view/screens.ts";
import { SETTINGS_COLOR, SRC, shippedDeckFiles, utf8 } from "./helpers.ts";

const decks = shippedDeckFiles();

describe("shipped decks", () => {
  it("includes the decks the app advertises", () => {
    expect(decks.map((d) => d.id)).toEqual(expect.arrayContaining(["classic", "neon", "ball", "d6", "d20"]));
  });

  describe.each(decks)("deck-$id.txt", ({ id, file, text }) => {
    const split = splitHeader(text);
    const deck = split ? parseDeck(utf8(split.head), split.dataStart, file, text.length, SETTINGS_COLOR) : null;

    it("has a header that parses and a size that matches it", () => {
      expect(split).not.toBeNull();
      expect(deck).not.toBeNull();
    });

    it("ends its header on a 1 KiB boundary, so that no block read of it cuts a letter in two", () => {
      expect((split?.dataStart ?? 0) % 1024).toBe(0);
    });

    it("is named in its header", () => {
      expect(parseFields(utf8(split?.head ?? "")).fields.NAME).toBeTruthy();
    });

    it("decodes every item, with text that fits the screen in two lines", () => {
      if (!deck) throw new Error("no deck");
      for (let item = 1; item <= deck.count && deck.recordSize > 0; item++) {
        const start = deck.dataStart + (item - 1) * deck.recordSize;
        // Every variant a line offers is tried: the first of each, then the last.
        for (const random of [() => 0, () => 0.999]) {
          const parts = decodeRecord(deck, utf8(text.slice(start, start + deck.recordSize)), item, random);
          deck.steps.forEach((step, i) => {
            if (step.kind !== "text") return;
            const words = parts[i] ?? "";
            expect(words, `${id} item ${item}`).not.toBe("");
            // Shown in at most two lines, with nothing cut off.
            const shown = textLines(words);
            expect(shown.join(" "), `${id} item ${item}`).toBe(words.split("\n").join(" "));
            expect(
              shown.every((row) => row.length <= 13),
              `${id} item ${item}: "${words}"`,
            ).toBe(true);
          });
        }
      }
    });

    it("keeps every item the same size, ended by a comment of dashes", () => {
      if (!deck || deck.recordSize === 0) return;
      for (let item = 1; item <= deck.count; item++) {
        const start = deck.dataStart + (item - 1) * deck.recordSize;
        const record = text.slice(start, start + deck.recordSize);
        const lastLine = record.slice(0, -1).split("\n").pop() ?? "";
        expect(record.endsWith("\n"), `${id} item ${item}`).toBe(true);
        expect(lastLine, `${id} item ${item} does not end with its divider: an item before it is too long or too short`).toMatch(/^# -+$/);
      }
    });
  });
});

/** The text screen of every item of a shipped deck, first variant of each line. */
function screensOf(id: string, kind: "text" | "art"): string[] {
  const { text } = decks.find((d) => d.id === id) ?? { text: "" };
  const split = splitHeader(text);
  if (!split) throw new Error(`${id}: no header`);
  const deck = parseDeck(utf8(split.head), split.dataStart, `deck-${id}.txt`, text.length, SETTINGS_COLOR);
  const at = deck.steps.findIndex((step) => step.kind === kind);
  return Array.from({ length: deck.count }, (_, i) => {
    const start = deck.dataStart + i * deck.recordSize;
    return decodeRecord(deck, utf8(text.slice(start, start + deck.recordSize)), i + 1, () => 0)[at] ?? "";
  });
}
const textsOf = (id: string): string[] => screensOf(id, "text");
const picturesOf = (id: string): string[] => screensOf(id, "art");
const headerOf = (id: string): string => splitHeader(decks.find((d) => d.id === id)?.text ?? "")?.head ?? "";

describe("the roulette", () => {
  const spins = textsOf("roul");

  it("has the 37 pockets of a European wheel: the zero, 18 reds and 18 blacks", () => {
    expect(spins).toHaveLength(37);
    expect(spins[0]).toBe("ZERO\nGREEN");
    expect(spins.filter((t) => t.startsWith("RED"))).toHaveLength(18);
    expect(spins.filter((t) => t.startsWith("BLACK"))).toHaveLength(18);
  });

  it("colours the pockets as the table does, and tells parity and half", () => {
    expect(spins[1]).toBe("RED\nODD, 1-18"); // 1 is red
    expect(spins[2]).toBe("BLACK\nEVEN, 1-18"); // 2 is black
    expect(spins[17]).toBe("BLACK\nODD, 1-18"); // 17 is black
    expect(spins[36]).toBe("RED\nEVEN, 19-36"); // 36 is red
  });

  it("lets a result repeat, like every spin of a real wheel", () => {
    const split = splitHeader(decks.find((d) => d.id === "roul")?.text ?? "");
    expect(split?.head).toContain("REPEAT=1");
  });
});

describe("the decks drawn by code", () => {
  it("has every playing card once, a rank and a suit, ace high", () => {
    const cards = textsOf("cards");
    expect(cards).toHaveLength(52);
    expect(new Set(cards).size).toBe(52);
    expect(cards[0]).toBe("TWO\nOF SPADES");
    expect(cards[51]).toBe("ACE\nOF CLUBS");
    expect(headerOf("cards")).toContain("LUCK=0*4,1*4,2*4,3*4,4*4,5*4,6*4,7*4,8*4,9*4,10*4,11*4,12*4");
    expect(new Set(picturesOf("cards")).size).toBe(52);
  });

  it("draws every hexagram differently, 64 of them", () => {
    expect(new Set(picturesOf("iching")).size).toBe(64);
    expect(new Set(textsOf("iching")).size).toBe(64);
  });

  it("has 24 runes, 28 dominoes and 36 throws of two dice, each pictured differently", () => {
    for (const [id, count] of [
      ["runes", 24],
      ["domino", 28],
      ["2d6", 36],
    ] as const) {
      expect(new Set(picturesOf(id)).size, id).toBe(count);
    }
  });

  it("makes two dice add up the way they do: one way to throw 2, six to throw 7", () => {
    const sums = textsOf("2d6").map((t) => Number(t.split("\n")[1]));
    for (const [sum, ways] of [
      [2, 1],
      [7, 6],
      [12, 1],
    ])
      expect(sums.filter((x) => x === sum)).toHaveLength(ways);
    expect(headerOf("2d6")).toContain("LUCK=2*1,3*2,4*3,5*4,6*5,7*6,8*5,9*4,10*3,11*2,12*1");
  });

  it("calls the positions of a physical tarot deck", () => {
    const calls = textsOf("tcount");
    expect(calls).toHaveLength(78);
    expect(calls[0]).toBe("TOP\nCARD");
    expect(calls[1]).toBe("COUNT 2\nFROM THE TOP");
    expect(calls[9]).toBe("COUNT 10\nFROM THE TOP");
    expect(calls[20]).toBe("COUNT 21\nFROM THE TOP");
    expect(calls[10]).toBe("COUNT 11\nFROM THE TOP");
  });

  it("names the letter of every bingo ball", () => {
    const letters = textsOf("bingo");
    expect(letters).toHaveLength(75);
    expect([letters[0], letters[15], letters[30], letters[45], letters[74]]).toEqual(["B", "I", "N", "G", "O"]);
  });

  it("has an arrow for each of the eight directions", () => {
    expect(new Set(picturesOf("dirs")).size).toBe(8);
  });
});

describe("the coin", () => {
  it("has heads and tails, and lets either repeat", () => {
    expect(textsOf("coin")).toEqual(["HEADS", "TAILS"]);
    expect(splitHeader(decks.find((d) => d.id === "coin")?.text ?? "")?.head).toContain("REPEAT=1");
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
