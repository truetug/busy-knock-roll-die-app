// The settings described by appmeta/settings.json, read once at startup.

import manifest from "./appmeta/manifest.json";
import { DEFAULT_COLOR, DEFAULT_DECK } from "./config.ts";
import { device } from "./device.ts";
import { BACK_CHOICES, type BackChoice } from "./view/backs.ts";

/** Must match "version" in appmeta/settings.json. */
const VERSION = 1;

type AppSettings = {
  /** Deck id: the file resources/deck-<id>.txt. The list of valid ids is kept in step with the files by deck discovery. */
  deck: string;
  /** Results per reading; null: whatever the deck's header says. */
  spread: number | null;
  /** Card back: "auto" lets the deck choose. */
  back: BackChoice;
  sound: boolean;
  /** Auto play (see game.ts): off, the chosen deck again and again, or a deck of its own for each game. */
  play: PlayMode;
  /** Always "#RRGGBBAA": the device stores it as "#RRGGBB" when opaque, but every draw call here needs the alpha. */
  color: string;
};

const DEFAULTS: AppSettings = { deck: DEFAULT_DECK, spread: null, back: "auto", sound: true, play: "off", color: DEFAULT_COLOR };

type PlayMode = "off" | "one" | "random";
const PLAY_MODES: readonly PlayMode[] = ["off", "one", "random"];

function readPlay(values: Record<string, unknown>): PlayMode {
  return PLAY_MODES.find((mode) => mode === values.play) ?? "off";
}

function readBack(values: Record<string, unknown>): BackChoice {
  return BACK_CHOICES.find((choice) => choice === values.back) ?? "auto";
}

function readSpread(values: Record<string, unknown>): number | null {
  const raw = Number(values.spread);
  return Number.isInteger(raw) && raw >= 1 && raw <= 5 ? raw : null;
}

/** The device stores an opaque color without its alpha byte; every RectangleElement here requires one. */
function normalizeColor(hex: string): string | null {
  if (/^#[0-9a-fA-F]{8}$/.test(hex)) return hex;
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return `${hex}FF`;
  return null;
}

function readColor(values: Record<string, unknown>): string {
  const raw = values.color;
  const normalized = typeof raw === "string" ? normalizeColor(raw) : null;
  return normalized ?? DEFAULT_COLOR;
}

/**
 * Reads the settings document over the device's own loopback HTTP API
 * (`globalThis.Settings`, which this app's shared/settings.ts wraps, does not
 * exist in this firmware). A failure or version mismatch falls back to the
 * defaults, so the app still draws.
 */
export async function loadAppSettings(): Promise<AppSettings> {
  try {
    const { version, values } = await device.AppsSettingsGet({ app_id: manifest.id });

    if (version !== VERSION) {
      console.warn(`${manifest.id}: settings version ${version} != ${VERSION}, using defaults`);
      return DEFAULTS;
    }

    const deck = values.deck;
    return {
      deck: typeof deck === "string" && deck !== "" ? deck : DEFAULT_DECK,
      spread: readSpread(values),
      back: readBack(values),
      sound: values.sound !== false,
      play: readPlay(values),
      color: readColor(values),
    };
  } catch (err) {
    console.error(`${manifest.id}: settings unavailable (${err instanceof Error ? err.message : String(err)}), using defaults`);
    return DEFAULTS;
  }
}
