// What is on the bar's screen, as far as we know, and the smallest request that turns it into the next frame.
//
// The bar merges the elements of a draw request by id: an id drawn again replaces the old element, in place and at once. So a frame
// is sent as one request that holds only what changed - an element that no longer belongs to the screen is not cleared by a request of
// its own (which would leave it on show beside the new elements until that request is served, and a separate request is slow while
// the strip animation plays) but redrawn, in the same request, as an invisible element of the same kind. Everything that changes,
// changes together; what did not change is not sent, so it can not flicker. Pure: display.ts sends what it plans.

import { generateXpm2 } from "@busy-app/busy-lib";
import type { Elem } from "./view/elements.ts";

const BLANK_XPM = generateXpm2({ palette: { ".": "none" }, grid: ["."] });

export type Shown = Map<string, { elem: Elem; json: string; blank: boolean }>;

/** The element drawn so that nothing shows, or null for a kind that can not be (an id can not change its kind: such a one is cleared). */
export function blankOf(elem: Elem): Elem | null {
  switch (elem.type) {
    case "text":
      return { ...elem, text: "" };
    case "rectangle":
      return { ...elem, fill: "none", border_width: 0 };
    case "xpmbitmap":
      return { ...elem, data: BLANK_XPM };
    default:
      return null;
  }
}

export type Plan = {
  /** Elements to draw, in one request. */
  draw: Elem[];
  /** Ids to clear first: an id that now holds another kind of element, or one that can not be blanked. */
  clear: string[];
  /** What the screen holds once the request has been served. */
  next: Shown;
};

/** What to send to get from the screen `shown` to the frame `elements`. */
export function plan(shown: Shown, elements: Elem[]): Plan {
  const draw: Elem[] = [];
  const clear: string[] = [];
  const next: Shown = new Map();

  const wanted = new Set<string>();
  for (const elem of elements) {
    wanted.add(elem.id);
    const json = JSON.stringify(elem);
    const before = shown.get(elem.id);
    if (before !== undefined && before.elem.type !== elem.type) clear.push(elem.id);
    if (before === undefined || before.elem.type !== elem.type || before.blank || before.json !== json) draw.push(elem);
    next.set(elem.id, { elem, json, blank: false });
  }

  for (const [id, before] of shown) {
    if (wanted.has(id)) continue;
    if (before.blank) {
      next.set(id, before);
      continue;
    }
    const blank = blankOf(before.elem);
    if (blank === null) {
      clear.push(id);
    } else {
      draw.push(blank);
      next.set(id, { elem: blank, json: JSON.stringify(blank), blank: true });
    }
  }
  return { draw, clear, next };
}
