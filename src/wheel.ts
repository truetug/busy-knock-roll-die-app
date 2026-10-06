// The wheel: a small automaton that chains pre-rendered clips (see clips.ts) into a spin. No drawing, no I/O:
// it appends the clips the bar should play to `s.commands` and keeps a model of what the bar is playing and when,
// from which it also works out when the cards click past the frame.
//
// How a spin goes: launch-k (rest → level k), then down-k to the level below, ... down to level 1, then stop-1. A turn of the
// dial raises the target level (up-k clips take it there) and keeps the wheel at its level a little longer (hold-k loops);
// Start brakes: stop-k from wherever it is.
// The bar switches clips only at the end of the one it plays (or of a loop's round), so the picture never jumps.

import { CLIPS, clickTimes, clipMs, endLevel, LEVELS } from "./clips.ts";
import { MIN_SPIN_MS, PUSH_DWELL_MS } from "./config.ts";
import { s } from "./state.ts";

/** Queues `name` for the bar; it starts at `startsAt` (ms) in our model of the bar's timeline. */
function queue(name: string, startsAt: number, awaitEnd: boolean, fresh = false): void {
  s.commands.push({ name, loop: CLIPS[name].loop, awaitEnd, fresh });
  s.wheel.pending = { name, startsAt };
}

/** The first moment, after a request sent now arrives, at which the bar can switch clips without a jump. */
function switchPoint(now: number): number {
  const w = s.wheel;
  const arrives = now + s.latency;
  const length = clipMs(w.clip);
  if (!CLIPS[w.clip].loop) return Math.max(arrives, w.startedAt + length);
  return w.startedAt + Math.max(1, Math.ceil((arrives - w.startedAt) / length)) * length;
}

const isStop = (name: string): boolean => name.startsWith("stop-");

/** What should play after the current clip, or null to carry on with it. */
function choose(now: number): string | null {
  const w = s.wheel;
  const level = w.level;
  if (isStop(w.clip) || w.clip === "rest" || level < 1) return null;

  if (s.braking) return `stop-${level}`;
  if (w.target > level && level < LEVELS) return `up-${level}`;
  // The wheel's friction: once it has been at this level for its time, the next clip slows it down a level.
  if (switchPoint(now) >= w.holdUntil) return level > 1 ? `down-${level}` : "stop-1";

  const hold = `hold-${level}`;
  return w.clip === hold ? null : hold;
}

/** Queues the next clip if there is none yet. */
function plan(now: number): void {
  if (s.wheel.pending) return;
  const next = choose(now);
  if (next === null) return;

  const startsAt = switchPoint(now);
  // A clip that has already ended is dead on the bar: start the next over a fresh element, at once. Otherwise the new
  // clip waits for the end of the current one (or of the current round of a loop), which is what makes them join.
  const ended = !CLIPS[s.wheel.clip].loop && now + s.latency >= s.wheel.startedAt + clipMs(s.wheel.clip);
  queue(next, startsAt, !ended, ended);
}

/** Drops the queued clip so a newer decision can replace it - unless the bar is about to switch to it anyway. */
function replan(now: number): void {
  const pending = s.wheel.pending;
  if (pending && pending.startsAt - now > s.latency) s.wheel.pending = null;
  plan(now);
}

function enter(name: string, at: number): void {
  const w = s.wheel;
  w.clip = name;
  w.startedAt = at;
  w.level = endLevel(name);
  w.pending = null;
  // Slowing down: what the wheel is heading for is now the level it has reached.
  if (name.startsWith("down-") || isStop(name)) w.target = w.level;
  // Having been pushed up to a level starts a short dwell there; a hold loop carries on with the one it has.
  // (never shorter than what the launch asked for: a push must not cut a long spin short)
  if (name.startsWith("up-")) w.holdUntil = Math.max(w.holdUntil, at + clipMs(name) + PUSH_DWELL_MS);
  else if (!name.startsWith("hold-")) w.holdUntil = at + clipMs(name);
}

/** Shows the wheel at rest. */
export function rest(): void {
  s.commands.push({ name: "rest", loop: true, awaitEnd: false, fresh: false });
  s.wheel.clip = "rest";
  s.wheel.level = 0;
  s.wheel.target = 0;
  s.wheel.pending = null;
}

/** The clips that slow the wheel from `level` to rest, and how long they take and how many cards they pass. */
function slowing(level: number): { ms: number; cards: number } {
  const names = level > 1 ? [`down-${level}`] : [];
  for (let k = level - 1; k >= 2; k--) names.push(`down-${k}`);
  names.push("stop-1");
  return {
    ms: names.reduce((sum, name) => sum + clipMs(name), 0),
    cards: names.reduce((sum, name) => sum + CLIPS[name].clicks.length, 0),
  };
}

/**
 * How long the wheel holds the speed it launched at, so that the whole spin lasts MIN_SPIN_MS and shows `deckSize` cards: the
 * time those need, less what the launch and the slowing down already give.
 */
function holdTime(level: number, deckSize: number): number {
  const launchName = `launch-${level}`;
  const slow = slowing(level);
  const cardMs = clipMs(`hold-${level}`); // one round of the loop is one card
  const forTime = MIN_SPIN_MS - clipMs(launchName) - slow.ms;
  const forCards = (deckSize - CLIPS[launchName].clicks.length - slow.cards) * cardMs;
  return Math.max(0, forTime, forCards);
}

/** Launches the wheel from rest straight to `level`, for a deck of `deckSize` cards. */
export function launch(level: number, now: number, deckSize: number): void {
  const at = now + s.latency;
  s.braking = false;
  s.clickedUntil = now;
  s.commands.push({ name: `launch-${level}`, loop: false, awaitEnd: false, fresh: false });
  s.wheel = {
    level,
    target: level,
    clip: `launch-${level}`,
    startedAt: at,
    pending: null,
    holdUntil: at + clipMs(`launch-${level}`) + holdTime(level, deckSize),
  };
  plan(now);
}

/**
 * A turn of the dial: raises the level the wheel is heading for, and keeps it spinning a little longer. Returns whether the wheel
 * reacted - not while it is braking or already coming to rest - which is also when the turn counts for the draw.
 */
export function push(now: number): boolean {
  const w = s.wheel;
  if (s.braking || isStop(w.clip)) return false;
  w.target = Math.min(LEVELS, Math.max(w.target, w.level) + 1);
  w.holdUntil = Math.max(w.holdUntil, now) + PUSH_DWELL_MS;
  replan(now);
  return true;
}

/**
 * The bar has taken a clip that starts at once (a launch, or one over a fresh element) at `at`: that is when it really begins, later
 * than the plan said (the request took its time). Moves the plan to it, so that the stop - and the card shown - are not early.
 */
export function began(name: string, at: number): void {
  const w = s.wheel;
  if (w.clip !== name || at <= w.startedAt) return;
  const shift = at - w.startedAt;
  w.startedAt = at;
  w.holdUntil += shift;
  if (w.pending) w.pending.startsAt += shift;
}

/** Start while spinning: the wheel stops as soon as the clip playing has ended. */
export function brake(now: number): void {
  s.braking = true;
  replan(now);
}

/** Moves the model on to `now`. Returns true once the wheel has come to rest on the stop clip. */
export function advance(now: number): boolean {
  const w = s.wheel;
  if (w.pending && now >= w.pending.startsAt) enter(w.pending.name, w.pending.startsAt);
  if (isStop(w.clip) && now >= w.startedAt + clipMs(w.clip)) return true;
  plan(now);
  return false;
}

/** Moments (ms) in [from, to) at which a card crosses into the frame, according to the model. */
export function crossings(from: number, to: number): number[] {
  const w = s.wheel;
  const spans = [{ name: w.clip, begin: w.startedAt, end: w.pending ? w.pending.startsAt : Number.POSITIVE_INFINITY }];
  if (w.pending) spans.push({ name: w.pending.name, begin: w.pending.startsAt, end: Number.POSITIVE_INFINITY });

  const times: number[] = [];
  for (const { name, begin, end } of spans) {
    const offsets = clickTimes(name);
    const length = clipMs(name);
    const rounds = CLIPS[name].loop ? Math.ceil((Math.min(end, to) - begin) / length) : 1;
    for (let round = 0; round < rounds; round++) {
      for (const offset of offsets) {
        const at = begin + round * length + offset;
        if (at >= from && at < to && at < end) times.push(at);
      }
    }
  }
  return times.sort((a, b) => a - b);
}
