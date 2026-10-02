// The wheel: a small automaton that chains pre-rendered clips (see clips.ts) into a spin. No drawing, no I/O:
// it appends the clips the bar should play to `s.commands` and keeps a model of what the bar is playing and when,
// from which it also works out when the cards click past the frame.
//
// How a spin goes: launch-k (rest → level k), then at each level hold-k loops for its dwell time, then down-k to the level
// below, ... down to level 1, then stop. A turn of the dial raises the target level: up-k clips take it there.
// The bar switches clips only at the end of the one it plays (or of a loop's round), so the picture never jumps.

import { CLIPS, clickMs, clipMs, endLevel, LEVELS } from "./clips.ts";
import { DWELL_MS, SEND_LATENCY_MS } from "./config.ts";
import { s } from "./state.ts";

/** Queues `name` for the bar; it starts at `startsAt` (ms) in our model of the bar's timeline. */
function queue(name: string, startsAt: number, awaitEnd: boolean): void {
  s.commands.push({ name, loop: CLIPS[name].loop, awaitEnd });
  s.wheel.pending = { name, startsAt };
}

/** The first moment, after a request sent now arrives, at which the bar can switch clips without a jump. */
function switchPoint(now: number): number {
  const w = s.wheel;
  const arrives = now + SEND_LATENCY_MS;
  const length = clipMs(w.clip);
  if (!CLIPS[w.clip].loop) return Math.max(arrives, w.startedAt + length);
  return w.startedAt + Math.max(1, Math.ceil((arrives - w.startedAt) / length)) * length;
}

/** What should play after the current clip, or null to carry on with it. */
function choose(now: number): string | null {
  const w = s.wheel;
  const level = w.level;
  if (w.clip === "stop" || w.clip === "rest" || level < 1) return null;

  if (!s.braking && w.target > level && level < LEVELS) return `up-${level}`;
  if (s.braking || now >= w.holdUntil) return level > 1 ? `down-${level}` : "stop";

  const hold = `hold-${level}`;
  return w.clip === hold ? null : hold;
}

/** Queues the next clip if there is none yet. */
function plan(now: number): void {
  if (s.wheel.pending) return;
  const next = choose(now);
  if (next === null) return;

  const startsAt = switchPoint(now);
  // A clip that already ended is replaced at once; otherwise the new one waits for the end of the current round.
  const ended = !CLIPS[s.wheel.clip].loop && now + SEND_LATENCY_MS >= s.wheel.startedAt + clipMs(s.wheel.clip);
  queue(next, startsAt, !ended);
}

/** Drops the queued clip so a newer decision can replace it - unless the bar is about to switch to it anyway. */
function replan(now: number): void {
  const pending = s.wheel.pending;
  if (pending && pending.startsAt - now > SEND_LATENCY_MS) s.wheel.pending = null;
  plan(now);
}

function enter(name: string, at: number): void {
  const w = s.wheel;
  w.clip = name;
  w.startedAt = at;
  w.level = endLevel(name);
  w.pending = null;
  // Slowing down: what the wheel is heading for is now the level it has reached.
  if (name.startsWith("down-") || name === "stop") w.target = w.level;
  // Arriving at a level starts its dwell; a hold loop carries on with the one it has.
  if (!name.startsWith("hold-")) w.holdUntil = at + clipMs(name) + DWELL_MS[w.level];
}

/** Shows the wheel at rest. */
export function rest(): void {
  s.commands.push({ name: "rest", loop: true, awaitEnd: false });
  s.wheel.clip = "rest";
  s.wheel.level = 0;
  s.wheel.target = 0;
  s.wheel.pending = null;
}

/** Launches the wheel from rest straight to `level`. */
export function launch(level: number, now: number): void {
  const at = now + SEND_LATENCY_MS;
  s.braking = false;
  s.clickedUntil = now;
  s.commands.push({ name: `launch-${level}`, loop: false, awaitEnd: false });
  s.wheel = {
    level,
    target: level,
    clip: `launch-${level}`,
    startedAt: at,
    pending: null,
    holdUntil: at + clipMs(`launch-${level}`) + DWELL_MS[level],
  };
  plan(now);
}

/** A turn of the dial: raises the level the wheel is heading for, and keeps it spinning a little longer. */
export function push(now: number): void {
  if (s.braking) return;
  const w = s.wheel;
  w.target = Math.min(LEVELS, Math.max(w.target, w.level) + 1);
  w.holdUntil = Math.max(w.holdUntil, now) + 250;
  replan(now);
}

/** Start while spinning: the wheel slows down without dwelling at any level. */
export function brake(now: number): void {
  s.braking = true;
  replan(now);
}

/** Moves the model on to `now`. Returns true once the wheel has come to rest on the stop clip. */
export function advance(now: number): boolean {
  const w = s.wheel;
  if (w.pending && now >= w.pending.startsAt) enter(w.pending.name, w.pending.startsAt);
  if (w.clip === "stop" && now >= w.startedAt + clipMs("stop")) return true;
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
    const offset = clickMs(name);
    if (offset === null) continue;

    const length = clipMs(name);
    const rounds = CLIPS[name].loop ? Math.ceil((Math.min(end, to) - begin) / length) : 1;
    for (let round = 0; round < rounds; round++) {
      const at = begin + round * length + offset;
      if (at >= from && at < to && at < end) times.push(at);
    }
  }
  return times.sort((a, b) => a - b);
}
