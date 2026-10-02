import { beforeEach, describe, expect, it } from "vitest";
import { CLIPS, clipMs, endLevel, LEVELS } from "../src/clips.ts";
import { DWELL_MS, ENCODER_LAUNCH_LEVEL, SEND_LATENCY_MS, TICK_MS } from "../src/config.ts";
import { onEncoder, onStart, tick } from "../src/game.ts";
import { s } from "../src/state.ts";
import { freshState, parseShipped } from "./helpers.ts";

/** The level a clip starts from. */
function startLevel(name: string): number {
  const [kind, k] = name.split("-");
  if (kind === "hold" || kind === "up" || kind === "down") return Number(k);
  if (kind === "stop") return 1;
  return 0;
}

type Run = { clips: string[]; ms: number; clicks: number[]; picked: boolean };

/**
 * Plays a spin through the model, tick by tick, as the controller would (the bar is taken to follow the commands exactly).
 * `at(ms)` may act on the game in the middle, e.g. turn the dial.
 */
function spin(launch: () => void, at: (ms: number) => void = () => undefined, limit = 60_000): Run {
  launch();
  const run: Run = { clips: [], ms: 0, clicks: [], picked: false };
  let last = "";
  for (let now = 0; now <= limit; now += TICK_MS) {
    at(now);
    const effect = tick(now);
    s.commands = [];
    if (effect !== "picked" && s.wheel.clip !== last) {
      run.clips.push(s.wheel.clip);
      last = s.wheel.clip;
    }
    run.clicks.push(...s.clicks.map((delay) => now + delay));
    if (effect === "picked") {
      run.ms = now;
      run.picked = true;
      return run;
    }
  }
  return run;
}

const ready = () => {
  freshState(parseShipped("classic"), 5);
  onStart(0);
};

describe("a spin", () => {
  beforeEach(ready);

  it("launches, slows one level at a time and comes to rest on the stop clip", () => {
    const run = spin(() => onStart(0));

    expect(run.picked).toBe(true);
    expect(run.clips[0]).toMatch(/^launch-\d$/);
    expect(run.clips[run.clips.length - 1]).toBe("stop");
    expect(run.clips.every((name) => name in CLIPS)).toBe(true);
  });

  it("only ever chains clips that join: each starts at the level the last one ended at", () => {
    const run = spin(() => onStart(0));
    for (let i = 1; i < run.clips.length; i++) {
      expect(startLevel(run.clips[i]), `${run.clips[i - 1]} → ${run.clips[i]}`).toBe(endLevel(run.clips[i - 1]));
    }
  });

  it("brakes sooner when Start is pressed", () => {
    const free = spin(() => onStart(0));

    ready();
    const braked = spin(
      () => onStart(0),
      (now) => {
        if (now === 600) onStart(now);
      },
    );
    expect(braked.picked).toBe(true);
    expect(braked.ms).toBeLessThan(free.ms);
  });

  it("is sluggish to react but gets there: a turn of the dial climbs through the up clips", () => {
    const run = spin(
      () => onEncoder(1, 0),
      (now) => {
        if (now === 600 || now === 900) onEncoder(1, now);
      },
    );
    expect(run.clips.some((name) => name.startsWith("up-"))).toBe(true);

    const peak = Math.max(...run.clips.map(endLevel));
    expect(peak).toBe(ENCODER_LAUNCH_LEVEL + 2);
  });

  it("spins longer after a push of the dial", () => {
    const plain = spin(() => onEncoder(1, 0));

    ready();
    const pushed = spin(
      () => onEncoder(1, 0),
      (now) => {
        if (now === 600) onEncoder(1, now);
      },
    );
    expect(pushed.ms).toBeGreaterThan(plain.ms);
  });

  it("cannot be pushed past the top level", () => {
    const run = spin(
      () => onEncoder(1, 0),
      (now) => {
        if (now % 150 === 0 && now < 3000) onEncoder(1, now);
      },
    );
    expect(Math.max(...run.clips.map(endLevel))).toBe(LEVELS);
  });

  it("ignores the dial while braking", () => {
    const run = spin(
      () => onStart(0),
      (now) => {
        if (now === 300) onStart(now);
        if (now === 450) onEncoder(1, now);
      },
    );
    const peak = Math.max(...run.clips.map(endLevel));
    const launched = Number(run.clips[0].split("-")[1]);
    expect(peak).toBe(launched);
  });
});

describe("the wheel's clicks", () => {
  beforeEach(ready);

  it("come once per card, so as many as clips played (a loop plays its clip again each round)", () => {
    const run = spin(() => onStart(0));
    expect(run.clicks.length).toBeGreaterThan(8);

    // every click falls inside the spin
    expect(Math.min(...run.clicks)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...run.clicks)).toBeLessThanOrEqual(run.ms + SEND_LATENCY_MS * 4);
  });

  it("thin out as the wheel slows down", () => {
    const run = spin(() => onEncoder(1, 0));
    const gaps = run.clicks.slice(1).map((at, i) => at - run.clicks[i]);
    const half = Math.floor(gaps.length / 2);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

    expect(mean(gaps.slice(half))).toBeGreaterThan(mean(gaps.slice(0, half)));
  });

  it("never bunch up: successive clicks are further apart than the shortest card time", () => {
    const run = spin(() => onStart(0));
    const shortest = Math.min(
      ...Object.keys(CLIPS)
        .filter((n) => n.startsWith("hold-"))
        .map(clipMs),
    );
    for (let i = 1; i < run.clicks.length; i++) {
      expect(run.clicks[i] - run.clicks[i - 1]).toBeGreaterThan(shortest * 0.6);
    }
  });

  it("start with the launch", () => {
    onStart(0);
    expect(s.commands.map((c) => c.name).find((name) => name !== "rest")).toMatch(/^launch-/);
    expect(DWELL_MS.length).toBe(LEVELS + 1);
  });
});
