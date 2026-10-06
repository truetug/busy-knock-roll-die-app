import { describe, expect, it } from "vitest";
import { chooseVariants, deckFileName, deckIdFromFile, decodeRecord, parseDeck, splitHeader, splitScreens } from "../src/deck/format.ts";
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
    expect(deck.steps).toEqual([{ kind: "number", bg: "#006600FF" }]);
  });

  it("falls back to defaults", () => {
    const deck = parse("COUNT=3\nSTEP=number");
    expect(deck).toMatchObject({ repeat: false, spread: 3, intro2: "PRESS START" });
  });

  it("takes the user's colour for BG=settings", () => {
    expect(parse("COUNT=3\nBG=settings\nSTEP=number").steps[0].bg).toBe(SETTINGS_COLOR);
  });

  it("reads the steps in order, each with its own background if it has one", () => {
    const deck = parse("COUNT=5\nRECORD=1300\nPAL=FFFFFF\nSTEP=art\nSTEP=text:1E1B4B", 5, 1300);
    expect(deck.steps.map((st) => [st.kind, st.bg])).toEqual([
      ["art", "#2E1065FF"],
      ["text", "#1E1B4BFF"],
    ]);
    expect(deck.recordSize).toBe(1300);
  });

  it("ignores comment lines in the header", () => {
    expect(parse("# a comment\nCOUNT=3\n# COUNT=9\nSTEP=number").count).toBe(3);
  });

  const bad: [string, string, string][] = [
    ["missing COUNT", "STEP=number", "bad COUNT (missing)"],
    ["non-numeric COUNT", "COUNT=abc\nSTEP=number", "bad COUNT abc"],
    ["zero COUNT", "COUNT=0\nSTEP=number", "bad COUNT 0"],
    ["no steps", "COUNT=3", "no STEP lines"],
    ["unknown step", "COUNT=3\nSTEP=video", "bad STEP video"],
    ["art without palette", "COUNT=3\nSTEP=art", "art STEP needs PAL"],
    ["screens without RECORD", "COUNT=3\nSTEP=text", "bad RECORD (missing)"],
    ["a RECORD that is not a number", "COUNT=3\nRECORD=big\nSTEP=text", "bad RECORD big"],
    ["bad colour", "COUNT=3\nBG=red\nSTEP=number", "bad color red"],
    ["palette too big", `COUNT=3\nPAL=${Array(32).fill("FFFFFF").join(",")}\nSTEP=number`, "PAL has 32 colors, max 31"],
  ];
  it.each(bad)("rejects %s", (_name, head, why) => {
    expect(() => parse(head)).toThrow(`deck-x.txt: ${why}`);
  });

  it("rejects a file whose size does not match header and records", () => {
    expect(() => parse("COUNT=2\nRECORD=8\nSTEP=text", 1, 8)).toThrow(/size \d+, expected \d+/);
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

describe("splitScreens", () => {
  it("splits at blank lines, drops comments and trims", () => {
    const item = "# 5 TITLE\nFIRST\nSCREEN  \n\n\n  SECOND\n# ---------\n";
    expect(splitScreens(item)).toEqual(["FIRST\nSCREEN", "SECOND"]);
  });

  it("copes with padding of any kind after the last screen", () => {
    expect(splitScreens("ONE\n\n   \n\n\n")).toEqual(["ONE"]);
  });
});

describe("chooseVariants", () => {
  it("leaves lines without a | as they are", () => {
    expect(chooseVariants("47\nBABA YAGODKA", () => 0.5)).toBe("47\nBABA YAGODKA");
  });

  it("picks one option per line that offers some", () => {
    expect(chooseVariants("2\nSWAN | GOOSE | PAIR", () => 0)).toBe("2\nSWAN");
    expect(chooseVariants("2\nSWAN | GOOSE | PAIR", () => 0.5)).toBe("2\nGOOSE");
    expect(chooseVariants("2\nSWAN | GOOSE | PAIR", () => 0.999)).toBe("2\nPAIR");
  });

  it("chooses for every line on its own", () => {
    let calls = 0;
    const alternate = () => (calls++ % 2 === 0 ? 0 : 0.999);
    expect(chooseVariants("A|B\nC|D", alternate)).toBe("A\nD");
  });

  it("reaches every option by chance", () => {
    const seen = new Set(Array.from({ length: 200 }, () => chooseVariants("X|Y|Z")));
    expect([...seen].sort()).toEqual(["X", "Y", "Z"]);
  });
});

describe("decodeRecord", () => {
  const art = Array.from({ length: 16 }, () => "A".repeat(72)).join("\n");
  const two = () => parse("COUNT=1\nRECORD=1300\nPAL=FFFFFF\nSTEP=art\nSTEP=text", 1, 1300);

  it("draws art as XPM2 and keeps the text as written", () => {
    const [picture, text] = decodeRecord(two(), `# 1 FOOL\n${art}\n\nA NEW LEAP\nOF FAITH\n# ------\n`, 1);
    expect(picture).toMatch(/^! XPM2/);
    expect(text).toBe("A NEW LEAP\nOF FAITH");
  });

  it("shows one variant of a text line", () => {
    const deck = parse("COUNT=1\nRECORD=64\nSTEP=text", 1, 64);
    expect(decodeRecord(deck, "# 2\n2\nSWAN|GOOSE\n# ---\n", 1, () => 0.99)).toEqual(["2\nGOOSE"]);
  });

  it("gives null for steps that need nothing written", () => {
    expect(decodeRecord(parse("COUNT=1\nSTEP=die"), "", 1)).toEqual([null]);
    expect(decodeRecord(parse("COUNT=1\nRECORD=40\nSTEP=number\nSTEP=text", 1, 40), "HELLO\n", 1)).toEqual([null, "HELLO"]);
  });

  it("says which item has the wrong number of screens", () => {
    expect(() => decodeRecord(two(), `${art}\n`, 7)).toThrow("deck-x.txt: item 7: 1 screens, the header's STEPs need 2");
  });

  it("says what is wrong with an art screen", () => {
    const short = `${art.slice(0, -73)}\n\nTEXT`;
    expect(() => decodeRecord(two(), short, 3)).toThrow("item 3: art must be 16 lines of 72 characters");
    const stray = `${art.replace("A", "Z")}\n\nTEXT`;
    expect(() => decodeRecord(two(), stray, 4)).toThrow('item 4: art uses "Z", not in PAL');
  });
});
