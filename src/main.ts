// The controller: wires input, the clock and deck loading to the game and the display.

import { DEFAULT_DECK, TICK_MS } from "./config.ts";
import { syncDeckOptions } from "./deck/discovery.ts";
import { loadDeck, loadItem } from "./deck/store.ts";
import { drawNow, drawSoon, hideStrip, playStrip } from "./display.ts";
import { type Effect, onBack, onEncoder, onStart, tick, toError, toIntro } from "./game.ts";
import { loadAppSettings } from "./settings.ts";
import { playClicks, playPending } from "./sound.ts";
import { resetReading, resetWheel, s } from "./state.ts";
import { errorMessage, report } from "./util.ts";

let unbindInput: BusyUnbind | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Leaving: without this the runtime never considers the script done, because
 * a live input listener and a running interval both count as work. No network
 * call here — unbind() re-checks whether the script is idle and tears it down
 * on the spot, and a fetch in flight at that moment raced the teardown and
 * surfaced as a stray "Expected a function".
 */
function exitApp(): void {
  if (intervalId !== null) clearInterval(intervalId);
  intervalId = null;
  if (unbindInput) unbindInput();
  unbindInput = null;
}

/** Carries out what the game asked for. */
function perform(effect: Effect): void {
  switch (effect) {
    case "soft":
      drawSoon();
      break;
    case "now":
      drawNow();
      break;
    case "picked":
      drawNow();
      loadPickedItem();
      break;
    case "recover":
      recoverWithDefaultDeck().catch(showError);
      break;
    case "exit":
      exitApp();
      break;
  }
  playPending();
  syncStrip();
}

/** Sends the clips the game queued, and keeps the strip on screen only while the wheel is. */
function syncStrip(): void {
  if (s.phase !== "ready" && s.phase !== "spin") {
    s.commands = [];
    hideStrip();
    return;
  }
  for (const command of s.commands) playStrip(command);
  s.commands = [];
}

function showError(err: unknown): void {
  report(err);
  perform(toError(errorMessage(err)));
}

/** Reads the picked item's record and shows it, unless the screen has moved on meanwhile. */
function loadPickedItem(): void {
  const { deck, value } = s;
  if (value === null || deck.recordSize <= 0) return;

  loadItem(deck, value)
    .then((parts) => {
      if (s.phase !== "reveal" || s.value !== value || s.deck !== deck) return;
      s.parts = parts;
      drawNow();
    })
    .catch((err: unknown) => {
      s.partsFailed = true;
      report(err);
    });
}

/** Start on the error screen: fall back to the default deck. */
async function recoverWithDefaultDeck(): Promise<void> {
  s.deck = await loadDeck(DEFAULT_DECK, s.color);
  resetWheel();
  perform(toIntro());
}

/** Reads the settings, then the chosen deck, and only then draws the start screen. */
async function init(): Promise<void> {
  const settings = await loadAppSettings();
  s.color = settings.color;
  s.spreadSetting = settings.spread;
  s.back = settings.back;
  s.soundOn = settings.sound;
  s.deck = await loadDeck(settings.deck, s.color);

  resetReading();
  s.loaded = true;
  drawNow();

  // With the start screen up, keep the settings screen's deck list in step with the files.
  syncDeckOptions().catch(report);
}

/** Entry point. The build turns this default export into a call: one function, no arguments. */
export default function run(): void {
  unbindInput = listen("input", (event) => {
    if (event.key === "encoder") perform(onEncoder(event.delta, Date.now()));
    else if (event.key === "start" && event.action === "press") perform(onStart(Date.now()));
    else if (event.key === "back" && event.action === "press") perform(onBack());
  });

  intervalId = setInterval(() => {
    perform(tick(Date.now()));
    playClicks(s.clicks);
  }, TICK_MS);

  init().catch(showError);
}
