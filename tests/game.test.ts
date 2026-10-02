import { beforeEach, describe, expect, it } from "vitest";
import { ENCODER_LAUNCH_LEVEL, LAUNCH_LEVELS, REVEAL_STEPS, TICK_MS } from "../src/config.ts";
import { type Effect, onBack, onEncoder, onStart, tick, toError } from "../src/game.ts";
import { s } from "../src/state.ts";
import { freshState, parseShipped } from "./helpers.ts";

/** Runs the clock until the wheel picks something; fails if it never does. */
function spinToPick(from = 0, limit = 60_000): number {
  for (let now = from; now <= from + limit; now += TICK_MS) {
    if (tick(now) === "picked") return now;
  }
  throw new Error(`no pick in ${limit} ms`);
}

function finishReveal(now: number): void {
  for (let i = 0; i < REVEAL_STEPS; i++) tick(now);
}

/** Start (to the wheel if needed), Start (launch), then spin until picked. */
function drawOne(): void {
  if (s.phase === "intro") onStart(0);
  onStart(0);
  spinToPick();
}

const tarot = () => parseShipped("classic");

describe("starting a reading", () => {
  beforeEach(() => freshState(tarot()));

  it("moves intro → ready → spin", () => {
    expect(onStart(0)).toBe("now");
    expect(s.phase).toBe("ready");
    expect(s.commands.map((c) => c.name)).toEqual(["rest"]);
    s.commands = []; // the controller sends them

    expect(onStart(0)).toBe("now");
    expect(s.phase).toBe("spin");
    expect(s.commands[0].name).toMatch(/^launch-\d$/);
    expect(LAUNCH_LEVELS).toContain(s.wheel.level);
  });

  it("ignores input until the deck is loaded", () => {
    s.loaded = false;
    expect(onStart(0)).toBe("none");
    expect(onEncoder(1, 0)).toBe("none");
    expect(s.phase).toBe("intro");
  });

  it("blinks the frame while waiting", () => {
    onStart(0);
    expect(tick(0)).toBe("soft");
    expect(s.blink).toBe(1);
  });
});

describe("the dial", () => {
  beforeEach(() => {
    freshState(tarot());
    onStart(0);
    s.commands = [];
  });

  it("launches the wheel from rest at the dial's level", () => {
    onEncoder(1, 0);
    expect(s.phase).toBe("spin");
    expect(s.wheel.level).toBe(ENCODER_LAUNCH_LEVEL);
    expect(s.commands[0].name).toBe(`launch-${ENCODER_LAUNCH_LEVEL}`);
  });

  it("raises the level being aimed for while spinning, but not for a turn the other way", () => {
    onEncoder(1, 0);
    onEncoder(-1, 100);
    expect(s.wheel.target).toBe(ENCODER_LAUNCH_LEVEL);
    onEncoder(1, 200);
    expect(s.wheel.target).toBe(ENCODER_LAUNCH_LEVEL + 1);
  });

  it("is ignored once Start is braking", () => {
    onEncoder(1, 0);
    onStart(100);
    const before = s.wheel.target;
    onEncoder(1, 200);
    expect(s.wheel.target).toBe(before);
  });
});

describe("the pick", () => {
  beforeEach(() => {
    freshState(tarot());
    onStart(0);
  });

  it("takes the card out of the pool", () => {
    const before = [...s.pool];
    onStart(0);
    spinToPick();

    expect(s.phase).toBe("reveal");
    expect(s.drawn).toBe(1);
    expect(before).toContain(s.value);
    expect(s.pool).toHaveLength(before.length - 1);
    expect(s.pool).not.toContain(s.value);
  });

  it("keeps every item for decks that repeat", () => {
    freshState(parseShipped("d20"));
    drawOne();
    expect(s.pool).toHaveLength(20);
    expect(s.value).toBeGreaterThanOrEqual(1);
    expect(s.value).toBeLessThanOrEqual(20);
  });
});

describe("a reading", () => {
  it("steps through an item, then the next, then ends on the start screen", () => {
    freshState(tarot(), 2);

    drawOne();
    expect(onStart(0)).toBe("none"); // too early: the card is still growing
    finishReveal(0);

    expect(onStart(0)).toBe("now"); // art → prediction
    expect(s.partIndex).toBe(1);
    expect(onStart(0)).toBe("now"); // prediction → next card
    expect(s.phase).toBe("ready");

    onStart(0);
    spinToPick();
    expect(s.partIndex).toBe(0);
    finishReveal(0);
    onStart(0);
    onStart(0);
    expect(s.phase).toBe("intro");
    expect(s.drawn).toBe(0);
    expect(s.pool).toHaveLength(78);
  });

  it("never repeats a card within a reading", () => {
    freshState(tarot(), 5);
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) {
      drawOne();
      seen.push(s.value ?? 0);
      finishReveal(0);
      onStart(0);
      onStart(0);
    }
    expect(new Set(seen).size).toBe(5);
  });

  it("honours the deck's own spread unless the setting overrides it", () => {
    freshState(parseShipped("ball"));
    expect(s.spreadTarget).toBe(1);
    freshState(parseShipped("ball"), 4);
    expect(s.spreadTarget).toBe(4);
  });
});

describe("sounds", () => {
  beforeEach(() => freshState(tarot(), 2));

  it("asks for each sound at its moment", () => {
    onStart(0);
    expect(s.sound).toBeNull();
    onStart(0);
    expect(s.sound).toBe("spin");

    s.sound = null;
    spinToPick();
    expect(s.sound).toBe("stop");

    s.sound = null;
    for (let i = 0; i < REVEAL_STEPS - 1; i++) tick(0);
    expect(s.sound).toBeNull();
    tick(0);
    expect(s.sound).toBe("show");

    s.sound = null;
    onStart(0); // art → prediction
    expect(s.sound).toBe("next");
  });

  it("stays quiet when nothing happens", () => {
    onStart(0);
    tick(0);
    expect(s.sound).toBeNull();
  });
});

describe("Back", () => {
  it("leaves from the start screen and from an error", () => {
    freshState(tarot());
    expect(onBack()).toBe("exit");
    toError("deck-x.txt: bad COUNT");
    expect(onBack()).toBe("exit");
  });

  it("returns to a fresh start screen from anywhere else", () => {
    freshState(tarot());
    drawOne();
    const effect: Effect = onBack();
    expect(effect).toBe("now");
    expect(s.phase).toBe("intro");
    expect(s.drawn).toBe(0);
    expect(s.pool).toHaveLength(78);
    expect(s.parts).toEqual([]);
  });
});

describe("errors", () => {
  it("shows the problem, and Start asks to fall back to the default deck", () => {
    freshState(tarot());
    expect(toError("deck-x.txt: file not found")).toBe("now");
    expect(s.phase).toBe("error");
    expect(s.errorText).toBe("deck-x.txt: file not found");
    expect(onStart(0)).toBe("recover");
  });
});
