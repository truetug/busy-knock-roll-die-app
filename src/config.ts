// Tunable numbers and colours. Nothing here depends on anything else.

import manifest from "./appmeta/manifest.json";

/** The id the app draws under; the device clears elements by it. */
export const APP = manifest.id;

// ── Defaults ────────────────────────────────────────────────────────────────
/** The deck used when none is chosen, and the one the error screen falls back to. */
export const DEFAULT_DECK = "classic";
export const DEFAULT_COLOR = "#7C3AEDFF";

// ── Device limits ───────────────────────────────────────────────────────────
/** The storage API answers 400 to a path of 64 characters or more. With the app id and the file name affixes that leaves a deck id at most 7 characters (a shipped deck like "classic" fills it exactly). */
export const STORAGE_PATH_MAX = 63;

// ── Timing ──────────────────────────────────────────────────────────────────
/** The controller's clock: the wheel's plan, the frame's blink and the reveal animation advance this often. */
export const TICK_MS = 150;
/** Ticks the picked card takes to grow from its slot to the full screen. */
export const REVEAL_STEPS = 4;

// ── The wheel ───────────────────────────────────────────────────────────────
// The spin is a chain of pre-rendered clips (see tools/make_anim.py); the app only picks the next clip. Speeds are "levels"
// 1..N (src/clips.json says how many); level 0 is at rest.
/** Levels Start launches the wheel at, picked at random: the "effort" when the dial is not used. */
export const LAUNCH_LEVELS = [3, 4, 5];
/** The level the first detent from rest launches the wheel at; each further detent adds one. */
export const ENCODER_LAUNCH_LEVEL = 3;
/** How long the wheel stays at each level (index = level) before slowing to the one below - its friction. */
export const DWELL_MS = [0, 150, 250, 400, 500, 600, 700];
/** From sending a clip to the bar until it plays: a request takes ~90 ms. */
export const SEND_LATENCY_MS = 120;
/** Clicks are sent this much early: the bar needs about 100 ms to start a sound. */
export const CLICK_LEAD_MS = 80;

// ── Colours ─────────────────────────────────────────────────────────────────
export const GOLD = "#FFD24DFF";
export const WHITE = "#FFFFFFFF";
export const BLACK = "#000000FF";
export const CARD_FILL = "#2E1065FF";
export const CARD_BORDER = "#C4B5FDFF";
export const ERROR_RED = "#FF6B6BFF";

// ── Screen and layout ───────────────────────────────────────────────────────
export const SCREEN_W = 72;
export const SCREEN_H = 16;

export const WHEEL_Y = 6;
export const CENTER_W = 17;
export const CENTER_H = 13;

/** The most a card back can show: the framed card minus its 1px border. */
export const BACK_MAX_W = CENTER_W - 2;
export const BACK_MAX_H = CENTER_H - 2;

export const DOTS_Y = 14;
export const DOTS_SPACING = 7;

/** Characters per line in "small" and "tiny" type. */
export const SMALL_LINE = 13;
export const TINY_LINE = 17;

// ── Sounds ──────────────────────────────────────────────────────────────────
/** Moments with a sound: the wheel starts, it settles, the result opens, Start moves to the result's next step. */
export const SOUND_EVENTS = ["spin", "stop", "show", "next"] as const;
export type SoundEvent = (typeof SOUND_EVENTS)[number];
/** The click of a card passing the frame; its rate follows the wheel's speed. */
export const CLICK_SOUND = "click";
/** Every sound file the app expects in sounds/. */
export const SOUND_FILES: readonly string[] = [...SOUND_EVENTS, CLICK_SOUND];
