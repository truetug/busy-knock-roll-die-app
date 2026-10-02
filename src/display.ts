// Getting frames onto the display, one request at a time.

import { device } from "@shared/device";
import { stripFile } from "./clips.ts";
import { APP } from "./config.ts";
import { type StripCommand, s } from "./state.ts";
import { report } from "./util.ts";
import { backFor } from "./view/backs.ts";
import { frame } from "./view/screens.ts";

// Every request to the bar (frames, sounds, the strip) is serialized through this queue: never more than one
// loopback request in flight (the JS heap is tiny — piling them up crashed the
// device once), and a frame that matters is never dropped just because a
// routine one was in flight.
let queue: Promise<void> = Promise.resolve();
/** Requests queued or running, by kind: a frame is skipped only if another frame is waiting, a click only if another click is. */
const pending = { frame: 0, sound: 0, strip: 0 };

type Kind = keyof typeof pending;

/** How many requests of this kind are waiting or running. */
export function pendingOf(kind: Kind): number {
  return pending[kind];
}

/** Runs a request after the ones already queued; nothing else may talk to the bar concurrently. */
export function enqueue(fn: () => Promise<void>, kind: Kind = "sound"): void {
  pending[kind]++;
  // .then(ok, err) rather than .finally(): an intermittent "Expected a
  // function" showed up on this engine with .finally() and no clearer cause.
  const result = queue.then(fn).then(
    () => {
      pending[kind]--;
    },
    (err: unknown) => {
      pending[kind]--;
      throw err;
    },
  );
  queue = result.catch(() => undefined);
  result.catch(report);
}

/**
 * Ids in the last frame sent. `DisplayClear` rejects the whole request with 400
 * if even one id was never drawn, so leftovers are found by diffing against
 * what is really there, never from a guessed list.
 */
let lastIds = new Set<string>();

async function sendFrame(): Promise<void> {
  const elements = frame();
  const ids = new Set(elements.map((e) => e.id));
  const leftovers = [...lastIds].filter((id) => !ids.has(id));

  // Draw first, clear after: clearing first leaves a moment with nothing on
  // screen, and the launcher shows "Running..." in that gap.
  await device.DisplayDraw({ application_name: APP, priority: 50, elements });
  lastIds = ids;

  if (leftovers.length > 0) {
    try {
      await device.DisplayClear({ application_name: APP, element_ids: leftovers });
    } catch (err) {
      report(err);
    }
  }
}

/** Routine animation frame: skipped if another is already in flight or queued. */
export function drawSoon(): void {
  if (pending.frame === 0) enqueue(sendFrame, "frame");
}

/** A frame that must show: queued behind whatever is in flight. */
export function drawNow(): void {
  enqueue(sendFrame, "frame");
}

// ── The wheel's strip ───────────────────────────────────────────────────────
// The moving cards are an animation element the bar plays on its own at 60 fps. Sending the same element again
// restarts it, so it is sent only when the clip changes, never as part of a frame - and since frames never list it,
// the frame diff above never clears it either.

let stripShown = false;

/** Sends the next clip for the strip. */
export function playStrip(command: StripCommand): void {
  const back = backFor(s.deck, s.back);
  const path = `animations/${stripFile(back.fill, back.edge)}`;
  stripShown = true;

  enqueue(async () => {
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
          path,
          section: command.name,
          loop: command.loop,
          await_previous_end: command.awaitEnd,
          z_index: 0,
        },
      ],
    });
  }, "strip");
}

/** Takes the strip off the screen (when the wheel is not the thing being shown). */
export function hideStrip(): void {
  if (!stripShown) return;
  stripShown = false;

  enqueue(async () => {
    try {
      await device.DisplayClear({ application_name: APP, element_ids: ["strip"] });
    } catch (err) {
      report(err);
    }
  }, "strip");
}
