// The queue every request to the bar goes through (frames, sounds, the strip): never more than one loopback request in flight
// (the JS heap is tiny - piling them up crashed the device once). The wheel's clips are time-critical - a clip that reaches the
// bar late has already ended - so they overtake frames, and frames overtake sounds.

import { LATENCY_MARGIN, LATENCY_MAX_MS, SEND_LATENCY_MS } from "./config.ts";
import { s } from "./state.ts";
import { clamp, report } from "./util.ts";

const KINDS = ["strip", "frame", "sound"] as const;
export type Kind = (typeof KINDS)[number];
type Job = { fn: () => Promise<void>; kind: Kind; queuedAt: number };

const waiting: Record<Kind, Job[]> = { strip: [], frame: [], sound: [] };
/** Requests queued or running, by kind: a frame is skipped only if another frame is waiting, a click only if another click is. */
const pending: Record<Kind, number> = { frame: 0, sound: 0, strip: 0 };
let running = false;

/** How many requests of this kind are waiting or running. */
export function pendingOf(kind: Kind): number {
  return pending[kind];
}

function pump(): void {
  if (running) return;
  const kind = KINDS.find((k) => waiting[k].length > 0);
  if (kind === undefined) return;
  const job = waiting[kind].shift() as Job;

  running = true;
  // .then(ok, err) rather than .finally(): an intermittent "Expected a function" showed up on this engine with .finally().
  job.fn().then(
    () => finish(job),
    (err: unknown) => {
      finish(job);
      report(err);
    },
  );
}

function finish(job: Job): void {
  pending[job.kind]--;
  running = false;
  // The bar is slower than it was measured to be, and slowest while the strip animation plays: the wheel plans its clips with the
  // time one really takes to land, waiting behind other requests included.
  if (job.kind === "strip") {
    const total = Date.now() - job.queuedAt;
    s.latency = clamp(Math.round((s.latency + total * LATENCY_MARGIN) / 2), SEND_LATENCY_MS, LATENCY_MAX_MS);
  }
  pump();
}

/** Runs a request after the ones already queued (of its own kind or more urgent); nothing else may talk to the bar concurrently. */
export function enqueue(fn: () => Promise<void>, kind: Kind = "sound"): void {
  pending[kind]++;
  waiting[kind].push({ fn, kind, queuedAt: Date.now() });
  pump();
}
