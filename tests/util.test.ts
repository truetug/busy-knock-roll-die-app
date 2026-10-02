import { describe, expect, it } from "vitest";
import { clamp, errorMessage, lerp, shuffled, wrapWords } from "../src/util.ts";

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

describe("shuffled", () => {
  it("is a permutation of 1..size", () => {
    const values = shuffled(78);
    expect([...values].sort((a, b) => a - b)).toEqual(Array.from({ length: 78 }, (_, i) => i + 1));
  });

  it("handles a single item and none", () => {
    expect(shuffled(1)).toEqual([1]);
    expect(shuffled(0)).toEqual([]);
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
