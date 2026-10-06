import { beforeEach, describe, expect, it } from "vitest";
import { CLIPS, clipMs, endLevel, LEVELS } from "../src/clips.ts";
import { ENCODER_LAUNCH_LEVEL, LAUNCH_LEVELS, MIN_SPIN_MS, SEND_LATENCY_MS, TICK_MS } from "../src/config.ts";
import { onEncoder, onStart, tick } from "../src/game.ts";
import { s } from "../src/state.ts";
import * as wheel from "../src/wheel.ts";
import { freshState, parseShipped } from "./helpers.ts";

/** The level a clip starts from. */
function startLevel(name: string): number {
  const [kind, k] = name.split("-");
  return kind === "hold" || kind === "up" || kind === "down" || kind === "stop" ? Number(k) : 0;
}

type Played = { name: string; startedAt: number; queuedAt: number | null };
type Run = { clips: Played[]; ms: number; clicks: number[]; picked: boolean };

/**
 * Plays a spin through the model, tick by tick, as the controller would, taking the bar to follow the commands exactly.
 * `at(ms)` may act on the game in the middle, e.g. turn the dial. For every clip it records when the request for its
 * successor was made, since a clip that is not a loop is dead once it has ended.
 */
function spin(launch: () => void, at: (ms: number) => void = () => undefined, limit = 60_000): Run {
  s.commands = [];
  launch();
  const run: Run = { clips: [], ms: 0, clicks: [], picked: false };
  // the launch also queued its successor straight away
  run.clips.push({ name: s.wheel.clip, startedAt: s.wheel.startedAt, queuedAt: s.commands.length > 1 ? 0 : null });
  s.commands = [];
  const attribute = (now: number) => {
    // a request made now is for whatever follows the clip that is the latest one played
    const sent = s.commands.filter((c) => c.name !== "rest");
    const latest = run.clips[run.clips.length - 1];
    if (sent.length > 0 && latest.queuedAt === null) latest.queuedAt = now;
    s.commands = [];
  };

  for (let now = 0; now <= limit; now += TICK_MS) {
    at(now);
    attribute(now);

    const effect = tick(now);
    const entered = s.wheel.clip !== run.clips[run.clips.length - 1].name && effect !== "picked";
    if (entered) run.clips.push({ name: s.wheel.clip, startedAt: s.wheel.startedAt, queuedAt: null });
    attribute(now);

    if (effect === "picked") {
      run.ms = now;
      run.picked = true;
      return run;
    }
    run.clicks.push(...s.clicks.map((delay) => now + delay));
  }
  return run;
}

const ready = () => {
  freshState(parseShipped("classic"), 5);
  onStart(0);
};
const names = (run: Run) => run.clips.map((c) => c.name);
const launchAt = (level: number) => () => {
  s.phase = "spin";
  wheel.launch(level, 0, s.deck.count);
};

describe("a spin", () => {
  beforeEach(ready);

  it("launches, slows one level at a time and comes to rest on a stop clip", () => {
    const run = spin(() => onStart(0));

    expect(run.picked).toBe(true);
    expect(names(run)[0]).toMatch(/^launch-\d$/);
    expect(names(run)[names(run).length - 1]).toMatch(/^stop-\d$/);
    expect(names(run).every((name) => name in CLIPS)).toBe(true);
  });

  it("lasts at least the minimum, and shows every card of the deck at least once, whichever launch it gets", () => {
    for (const [deck, ceiling] of [
      ["classic", 24_000],
      ["loto", 27_000],
      ["coin", 17_000],
      ["d100", 28_000],
    ] as const) {
      for (const level of LAUNCH_LEVELS) {
        freshState(parseShipped(deck), 5);
        onStart(0);
        const run = spin(launchAt(level), () => undefined, 90_000);
        expect(run.picked, `${deck}, level ${level}`).toBe(true);
        expect(run.ms, `${deck}, level ${level}`).toBeGreaterThanOrEqual(MIN_SPIN_MS);
        expect(run.ms, `${deck}, level ${level}`).toBeLessThanOrEqual(ceiling);
        expect(run.clicks.length, `${deck}, level ${level}: cards that passed`).toBeGreaterThanOrEqual(s.deck.count);
      }
    }
  });

  it("only ever chains clips that join: each starts at the level the last one ended at", () => {
    const run = spin(() => onStart(0));
    for (let i = 1; i < run.clips.length; i++) {
      const [previous, next] = [run.clips[i - 1].name, run.clips[i].name];
      expect(startLevel(next), `${previous} → ${next}`).toBe(endLevel(previous));
    }
  });

  it("never leaves a clip to end without its successor already on its way (a finished clip is dead on the bar)", () => {
    const check = (run: Run) => {
      for (const clip of run.clips) {
        if (CLIPS[clip.name].loop || clip.name.startsWith("stop-")) continue;
        const endsAt = clip.startedAt + clipMs(clip.name);
        expect(clip.queuedAt, `${clip.name} was never followed up`).not.toBeNull();
        expect((clip.queuedAt ?? 0) + SEND_LATENCY_MS, `${clip.name} followed up too late`).toBeLessThan(endsAt - 100);
      }
    };

    check(spin(() => onStart(0)));
    ready();
    check(
      spin(
        () => onEncoder(1, 0),
        (now) => now % 450 === 300 && now < 3000 && onEncoder(1, now) === "none",
      ),
    );
  });

  it("holds up under any pattern of dial turns and braking", () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let trial = 0; trial < 40; trial++) {
      ready();
      const turns = new Set(Array.from({ length: 1 + Math.floor(random() * 6) }, () => Math.floor((random() * 6000) / TICK_MS) * TICK_MS));
      const brakeAt = random() < 0.4 ? Math.floor((random() * 5000) / TICK_MS) * TICK_MS : -1;
      const run = spin(
        () => onStart(0),
        (now) => {
          if (turns.has(now)) onEncoder(1, now);
          if (now === brakeAt) onStart(now);
        },
      );

      expect(run.picked, `trial ${trial}`).toBe(true);
      for (let i = 1; i < run.clips.length; i++) {
        expect(startLevel(run.clips[i].name), `trial ${trial}: ${names(run).join(" ")}`).toBe(endLevel(run.clips[i - 1].name));
      }
      for (const clip of run.clips) {
        if (CLIPS[clip.name].loop || clip.name.startsWith("stop-")) continue;
        expect(clip.queuedAt, `trial ${trial}: ${clip.name} never followed up`).not.toBeNull();
        expect((clip.queuedAt ?? 0) + SEND_LATENCY_MS, `trial ${trial}: ${clip.name} followed up too late`).toBeLessThan(
          clip.startedAt + clipMs(clip.name) - 50,
        );
      }
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
    expect(names(braked)[names(braked).length - 1]).toMatch(/^stop-\d$/);
  });

  it("is sluggish to react but gets there: turns of the dial climb through the up clips", () => {
    const run = spin(
      () => onEncoder(1, 0),
      (now) => {
        if (now === 300 || now === 450) onEncoder(1, now);
      },
    );
    expect(names(run).some((name) => name.startsWith("up-"))).toBe(true);
    expect(Math.max(...names(run).map(endLevel))).toBe(Math.min(LEVELS, ENCODER_LAUNCH_LEVEL + 2));
  });

  it("does not dip when the dial is turned soon after the launch: the turn replaces the slowing down", () => {
    const run = spin(
      () => onEncoder(1, 0),
      (now) => {
        if (now === 300) onEncoder(1, now);
      },
    );
    const order = names(run);
    expect(order.findIndex((n) => n.startsWith("up-"))).toBeGreaterThan(-1);
    expect(order.findIndex((n) => n.startsWith("down-"))).toBeGreaterThan(order.findIndex((n) => n.startsWith("up-")));
  });

  it("spins longer after a push of the dial", () => {
    const plain = spin(() => onEncoder(1, 0));

    ready();
    const pushed = spin(
      () => onEncoder(1, 0),
      (now) => {
        if (now === 300) onEncoder(1, now);
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
    expect(Math.max(...names(run).map(endLevel))).toBe(LEVELS);
  });

  it("ignores the dial while braking", () => {
    const run = spin(
      () => onStart(0),
      (now) => {
        if (now === 300) onStart(now);
        if (now === 450) onEncoder(1, now);
      },
    );
    const launched = Number(names(run)[0].split("-")[1]);
    expect(Math.max(...names(run).map(endLevel))).toBe(launched);
  });
});

describe("a clip that begins later than planned", () => {
  it("moves the whole plan with it, so that the stop is not early", () => {
    ready();
    s.phase = "spin";
    wheel.launch(5, 1000, s.deck.count);
    const { startedAt, holdUntil } = s.wheel;
    const pending = s.wheel.pending?.startsAt ?? 0;
    wheel.began("launch-5", startedAt + 300);
    expect(s.wheel.startedAt).toBe(startedAt + 300);
    expect(s.wheel.holdUntil).toBe(holdUntil + 300);
    expect(s.wheel.pending?.startsAt).toBe(pending + 300);
  });

  it("is ignored for a clip that is not the one playing, or that began earlier than planned", () => {
    ready();
    s.phase = "spin";
    wheel.launch(5, 1000, s.deck.count);
    const before = s.wheel.startedAt;
    wheel.began("hold-5", before + 500);
    wheel.began("launch-5", before - 50);
    expect(s.wheel.startedAt).toBe(before);
  });
});

describe("a clip that ended before its successor was sent", () => {
  it("is replaced over a fresh element, at once", () => {
    ready();
    s.phase = "spin";
    wheel.launch(3, 0, s.deck.count);
    s.commands = [];
    s.wheel.pending = null; // the follow-up never went out
    wheel.advance(5000);

    expect(s.commands).toHaveLength(1);
    expect(s.commands[0]).toMatchObject({ fresh: true, awaitEnd: false });
  });

  it("is otherwise queued behind the one playing", () => {
    ready();
    s.phase = "spin";
    s.commands = [];
    wheel.launch(3, 0, s.deck.count);
    expect(s.commands.map((c) => [c.name, c.awaitEnd, c.fresh])).toEqual([
      ["launch-3", false, false],
      ["hold-3", true, false],
    ]);
  });
});

describe("the wheel's clicks", () => {
  beforeEach(ready);

  it("come once per card that crosses the frame", () => {
    const run = spin(() => onStart(0));
    // A hold loop may play several rounds, so count by time: no more than one card per the fastest card time.
    const fastest = Math.min(
      ...Object.keys(CLIPS)
        .filter((n) => n.startsWith("hold-"))
        .map((n) => clipMs(n) / Math.max(1, CLIPS[n].clicks.length)),
    );
    expect(run.clicks.length).toBeGreaterThan(5);
    expect(run.clicks.length).toBeLessThanOrEqual(run.ms / fastest + 1);
    expect(Math.min(...run.clicks)).toBeGreaterThanOrEqual(0);
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
});
