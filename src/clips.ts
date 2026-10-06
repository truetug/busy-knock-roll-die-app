// The wheel's pre-rendered clips: what src/clips.json (written by tools/make_anim.py) says about src/animations/strip.anim.
// Every clip starts and ends on a card boundary, so they chain without a seam. Names:
//   rest · hold-k (loops) · up-k (level k → k+1) · down-k (k → k-1) · launch-k (rest → k) · stop-k (k → rest)
// The lowest level is 1; the wheel is at rest (level 0) before a launch-k and after a stop-k.
// A clip that is not a loop is finished for good once it ends: the follow-up must reach the bar before then. The ramps
// therefore end with a tail of constant-speed motion, in which that request is sent (see tools/make_anim.py).

import data from "./clips.json";

type Clip = { frames: number; loop: boolean; clicks: number[] };

export const CLIPS: Record<string, Clip> = data.clips;
/** The fastest level; level 0 is at rest. */
export const LEVELS: number = data.levels;
const FPS: number = data.fps;

export function clipMs(name: string): number {
  return (CLIPS[name].frames * 1000) / FPS;
}

/** When, from the start of the clip, each card crosses into the frame (ms). */
export function clickTimes(name: string): number[] {
  return CLIPS[name].clicks.map((frame) => (frame * 1000) / FPS);
}

/** The level the wheel is at when the clip has played. */
export function endLevel(name: string): number {
  const [kind, k] = name.split("-");
  const n = Number(k);
  switch (kind) {
    case "hold":
    case "launch":
      return n;
    case "up":
      return n + 1;
    case "down":
      return n - 1;
    default:
      return 0; // rest, stop-k
  }
}
