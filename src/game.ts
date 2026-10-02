// The game: what each input and each tick does to the state. No drawing, no I/O.
// Every handler returns the effect the controller (main.ts) should carry out.

import { CLICK_LEAD_MS, ENCODER_LAUNCH_LEVEL, LAUNCH_LEVELS, REVEAL_STEPS, TICK_MS } from "./config.ts";
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
  | "exit";

export function toIntro(): Effect {
  resetReading();
  resetWheel();
  s.parts = [];
  s.phase = "intro";
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
function toReady(): Effect {
  s.phase = "ready";
  s.blink = 0;
  resetWheel();
  wheel.rest();
  return "now";
}

function spin(level: number, now: number): Effect {
  wheel.launch(level, now);
  s.phase = "spin";
  s.sound = "spin";
  return "now";
}

export function onEncoder(delta: number, now: number): Effect {
  if (!s.loaded) return "none";
  if (s.phase === "ready") return spin(ENCODER_LAUNCH_LEVEL, now);
  if (s.phase === "spin" && delta > 0) wheel.push(now);
  return "none";
}

export function onStart(now: number): Effect {
  if (!s.loaded) return "none";

  switch (s.phase) {
    case "error":
      return "recover";
    case "intro":
      return toReady();
    case "ready":
      return spin(LAUNCH_LEVELS[Math.floor(Math.random() * LAUNCH_LEVELS.length)], now);
    case "spin":
      wheel.brake(now);
      return "now";
    case "reveal":
      return nextAfterReveal();
  }
}

/** Start on a finished reveal: the item's next step, else the next item, else a new reading. */
function nextAfterReveal(): Effect {
  if (s.revealStep < REVEAL_STEPS) return "none";

  if (s.partIndex + 1 < s.deck.steps.length) {
    s.partIndex += 1;
    s.sound = "next";
    return "now";
  }
  if (s.drawn >= s.spreadTarget) return toIntro();

  s.parts = [];
  return toReady();
}

export function onBack(): Effect {
  if (s.phase === "intro" || s.phase === "error") return "exit";
  return toIntro();
}

/** The wheel stopped: take an item. Every card on the wheel looks alike, so which one is just chance. */
function pick(): Effect {
  const index = Math.floor(Math.random() * s.pool.length);
  s.value = s.pool[index];
  if (!s.deck.repeat) s.pool.splice(index, 1);

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

/** One step of the clock: the wheel's plan, the frame's blink, the reveal animation. */
export function tick(now: number): Effect {
  s.clicks = [];

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

  if (s.phase !== "spin" || s.pool.length === 0) return "none";

  // Clicks for the cards crossing the frame in the next tick, sent a little early to make up for the bar's start-up.
  const until = now + TICK_MS + CLICK_LEAD_MS;
  s.clicks = wheel.crossings(Math.max(s.clickedUntil, now), until).map((at) => Math.max(0, at - now - CLICK_LEAD_MS));
  s.clickedUntil = until;

  return wheel.advance(now) ? pick() : "none";
}
