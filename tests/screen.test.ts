import { beforeEach, describe, expect, it } from "vitest";
import { REVEAL_STEPS } from "../src/config.ts";
import { blankOf, plan, type Shown } from "../src/screen.ts";
import { s } from "../src/state.ts";
import { background, bitmap, rect, text } from "../src/view/elements.ts";
import { frame } from "../src/view/screens.ts";
import { freshState, parseShipped } from "./helpers.ts";

const hold = (...elems: ReturnType<typeof text>[]): Shown => plan(new Map(), elems).next;

describe("what a frame sends", () => {
  it("sends everything on an empty screen", () => {
    const elems = [background("bg", "#112233FF"), text("a", 36, 8, "HI", "small", "#FFFFFFFF")];
    const { draw, clear } = plan(new Map(), elems);
    expect(draw.map((e) => e.id)).toEqual(["bg", "a"]);
    expect(clear).toEqual([]);
  });

  it("sends nothing for what did not change, and only the element that did", () => {
    const shown = hold(background("bg", "#112233FF"), text("a", 36, 8, "HI", "small", "#FFFFFFFF"));
    expect(plan(shown, [background("bg", "#112233FF"), text("a", 36, 8, "HI", "small", "#FFFFFFFF")]).draw).toEqual([]);
    const changed = plan(shown, [background("bg", "#112233FF"), text("a", 36, 8, "BYE", "small", "#FFFFFFFF")]).draw;
    expect(changed.map((e) => e.id)).toEqual(["a"]);
  });

  it("blanks what left the screen in the same request, instead of clearing it", () => {
    const shown = hold(text("a", 36, 8, "HI", "small", "#FFFFFFFF"), rect("r", 5, 5, 4, 4, "#FF0000FF"));
    const { draw, clear } = plan(shown, [text("a", 36, 8, "HI", "small", "#FFFFFFFF"), text("b", 1, 1, "NEW", "small", "#FFFFFFFF")]);
    expect(clear).toEqual([]);
    expect(draw.map((e) => e.id).sort()).toEqual(["b", "r"]);
    const gone = draw.find((e) => e.id === "r");
    expect(gone).toMatchObject({ type: "rectangle", fill: "none", border_width: 0, width: 4, height: 4 });
  });

  it("does not blank what is blank already, and draws it again when it comes back", () => {
    const first = plan(hold(text("a", 36, 8, "HI", "small", "#FFFFFFFF")), []);
    expect(first.draw).toHaveLength(1);
    const second = plan(first.next, []);
    expect(second.draw).toEqual([]);
    const back = plan(second.next, [text("a", 36, 8, "HI", "small", "#FFFFFFFF")]);
    expect(back.draw.map((e) => e.id)).toEqual(["a"]);
  });

  it("blanks a text with an empty text and a bitmap with an invisible one, in place", () => {
    expect(blankOf(text("a", 1, 1, "HI", "small", "#FFFFFFFF"))).toMatchObject({ type: "text", text: "" });
    const blank = blankOf(bitmap("b", 1, 1, "! XPM2\n1 1 1 1\nA c #FFFFFF\nA", "center", 1));
    expect(blank).toMatchObject({ type: "xpmbitmap", id: "b" });
    expect(JSON.stringify(blank)).toContain("none");
  });

  it("clears an id that now holds another kind of element, since the bar will not change an element's kind", () => {
    const shown = hold(text("x", 1, 1, "HI", "small", "#FFFFFFFF"));
    const { draw, clear } = plan(shown, [rect("x", 1, 1, 4, 4, "#FF0000FF")]);
    expect(clear).toEqual(["x"]);
    expect(draw.map((e) => e.id)).toEqual(["x"]);
  });
});

describe("the app's screens", () => {
  beforeEach(() => freshState(parseShipped("classic")));

  /** Every frame the game shows, for decks of every kind of result: ids and the kinds of element they hold. */
  function everyFrame(): { id: string; type: string }[] {
    const seen: { id: string; type: string }[] = [];
    const take = () => seen.push(...frame().map((e) => ({ id: e.id, type: e.type })));
    for (const id of ["classic", "ball", "d20", "d6", "loto", "roul", "domino", "bingo", "2d6", "tcount"]) {
      freshState(parseShipped(id), 3);
      s.value = 7;
      s.drawn = 1;
      for (const phase of ["intro", "ready", "spin", "error"] as const) {
        s.phase = phase;
        s.errorText = "deck-x.txt: item 3: bad";
        for (const turns of [0, 3]) {
          s.turns = turns;
          for (const clip of ["hold-5", "stop-1"]) {
            s.wheel.clip = clip;
            for (const blink of [0, 2]) {
              s.blink = blink;
              take();
            }
          }
        }
      }
      s.phase = "reveal";
      s.parts = s.deck.steps.map(() => "! XPM2\n1 1 1 1\nA c #FFFFFF\nA");
      s.partsFailed = false;
      for (let step = 0; step <= REVEAL_STEPS; step++) {
        s.revealStep = step;
        for (let part = 0; part < s.deck.steps.length; part++) {
          s.partIndex = part;
          take();
        }
      }
      s.partsFailed = true;
      s.parts = [];
      take();
      s.auto = true;
      s.phase = "intro";
      take();
    }
    return seen;
  }

  it("never gives one id two kinds of element: the bar would refuse to redraw it in place", () => {
    const kinds = new Map<string, string>();
    for (const { id, type } of everyFrame()) {
      const known = kinds.get(id);
      expect(known === undefined || known === type, `${id} is a ${known} and a ${type}`).toBe(true);
      kinds.set(id, type);
    }
    expect(kinds.size).toBeGreaterThan(15);
  });

  it("can blank every element it draws", () => {
    for (const { id } of everyFrame()) expect(id).toMatch(/^[a-zA-Z0-9._-]+$/);
    const seenTypes = new Set(everyFrame().map((e) => e.type));
    for (const type of seenTypes) expect(["text", "rectangle", "xpmbitmap"], `a ${type} could not be blanked`).toContain(type);
  });
});
