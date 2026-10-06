// The controller: wires input, the clock and deck loading to the game and the display.

import { DEFAULT_DECK, GAME_SPREAD_MIN, REVEAL_STEPS, TICK_MS } from "./config.ts";
import { syncDeckOptions } from "./deck/discovery.ts";
import { deckIdFromFile } from "./deck/format.ts";
import { listResources, loadDeck, loadItem } from "./deck/store.ts";
import { drawNow, drawSoon, hideStrip, playStrip, stripShown } from "./display.ts";
import { type Effect, onBack, onEncoder, onStart, tick, toError, toIntro, toReady } from "./game.ts";
import { loadAppSettings } from "./settings.ts";
import { playClicks, playPending } from "./sound.ts";
import { resetReading, resetWheel, s } from "./state.ts";
import { errorMessage, report } from "./util.ts";
import * as wheel from "./wheel.ts";

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
  // Order matters, since the bar takes requests one at a time and is slow while the strip animation plays (a frame took almost two
  // seconds). The strip's clips go out before the frame, so that a frame in flight does not hold them up - except when the strip
  // is about to appear: then the frame goes first and replaces the old screen before the strip is drawn beside it.
  const wheelComing = (s.phase === "ready" || s.phase === "spin") && !stripShown();
  if (!wheelComing) syncStrip();
  carryOut(effect);
  if (wheelComing) syncStrip();
  playPending();
}

function carryOut(effect: Effect): void {
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
    case "newGame":
      drawNow();
      pickGameDeck().catch(showError);
      break;
    case "recover":
      recoverWithDefaultDeck().catch(showError);
      break;
    case "exit":
      exitApp();
      break;
  }
}

/** Sends the clips the game queued, and keeps the strip on screen only while the wheel is. */
function syncStrip(): void {
  if (s.phase !== "ready" && s.phase !== "spin") {
    s.commands = [];
    // The card that opens grows over the strip, which is taken away only once it is covered: clearing an animation is slow, and
    // done at once it would hold up the frames of the card that is growing.
    if (s.phase !== "reveal" || s.revealStep >= REVEAL_STEPS) hideStrip();
    return;
  }
  for (const command of s.commands) playStrip(command, command.awaitEnd ? undefined : (at) => wheel.began(command.name, at));
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

/**
 * Auto play with a deck for each game: takes one of the decks at random - not the one just played, and not one that is a whole game
 * of its own (the lotto, bingo) - and loads it. During the pause between games this is done behind the countdown.
 */
async function pickGameDeck(): Promise<void> {
  const current = s.deck.file === null ? null : deckIdFromFile(s.deck.file);
  const others = s.deckIds.filter((id) => id !== current);
  for (let tries = 0; tries < 8 && others.length > 0; tries++) {
    const id = others[Math.floor(Math.random() * others.length)];
    const deck = await loadDeck(id, s.color).catch(() => null);
    if (deck === null || deck.spread >= GAME_SPREAD_MIN) continue;
    s.deck = deck;
    s.upNext = deck.name;
    resetReading();
    drawNow();
    return;
  }
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
  s.auto = settings.play !== "off";
  s.random = settings.play === "random";
  if (s.random) {
    s.deckIds = (await listResources()).flatMap((file) => deckIdFromFile(file.name) ?? []);
    await pickGameDeck();
  }
  if (s.deck.file === null) s.deck = await loadDeck(settings.deck, s.color);

  resetReading();
  s.loaded = true;
  // Auto play has no start screen: the wheel is ready and spins by itself.
  if (s.auto) perform(toReady());
  else drawNow();

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
