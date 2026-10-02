// Sounds: short .snd files in the app's sounds/ folder (see SOUND_FILES in config.ts) - one per event,
// plus the wheel's click. A .snd file is raw signed 16-bit little-endian mono PCM at 44100 Hz;
// replace the files to change the sounds.

import { device } from "@shared/device";
import { APP, CLICK_SOUND, type SoundEvent } from "./config.ts";
import { enqueue, pendingOf } from "./display.ts";
import { s } from "./state.ts";
import { report } from "./util.ts";

/** Path of the sound file for `name`, relative to the app's folder. */
export function soundPath(name: SoundEvent | typeof CLICK_SOUND): string {
  return `sounds/${name}.snd`;
}

/** Files the bar refused to play, so a missing one is reported once, not on every event. */
const failed = new Set<string>();

function play(name: SoundEvent | typeof CLICK_SOUND): void {
  const path = soundPath(name);
  if (failed.has(path)) return;

  enqueue(async () => {
    try {
      await device.AudioPlay({ application_name: APP, path });
    } catch (err) {
      failed.add(path);
      report(err);
    }
  });
}

/** Plays the sound the game asked for, if sound is on. */
export function playPending(): void {
  const event = s.sound;
  s.sound = null;
  if (event !== null && s.soundOn) play(event);
}

/**
 * One click for each card that crosses the frame, each after the given delay (ms), so the clicks keep the wheel's own
 * rhythm: close together while it flies, further apart as it slows, quickening again at a push of the dial. A click is
 * dropped rather than queued behind another: late clicks bunch up and no longer tell the speed.
 */
export function playClicks(delays: number[]): void {
  if (!s.soundOn) return;

  for (const delay of delays) {
    setTimeout(() => {
      if (pendingOf("sound") === 0) play(CLICK_SOUND);
    }, delay);
  }
}
