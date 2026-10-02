import { describe, expect, it } from "vitest";
import { deckFileName, deckIdFromFile, decodeRecord, parseDeck, splitHeader } from "../src/deck/format.ts";
import { SETTINGS_COLOR } from "./helpers.ts";

const HEADER = "COUNT=5\nREPEAT=1\nSPREAD=2\nBG=006600\nINTRO1=HI\nINTRO2=GO\nSTEP=number";

/** Parses `head` as if its file held `items` records of `recordSize` bytes after it. */
function parse(head: string, items = 0, recordSize = 0) {
  const dataStart = head.length + "\n---\n".length;
  return parseDeck(head, dataStart, "deck-x.txt", dataStart + items * recordSize, SETTINGS_COLOR);
}

describe("file names", () => {
  it("round-trips deck ids", () => {
    expect(deckFileName("tarot")).toBe("deck-tarot.txt");
    expect(deckIdFromFile("deck-tarot.txt")).toBe("tarot");
    expect(deckIdFromFile("readme.txt")).toBeNull();
    expect(deckIdFromFile("deck-tarot.png")).toBeNull();
  });
});

describe("splitHeader", () => {
  it("cuts at the --- line and says where the records start", () => {
    const text = `${HEADER}\n---\nRECORDS`;
    const split = splitHeader(text);
    expect(split?.head).toBe(HEADER);
    expect(text.slice(split?.dataStart)).toBe("RECORDS");
  });

  it("is null while the delimiter has not arrived", () => {
    expect(splitHeader("COUNT=5\nSTEP=number\n")).toBeNull();
  });
});

describe("parseDeck", () => {
  it("reads the fields", () => {
    const deck = parse(HEADER);
    expect(deck).toMatchObject({ count: 5, repeat: true, spread: 2, intro1: "HI", intro2: "GO", label: null });
    expect(deck.steps).toEqual([{ kind: "number", size: 0, offset: 0, bg: "#006600FF" }]);
  });

  it("falls back to defaults", () => {
    const deck = parse("COUNT=3\nSTEP=number");
    expect(deck).toMatchObject({ repeat: false, spread: 3, intro2: "PRESS START" });
  });

  it("takes the user's colour for BG=settings", () => {
    expect(parse("COUNT=3\nBG=settings\nSTEP=number").steps[0].bg).toBe(SETTINGS_COLOR);
  });

  it("lays steps out one after another inside the record", () => {
    const deck = parse("COUNT=5\nPAL=FFFFFF\nSTEP=art\nSTEP=text:32:1E1B4B", 5, 1152 + 32);
    expect(deck.steps.map((st) => [st.kind, st.offset, st.size])).toEqual([
      ["art", 0, 1152],
      ["text", 1152, 32],
    ]);
    expect(deck.recordSize).toBe(1184);
    expect(deck.steps[1].bg).toBe("#1E1B4BFF");
  });

  const bad: [string, string, string][] = [
    ["missing COUNT", "STEP=number", "bad COUNT (missing)"],
    ["non-numeric COUNT", "COUNT=abc\nSTEP=number", "bad COUNT abc"],
    ["zero COUNT", "COUNT=0\nSTEP=number", "bad COUNT 0"],
    ["no steps", "COUNT=3", "no STEP lines"],
    ["unknown step", "COUNT=3\nSTEP=video", "bad STEP video"],
    ["art without palette", "COUNT=3\nSTEP=art", "art STEP needs PAL"],
    ["text without size", "COUNT=3\nSTEP=text", "text STEP needs a size"],
    ["bad colour", "COUNT=3\nBG=red\nSTEP=number", "bad color red"],
    ["palette too big", `COUNT=3\nPAL=${Array(32).fill("FFFFFF").join(",")}\nSTEP=number`, "PAL has 32 colors, max 31"],
  ];
  it.each(bad)("rejects %s", (_name, head, why) => {
    expect(() => parse(head)).toThrow(`deck-x.txt: ${why}`);
  });

  it("rejects a file whose size does not match header and records", () => {
    expect(() => parse("COUNT=2\nSTEP=text:8", 1, 8)).toThrow(/size \d+, expected \d+/);
  });
});

describe("card backs", () => {
  const back = "BACKPAL=FFD24D\nBACKFILL=112233\nBACKEDGE=445566\nBACK=.A.\nBACK=AAA";

  it("has none unless the header says so", () => {
    expect(parse("COUNT=3\nSTEP=number").back).toBeNull();
  });

  it("reads the picture and the card colours", () => {
    const deck = parse(`COUNT=3\nSTEP=number\n${back}`);
    expect(deck.back?.xpm).toMatch(/^! XPM2/);
    expect(deck.back).toMatchObject({ fill: "#112233FF", edge: "#445566FF" });
  });

  it("allows colours alone, with a plain back", () => {
    expect(parse("COUNT=3\nSTEP=number\nBACKFILL=112233").back).toEqual({ xpm: null, fill: "#112233FF", edge: "#C4B5FDFF" });
  });

  const bad: [string, string, string][] = [
    ["a picture without colours", "BACK=AA", "BACK needs BACKPAL"],
    ["uneven rows", "BACKPAL=FFFFFF\nBACK=AA\nBACK=A", "BACK must be a rectangle up to 15x11"],
    ["a picture that is too wide", `BACKPAL=FFFFFF\nBACK=${"A".repeat(16)}`, "BACK must be a rectangle up to 15x11"],
    ["a picture that is too tall", `BACKPAL=FFFFFF\n${"BACK=A\n".repeat(12)}`, "BACK must be a rectangle up to 15x11"],
    ["a pixel outside the palette", "BACKPAL=FFFFFF\nBACK=AB", 'BACK uses "B", not in BACKPAL'],
    ["a bad card colour", "BACKFILL=nope", "bad color nope"],
  ];
  it.each(bad)("rejects %s", (_name, lines, why) => {
    expect(() => parse(`COUNT=3\nSTEP=number\n${lines.trim()}`)).toThrow(`deck-x.txt: ${why}`);
  });
});

describe("decodeRecord", () => {
  it("trims text and draws art as XPM2", () => {
    const deck = parse("COUNT=1\nPAL=FFFFFF\nSTEP=art\nSTEP=text:8", 1, 1152 + 8);
    const record = `${"A".repeat(1152)}HI      `;
    const [art, text] = decodeRecord(deck, record);
    expect(art).toMatch(/^! XPM2/);
    expect(text).toBe("HI");
  });

  it("gives null for steps without bytes", () => {
    expect(decodeRecord(parse("COUNT=1\nSTEP=die"), "")).toEqual([null]);
  });
});
