// Getting frames and the wheel's strip onto the display (through the request queue).

import { APP } from "./config.ts";
import { device } from "./device.ts";
import { enqueue, pendingOf } from "./queue.ts";
import { plan, type Shown } from "./screen.ts";
import type { StripCommand } from "./state.ts";
import { report } from "./util.ts";
import { frame } from "./view/screens.ts";

/** What the bar's screen holds, from our side (see screen.ts). Only updated once a request has been served. */
let shown: Shown = new Map();

async function sendFrame(): Promise<void> {
  const { draw, clear, next } = plan(shown, frame());

  // An id that changes kind can not be redrawn in place: it is cleared first (the rare case; it was drawn, so the clear is valid).
  if (clear.length > 0) {
    try {
      await device.DisplayClear({ application_name: APP, element_ids: clear });
    } catch (err) {
      report(err);
    }
  }
  if (draw.length > 0) await device.DisplayDraw({ application_name: APP, priority: 50, elements: draw });
  shown = next;
}

/** Routine animation frame: skipped if another is already in flight or queued. */
export function drawSoon(): void {
  if (pendingOf("frame") === 0) enqueue(sendFrame, "frame");
}

/** A frame that must show: queued behind whatever is in flight. */
export function drawNow(): void {
  enqueue(sendFrame, "frame");
}

// ── The wheel's strip ───────────────────────────────────────────────────────
// The moving cards are an animation element the bar plays on its own at 60 fps. Sending the same element again
// restarts it, so it is sent only when the clip changes, never as part of a frame - and since frames never list it,
// the frame diff above never clears it either.

let stripOn = false;

/** Whether the strip is on the bar's screen (or on its way there). */
export const stripShown = (): boolean => stripOn;
const STRIP_PATH = "animations/strip.anim";

/** Sends the next clip for the strip; `sent` is told when the bar has taken it. */
export function playStrip(command: StripCommand, sent?: (at: number) => void): void {
  stripOn = true;

  enqueue(async () => {
    if (command.fresh) {
      try {
        await device.DisplayClear({ application_name: APP, element_ids: ["strip"] });
      } catch (err) {
        report(err);
      }
    }
    await device.DisplayDraw({
      application_name: APP,
      priority: 50,
      elements: [
        {
          id: "strip",
          type: "animation",
          x: 0,
          y: 0,
          align: "top_left",
          path: STRIP_PATH,
          section: command.name,
          loop: command.loop,
          await_previous_end: command.awaitEnd,
          z_index: 0,
        },
      ],
    });
    sent?.(Date.now());
  }, "strip");
}

/** Takes the strip off the screen (when the wheel is not the thing being shown). */
export function hideStrip(): void {
  if (!stripOn) return;
  stripOn = false;

  enqueue(async () => {
    try {
      await device.DisplayClear({ application_name: APP, element_ids: ["strip"] });
    } catch (err) {
      report(err);
    }
  }, "strip");
}
