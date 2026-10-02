// The wheel's pre-rendered clips: what src/clips.json (written by tools/make_anim.py) says about src/animations/strip-<n>.anim.
// A clip moves the card strip by exactly one card, so they chain without a seam. Names:
//   rest · hold-k (loops) · up-k (level k → k+1) · down-k (k → k-1) · launch-k (rest → k) · stop (1 → rest)

import data from "./clips.json";

export type Clip = { frames: number; loop: boolean; click: number | null };

export const CLIPS: Record<string, Clip> = data.clips;
/** The fastest level; level 0 is at rest. */
export const LEVELS: number = data.levels;
const FPS: number = data.fps;

export function clipMs(name: string): number {
  return (CLIPS[name].frames * 1000) / FPS;
}

/** When, from the start of the clip, a card crosses into the frame; null if none does. */
export function clickMs(name: string): number | null {
  const frame = CLIPS[name].click;
  return frame === null ? null : (frame * 1000) / FPS;
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
      return 0; // rest, stop
  }
}

/** The animation file whose cards look like the given card back; the default look if none does. */
export function stripFile(fill: string, edge: string): string {
  const match = data.variants.find((v) => v.fill === fill && v.edge === edge);
  return (match ?? data.variants[0]).file;
}
