// The game: what each input and each tick does to the state. No drawing, no I/O.
// Every handler returns the effect the controller (main.ts) should carry out.

import {
  AUTO_NEXT_MS,
  AUTO_RESULT_MS,
  AUTO_START_MS,
  CLICK_LEAD_MS,
  ENCODER_LAUNCH_LEVEL,
  LAUNCH_LEVELS,
  REVEAL_STEPS,
  TICK_MS,
} from "./config.ts";
import { launchFate, pull, resolve, take } from "./random/draw.ts";
import { rng, stir } from "./random/seed.ts";
import { resetReading, resetWheel, s } from "./state.ts";
import * as wheel from "./wheel.ts";

export type Effect =
  | "none"
  /** Redraw unless a frame is already in flight. */
  | "soft"
  /** Redraw for certain: the screen just changed. */
  | "now"
  /** The wheel stopped on an item: redraw, then load its record. */
  | "picked"
  /** Start on the error screen: fall back to the default deck. */
  | "recover"
  /** Auto play: a game is over and the next one is from another deck: redraw, and load the deck. */
  | "newGame"
  | "exit";

export function toIntro(now = 0): Effect {
  resetReading();
  resetWheel();
  s.parts = [];
  s.phase = "intro";
  // In auto play the intro is the "next game" screen: it counts down and the wheel spins again.
  s.autoAt = s.auto ? now + AUTO_NEXT_MS : 0;
  s.upNext = "";
  s.countdown = Math.ceil(AUTO_NEXT_MS / 1000);
  return "now";
}

export function toError(message: string): Effect {
  s.errorText = message;
  s.loaded = true;
  resetWheel();
  s.phase = "error";
  return "now";
}

/** The wheel at rest, waiting for a spin. */
export function toReady(): Effect {
  s.phase = "ready";
  s.autoAt = 0;
  s.blink = 0;
  resetWheel();
  wheel.rest();
  return "now";
}

/**
 * The wheel is launched. The two hidden numbers of the draw are taken from the generator right here, once. The card is worked
 * out from them only when the wheel stops, after the dial has had its say (a nudge, see random/draw.ts); the speed of the spin,
 * the brake and how long it all takes change nothing. See docs/RANDOMNESS.md.
 */
function spin(level: number, now: number): Effect {
  s.autoAt = 0;
  s.fate = launchFate(rng());
  s.turns = 0;
  wheel.launch(level, now, s.deck.count);
  s.phase = "spin";
  s.sound = "spin";
  return "now";
}

export function onEncoder(delta: number, now: number): Effect {
  if (!s.loaded) return "none";
  stir(now);
  if (s.phase === "ready" && !s.auto) return spin(ENCODER_LAUNCH_LEVEL, now);
  if (s.phase === "spin" && delta > 0 && wheel.push(now) && s.deck.luck !== null) {
    // The wheel reacted to this turn, so it counts: it nudges the card, and the lit frame shows it.
    s.turns += 1;
    return "now";
  }
  return "none";
}

export function onStart(now: number): Effect {
  if (!s.loaded) return "none";
  stir(now);

  switch (s.phase) {
    case "error":
      return "recover";
    case "intro":
      if (s.auto) {
        s.autoAt = now; // skip the wait: the next tick spins
        return "none";
      }
      return toReady();
    case "ready":
      return spin(randomLaunchLevel(), now);
    case "spin":
      wheel.brake(now);
      return "now";
    case "reveal":
      return nextAfterReveal(now);
  }
}

/** Only the look of the spin is chosen at random here (how fast it starts): Math.random, never the generator that draws. */
function randomLaunchLevel(): number {
  return LAUNCH_LEVELS[Math.floor(Math.random() * LAUNCH_LEVELS.length)];
}

/** Start on a finished reveal: the item's next step, else the next item, else a new reading. */
function nextAfterReveal(now: number): Effect {
  if (s.revealStep < REVEAL_STEPS) return "none";
  s.autoAt = 0;

  if (s.partIndex + 1 < s.deck.steps.length) {
    s.partIndex += 1;
    s.sound = "next";
    return "now";
  }
  if (s.drawn >= s.spreadTarget) {
    const next = toIntro(now);
    return s.auto && s.random ? "newGame" : next;
  }

  s.parts = [];
  return toReady();
}

export function onBack(): Effect {
  if (s.phase === "intro" || s.phase === "error" || s.auto) return "exit";
  return toIntro();
}

/** The wheel stopped: work out the card from the numbers drawn at the launch and the nudges since, and take it out of the pool unless the deck repeats. */
function pick(): Effect {
  const chosen = resolve(s.pool, s.deck.luck, s.fate ?? launchFate(rng()), pull(s.turns));
  s.fate = null;
  s.turns = 0;
  s.value = chosen.value;
  take(s.pool, chosen, s.deck.repeat);

  s.drawn += 1;
  resetWheel();
  s.revealStep = 0;
  s.parts = [];
  s.partIndex = 0;
  s.partsFailed = false;
  s.phase = "reveal";
  s.sound = "stop";
  return "picked";
}

/** Whether the step on screen is complete, so that the time it is shown for can start (a record is read after the pick). */
function stepShown(): boolean {
  const kind = s.deck.steps[s.partIndex]?.kind;
  if (kind !== "text" && kind !== "art") return true;
  return s.parts[s.partIndex] != null || s.partsFailed;
}

/** Auto play: what the clock does by itself - spins the wheel, moves from one screen of a result to the next, from game to game. */
function autoTick(now: number): Effect | null {
  switch (s.phase) {
    case "intro": {
      if (s.autoAt === 0) return null;
      if (now >= s.autoAt) return spin(randomLaunchLevel(), now);
      const left = Math.ceil((s.autoAt - now) / 1000);
      if (left === s.countdown) return null;
      s.countdown = left;
      return "now";
    }
    case "ready":
      if (s.autoAt === 0) s.autoAt = now + AUTO_START_MS;
      else if (now >= s.autoAt) return spin(randomLaunchLevel(), now);
      return null;
    case "reveal":
      if (s.revealStep < REVEAL_STEPS || !stepShown()) return null;
      if (s.autoAt === 0) s.autoAt = now + AUTO_RESULT_MS;
      else if (now >= s.autoAt) return nextAfterReveal(now);
      return null;
    default:
      return null;
  }
}

/** One step of the clock: the wheel's plan, the frame's blink, the reveal animation. */
export function tick(now: number): Effect {
  s.clicks = [];

  const automatic = s.auto ? autoTick(now) : null;
  if (automatic !== null) return automatic;

  if (s.phase === "ready") {
    s.blink += 1;
    return "soft";
  }

  if (s.phase === "reveal") {
    if (s.revealStep >= REVEAL_STEPS) return "none";
    s.revealStep += 1;
    if (s.revealStep === REVEAL_STEPS) s.sound = "show";
    return "now";
  }

  if (s.phase !== "spin") return "none";

  // Clicks for the cards crossing the frame in the next tick, sent a little early to make up for the bar's start-up.
  const until = now + TICK_MS + CLICK_LEAD_MS;
  s.clicks = wheel.crossings(Math.max(s.clickedUntil, now), until).map((at) => Math.max(0, at - now - CLICK_LEAD_MS));
  s.clickedUntil = until;

  const before = s.wheel.clip;
  if (wheel.advance(now)) return pick();
  // The wheel has begun to come to rest: its middle card lights up.
  return s.wheel.clip !== before && s.wheel.clip.startsWith("stop-") ? "now" : "none";
}
