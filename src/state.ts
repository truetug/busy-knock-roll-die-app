// The app's whole mutable state, in one place. Game logic writes it, views read it.

import { DEFAULT_COLOR, type SoundEvent } from "./config.ts";
import { type Deck, EMPTY_DECK, type Part } from "./deck/format.ts";
import { shuffled } from "./util.ts";
import type { BackChoice } from "./view/backs.ts";

/**
 * intro: the start screen; ready: wheel waiting for a spin; spin: wheel turning;
 * reveal: the picked item; error: the deck file is unusable.
 */
export type Phase = "intro" | "ready" | "spin" | "reveal" | "error";

/** A clip for the bar to play on the wheel's strip. */
export type StripCommand = { name: string; loop: boolean; awaitEnd: boolean };

export const s = {
  phase: "intro" as Phase,
  /** False until the settings and the deck have been read. */
  loaded: false,
  errorText: "",

  // from the settings
  color: DEFAULT_COLOR,
  spreadSetting: null as number | null,
  back: "auto" as BackChoice,
  soundOn: true,

  deck: EMPTY_DECK as Deck,

  // the current reading
  /** Items still to pick from; drawn ones leave it unless the deck repeats. */
  pool: [] as number[],
  /** Results this reading shows, and how many it has shown. */
  spreadTarget: 1,
  drawn: 0,

  // the wheel: a chain of pre-rendered clips (see wheel.ts)
  wheel: {
    /** The level the clip now playing ends at; 0 is at rest. */
    level: 0,
    /** The level the wheel is being pushed towards. */
    target: 0,
    clip: "rest",
    /** When (ms) the clip now playing began. */
    startedAt: 0,
    /** The clip queued to follow, and when it takes over. */
    pending: null as { name: string; startsAt: number } | null,
    /** Stay at this level until then (ms), then slow down: the wheel's friction. */
    holdUntil: 0,
  },
  /** Start is held as the brake: the wheel slows without dwelling at each level. */
  braking: false,
  /** Counts ticks while waiting, to blink the frame. */
  blink: 0,
  /** Clips the controller should send to the bar, in order; filled by the game, emptied by the controller. */
  commands: [] as StripCommand[],

  // the picked item
  value: null as number | null,
  /** Ticks since the pick: drives the grow-to-fullscreen animation. */
  revealStep: 0,
  /** The item's loaded steps; empty until the record arrives. */
  parts: [] as Part[],
  /** Which step is on screen. */
  partIndex: 0,
  /** Loading the record failed: show the number instead. */
  partsFailed: false,

  /** Set by the game when something deserves a sound; the controller plays it and clears it. */
  sound: null as SoundEvent | null,
  /** Delays (ms from now) of the clicks to play within the next tick: one per card crossing the frame. */
  clicks: [] as number[],
  /** Clicks up to this time (ms) have already been handed out. */
  clickedUntil: 0,
};

export function resetWheel(): void {
  s.wheel = { level: 0, target: 0, clip: "rest", startedAt: 0, pending: null, holdUntil: 0 };
  s.braking = false;
  s.commands = [];
}

/** A fresh reading: full reshuffled pool, nothing drawn yet. */
export function resetReading(): void {
  s.pool = shuffled(s.deck.count);
  const wanted = s.spreadSetting ?? s.deck.spread;
  s.spreadTarget = s.deck.repeat ? wanted : Math.min(wanted, s.deck.count);
  s.drawn = 0;
}
