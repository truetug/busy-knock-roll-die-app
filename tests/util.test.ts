import { describe, expect, it } from "vitest";
import { clamp, colorDistance, errorMessage, lerp, mixColor, utf8Length, wrapWords } from "../src/util.ts";

describe("utf8Length", () => {
  it("counts bytes, not characters", () => {
    expect(utf8Length("ABC")).toBe(3);
    expect(utf8Length("Иван")).toBe(8);
    expect(utf8Length("€")).toBe(3);
    expect(utf8Length("😀")).toBe(4);
  });
});

describe("wrapWords", () => {
  it("keeps short text on one line", () => {
    expect(wrapWords("YES", 13)).toEqual(["YES"]);
  });

  it("wraps greedily at word boundaries", () => {
    expect(wrapWords("CONCENTRATE AND ASK AGAIN", 13)).toEqual(["CONCENTRATE", "AND ASK AGAIN"]);
  });

  it("never splits a word, even a long one", () => {
    expect(wrapWords("EXTRAORDINARILY LONG", 5)).toEqual(["EXTRAORDINARILY", "LONG"]);
  });

  it("returns nothing for empty text", () => {
    expect(wrapWords("", 13)).toEqual([]);
  });
});

describe("mixColor", () => {
  it("runs from one colour to the other", () => {
    expect(mixColor("#000000FF", "#FFD24DFF", 0)).toBe("#000000FF");
    expect(mixColor("#000000FF", "#FFD24DFF", 1)).toBe("#FFD24DFF");
    expect(mixColor("#000000FF", "#FEFEFEFF", 0.5)).toBe("#7F7F7FFF");
  });
});

describe("colorDistance", () => {
  it("is 0 for the same colour and grows with the difference", () => {
    expect(colorDistance("#FFD24DFF", "#FFD24DFF")).toBe(0);
    expect(colorDistance("#000000FF", "#FFFFFFFF")).toBe(765);
  });
});

describe("numbers", () => {
  it("clamps", () => {
    expect(clamp(9, 0, 5)).toBe(5);
    expect(clamp(-9, 0, 5)).toBe(0);
    expect(clamp(3, 0, 5)).toBe(3);
  });

  it("lerps to whole pixels", () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(11, 17, 0)).toBe(11);
    expect(lerp(11, 17, 1)).toBe(17);
  });
});

describe("errorMessage", () => {
  it("reads Errors and anything else", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("plain")).toBe("plain");
  });
});
