import { beforeEach, describe, expect, it } from "vitest";
import { REVEAL_STEPS } from "../src/config.ts";
import { toError } from "../src/game.ts";
import { s } from "../src/state.ts";
import { frame } from "../src/view/screens.ts";
import { freshState, parseShipped } from "./helpers.ts";

/** DisplayClear's diffing relies on ids being unique within a frame. */
function expectUniqueIds(elements: { id: string }[]): void {
  const ids = elements.map((e) => e.id);
  expect(new Set(ids).size, ids.join(",")).toBe(ids.length);
}

function reveal(value: number, parts: (string | null)[], partIndex = 0): void {
  s.phase = "reveal";
  s.value = value;
  s.parts = parts;
  s.partIndex = partIndex;
  s.revealStep = REVEAL_STEPS;
  s.drawn = 1;
}

describe("frame", () => {
  beforeEach(() => freshState(parseShipped("classic")));

  it("is empty until the deck is loaded", () => {
    s.loaded = false;
    expect(frame()).toEqual([]);
  });

  it("shows the deck's own start phrase", () => {
    const texts = frame().flatMap((e) => (e.type === "text" ? [e.text] : []));
    expect(texts).toEqual(["ASK ALOUD,", "PRESS START"]);
  });

  it("draws the frame the wheel spins under, and a progress pip per result", () => {
    s.phase = "ready";
    const elements = frame();
    expect(elements.filter((e) => e.id === "frame")).toHaveLength(1);
    expect(elements.filter((e) => e.id.startsWith("dot-"))).toHaveLength(s.spreadTarget);
    expectUniqueIds(elements);
  });

  it("never lists the strip: it is an animation the bar plays, and sending it again would restart it", () => {
    for (const phase of ["ready", "spin"] as const) {
      s.phase = phase;
      expect(frame().some((e) => e.id === "strip" || e.type === "animation")).toBe(false);
    }
  });

  it("turns the frame white while braking", () => {
    s.phase = "spin";
    const border = () => {
      const f = frame().find((e) => e.id === "frame");
      return f?.type === "rectangle" ? f.border_color : undefined;
    };
    s.braking = false;
    expect(border()).toBe("#FFD24DFF");
    s.braking = true;
    expect(border()).toBe("#FFFFFFFF");
  });

  it("grows the picked card before showing it", () => {
    reveal(5, []);
    s.revealStep = 0;
    expect(frame().map((e) => e.id)).toEqual(["reveal-card"]);
  });

  it("shows art, then the prediction, for a two-step deck", () => {
    reveal(5, ["! XPM2\n", "TRUST YOUR INTUITION"]);
    expect(frame().map((e) => e.id)).toEqual(["art-bg", "art", "dot-0", "dot-1", "dot-2"].slice(0, 2));

    s.partIndex = 1;
    const lines = frame().flatMap((e) => (e.type === "text" ? [e.text] : []));
    expect(lines).toEqual(["TRUST YOUR", "INTUITION"]);
  });

  it("falls back to the number when a record could not be read", () => {
    reveal(5, []);
    s.partsFailed = true;
    expect(frame().flatMap((e) => (e.type === "text" ? [e.text] : []))).toEqual(["5"]);
  });

  it("shows only the background while a record is still loading", () => {
    reveal(5, []);
    expect(frame().map((e) => e.id)).toEqual(["reveal-card"]);
  });

  it("labels number results with the die", () => {
    freshState(parseShipped("d20"));
    reveal(17, [null]);
    const texts = frame().flatMap((e) => (e.type === "text" ? [e.text] : []));
    expect(texts).toEqual(["17", "D20"]);
  });

  it.each([1, 2, 3, 4, 5, 6])("draws a d6 face with %i pips", (value) => {
    freshState(parseShipped("d6"));
    reveal(value, [null]);
    const elements = frame();
    expect(elements.filter((e) => e.id.startsWith("pip-"))).toHaveLength(value);
    expectUniqueIds(elements);
  });

  it("splits an error into the file and what is wrong with it", () => {
    toError("deck-broken.txt: bad COUNT abc");
    const texts = frame().flatMap((e) => (e.type === "text" ? [e.text] : []));
    expect(texts).toEqual(["deck-broken.txt", "bad COUNT abc"]);
  });

  it("wraps a long error to two lines under the file name", () => {
    toError("deck-x.txt: PAL has 32 colors, max 31 and then some more words");
    expect(frame()).toHaveLength(3);
  });
});
