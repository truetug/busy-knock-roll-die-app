import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enqueue, pendingOf } from "../src/queue.ts";
import { playClicks, playPending, soundPath } from "../src/sound.ts";
import { s } from "../src/state.ts";
import { freshState, parseShipped } from "./helpers.ts";

vi.mock("../src/queue.ts", () => ({ enqueue: vi.fn(), pendingOf: vi.fn(() => 0) }));

describe("soundPath", () => {
  it("points into the app's sounds folder, one file per event", () => {
    expect(soundPath("spin")).toBe("sounds/spin.snd");
    expect(soundPath("show")).toBe("sounds/show.snd");
    expect(soundPath("click")).toBe("sounds/click.snd");
  });
});

describe("playPending", () => {
  beforeEach(() => {
    freshState(parseShipped("classic"));
    vi.mocked(enqueue).mockClear();
  });

  it("plays the requested sound once and clears the request", () => {
    s.sound = "stop";
    playPending();
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(s.sound).toBeNull();

    playPending();
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("is silent when sound is off, but still clears the request", () => {
    s.soundOn = false;
    s.sound = "stop";
    playPending();
    expect(enqueue).not.toHaveBeenCalled();
    expect(s.sound).toBeNull();
  });
});

describe("playClicks", () => {
  beforeEach(() => {
    freshState(parseShipped("classic"));
    vi.mocked(enqueue).mockClear();
    vi.mocked(pendingOf).mockReturnValue(0);
    vi.useFakeTimers();
  });

  afterEach(() => vi.useRealTimers());

  it("sends each click after its own delay", () => {
    playClicks([20, 110]);
    expect(enqueue).not.toHaveBeenCalled();

    vi.advanceTimersByTime(30);
    expect(enqueue).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(90);
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it("is silent when sound is off", () => {
    s.soundOn = false;
    playClicks([10]);
    vi.advanceTimersByTime(200);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("drops a click while another is still waiting, instead of letting them bunch up", () => {
    vi.mocked(pendingOf).mockReturnValue(1);
    playClicks([10]);
    vi.advanceTimersByTime(200);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
