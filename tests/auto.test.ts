import { beforeEach, describe, expect, it } from "vitest";
import { AUTO_NEXT_MS, AUTO_RESULT_MS, TICK_MS } from "../src/config.ts";
import { onBack, onEncoder, onStart, tick, toReady } from "../src/game.ts";
import { s } from "../src/state.ts";
import { frame } from "../src/view/screens.ts";
import { freshState, parseShipped } from "./helpers.ts";

type Moment = { at: number; phase: string; part: number; drawn: number };

/** Runs the clock for `ms`, loading a record the moment the game asks for one, and notes every change of screen. */
function run(ms: number, from = 0): Moment[] {
  const seen: Moment[] = [];
  let last = "";
  for (let now = from; now <= from + ms; now += TICK_MS) {
    tick(now);
    if (s.phase === "reveal" && s.parts.length === 0) s.parts = s.deck.steps.map(() => "loaded");
    const key = `${s.phase}/${s.partIndex}/${s.drawn}`;
    if (key !== last) seen.push({ at: now, phase: s.phase, part: s.partIndex, drawn: s.drawn });
    last = key;
  }
  return seen;
}

describe("auto play", () => {
  beforeEach(() => {
    freshState(parseShipped("classic"), 2); // two results per game, each with two screens (the picture, the words)
    s.auto = true;
    toReady();
  });

  it("starts by itself, with no start screen", () => {
    expect(s.phase).toBe("ready");
    const seen = run(2000);
    expect(seen.map((m) => m.phase)).toContain("spin");
    expect(seen.map((m) => m.phase)).not.toContain("intro");
  });

  it("shows each screen of a result for 3 seconds, then the next", () => {
    const seen = run(60_000);
    const reveals = seen.filter((m) => m.phase === "reveal");
    // the picture, then the words, then (after the second card is drawn) its picture and words
    const picture = reveals.find((m) => m.part === 0);
    const words = reveals.find((m) => m.part === 1);
    if (!picture || !words) throw new Error("a result's screens were not both shown");
    expect(words.at - picture.at).toBeGreaterThanOrEqual(AUTO_RESULT_MS);
    expect(words.at - picture.at).toBeLessThanOrEqual(AUTO_RESULT_MS + 1500); // the card growing takes a moment
  });

  it("goes on to the next card of the game, and then to the 'next game' screen", () => {
    const seen = run(120_000);
    const phases = seen.map((m) => `${m.phase}${m.drawn}`);
    expect(phases).toContain("reveal2"); // the second card of the game
    expect(phases.indexOf("intro0")).toBeGreaterThan(phases.indexOf("reveal2")); // then the game is over and a new one waits
    const intro = seen.find((m) => m.phase === "intro");
    if (!intro) throw new Error("no 'next game' screen");
    const next = seen.find((m) => m.at > intro.at && m.phase === "spin");
    if (!next) throw new Error("the next game never began");
    expect(next.at - intro.at).toBeGreaterThanOrEqual(AUTO_NEXT_MS);
    expect(next.at - intro.at).toBeLessThanOrEqual(AUTO_NEXT_MS + 500);
    expect(next.drawn).toBe(0); // a new game: nothing drawn yet
  });

  it("goes on for ever: game after game", () => {
    const seen = run(400_000);
    expect(seen.filter((m) => m.phase === "intro").length).toBeGreaterThanOrEqual(3);
  });

  it("counts the seconds down on the 'next game' screen", () => {
    let shown: string[] = [];
    for (let now = 0; now <= 120_000 && shown.length < 5; now += TICK_MS) {
      tick(now);
      if (s.phase === "reveal" && s.parts.length === 0) s.parts = s.deck.steps.map(() => "loaded");
      if (s.phase === "intro") {
        const text = frame().flatMap((e) => (e.type === "text" ? [e.text] : []));
        if (text[1] !== shown[shown.length - 1]) shown.push(text[1]);
        expect(text[0]).toBe("NEXT GAME");
      }
    }
    expect(shown).toEqual(["IN 5", "IN 4", "IN 3", "IN 2", "IN 1"]);
    shown = [];
  });

  it("runs for hours without anything growing: no list of the app's state gets longer", () => {
    let longest = { commands: 0, pool: 0, parts: 0, clicks: 0 };
    let games = 0;
    let was = s.phase;
    for (let now = 0; now <= 3 * 3600 * 1000; now += TICK_MS) {
      tick(now);
      if (s.phase === "reveal" && s.parts.length === 0) s.parts = s.deck.steps.map(() => "loaded");
      if (s.phase === "intro" && was !== "intro") games++;
      was = s.phase;
      s.commands = s.commands.slice(-100); // the controller drains these; keep the test honest about what one tick adds
      longest = {
        commands: Math.max(longest.commands, s.commands.length),
        pool: Math.max(longest.pool, s.pool.length),
        parts: Math.max(longest.parts, s.parts.length),
        clicks: Math.max(longest.clicks, s.clicks.length),
      };
      s.commands = [];
    }
    expect(games).toBeGreaterThan(100); // hours of games, so the loop did go round
    expect(longest.commands).toBeLessThanOrEqual(4);
    expect(longest.pool).toBeLessThanOrEqual(s.deck.count);
    expect(longest.parts).toBeLessThanOrEqual(s.deck.steps.length);
    expect(longest.clicks).toBeLessThanOrEqual(8);
  });

  it("lets Start skip a wait and Back quit", () => {
    run(60_000);
    // wherever the game is, Back leaves
    expect(onBack()).toBe("exit");

    freshState(parseShipped("classic"), 2);
    s.auto = true;
    toReady();
    let now = 0;
    for (; now < 120_000 && s.phase !== "intro"; now += TICK_MS) {
      tick(now);
      if (s.phase === "reveal" && s.parts.length === 0) s.parts = s.deck.steps.map(() => "loaded");
    }
    expect(s.phase).toBe("intro");
    onStart(now); // skips the countdown
    tick(now + TICK_MS);
    expect(s.phase).toBe("spin");
  });

  it("ignores the dial while the wheel rests, but a turn while it spins still nudges the draw", () => {
    expect(onEncoder(1, 0)).toBe("none");
    expect(s.phase).toBe("ready");
    run(2000);
    expect(s.phase).toBe("spin");
    expect(onEncoder(1, 2100)).toBe("now");
    expect(s.turns).toBe(1);
  });
});

describe("auto play with a deck for each game", () => {
  /** Effects the clock gives over `ms`, loading a record the moment it is asked for. */
  function effects(ms: number): string[] {
    const seen: string[] = [];
    for (let now = 0; now <= ms; now += TICK_MS) {
      seen.push(tick(now));
      if (s.phase === "reveal" && s.parts.length === 0) s.parts = s.deck.steps.map(() => "loaded");
    }
    return seen;
  }

  it("asks for a new deck when a game is over, and only then", () => {
    freshState(parseShipped("classic"), 2);
    s.auto = true;
    s.random = true;
    toReady();
    const seen = effects(300_000);
    expect(seen.filter((e) => e === "newGame").length).toBeGreaterThanOrEqual(2);

    freshState(parseShipped("classic"), 2);
    s.auto = true;
    toReady();
    expect(effects(300_000)).not.toContain("newGame");
  });

  it("names the deck that comes next on the countdown", () => {
    freshState(parseShipped("neon"), 2);
    s.auto = true;
    s.random = true;
    s.phase = "intro";
    s.countdown = 4;
    s.upNext = "Neon";
    const lines = frame().flatMap((e) => (e.type === "text" ? [e.text] : []));
    expect(lines).toEqual(["Neon", "IN 4"]);
  });
});

describe("manual play is unchanged", () => {
  it("waits on the start screen for Start", () => {
    freshState(parseShipped("classic"), 2);
    expect(s.auto).toBe(false);
    const seen = run(10_000);
    expect(seen.map((m) => m.phase)).not.toContain("spin");
    expect(s.phase).toBe("intro");
  });
});
