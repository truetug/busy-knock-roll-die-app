// Synthesises the app's sound effects into src/sounds/<event>.snd.
//
// A .snd file is what the bar plays: raw signed 16-bit little-endian mono PCM at 44100 Hz, no header.
// Five files: one per event - spin (the wheel starts), stop (it settles), show (the result opens), next (the next step of a
// result) - and click, played for every card that passes the frame.
// Output is deterministic, so CI can check it is up to date.
//
// To use your own sounds, replace the files in src/sounds/ (or on the bar, in the app's sounds/ folder).
// Convert any audio with ffmpeg:
//   ffmpeg -i in.wav -ac 1 -ar 44100 -f s16le -acodec pcm_s16le out.snd

import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SR = 44100;
const PEAK = 0.8;
const OUT = join(import.meta.dirname, "..", "src", "sounds");

type Rng = () => number;

/** A small seeded generator (mulberry32): the same noise on every run. */
function seeded(seed: number): Rng {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const decayEnv = (n: number, rate: number): number[] => Array.from({ length: n }, (_, i) => Math.exp((-rate * i) / SR));
const square = (phase: number): number => (Math.sin(phase) >= 0 ? 1 : -1) * 0.5;

/** Sums layers, each [samples, start in seconds]. */
function mix(...layers: [number[], number][]): number[] {
  const out = new Array<number>(Math.max(...layers.map(([s, start]) => Math.floor(start * SR) + s.length))).fill(0);
  for (const [samples, start] of layers) {
    const offset = Math.floor(start * SR);
    samples.forEach((v, i) => {
      out[offset + i] += v;
    });
  }
  return out;
}

function tone(freq: number, seconds: number, decay = 8, wave: "sine" | "square" = "sine", vibrato = 0, gain = 1): number[] {
  const n = Math.floor(SR * seconds);
  const env = decayEnv(n, decay);
  let phase = 0;
  return Array.from({ length: n }, (_, i) => {
    phase += (2 * Math.PI * freq * (1 + vibrato * Math.sin((2 * Math.PI * 6 * i) / SR))) / SR;
    return (wave === "sine" ? Math.sin(phase) : square(phase)) * env[i] * gain;
  });
}

/** Frequency glide from f0 to f1 with a fade in and out. */
function sweep(f0: number, f1: number, seconds: number, gain = 1, shape = 1): number[] {
  const n = Math.floor(SR * seconds);
  let phase = 0;
  return Array.from({ length: n }, (_, i) => {
    const t = i / n;
    phase += (2 * Math.PI * (f0 + (f1 - f0) * t ** shape)) / SR;
    return Math.sin(phase) * Math.sin(Math.PI * t) * gain;
  });
}

/** White noise with a decay; lowpass in 0..1 smooths it (higher = darker). */
function noise(seconds: number, rng: Rng, decay = 30, lowpass = 0, gain = 1): number[] {
  const n = Math.floor(SR * seconds);
  const env = decayEnv(n, decay);
  let prev = 0;
  return Array.from({ length: n }, (_, i) => {
    prev = lowpass * prev + (1 - lowpass) * (rng() * 2 - 1);
    return prev * env[i] * gain;
  });
}

/** Normalises to `level`, fades the ends and packs to s16le. */
function finish(samples: number[], level: number): Buffer {
  const peak = Math.max(...samples.map(Math.abs)) || 1;
  const fade = Math.floor(SR * 0.004);
  const out = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => {
    const g = Math.min(1, i / fade, (samples.length - i) / fade);
    out.writeInt16LE(Math.trunc(Math.max(-1, Math.min(1, (v / peak) * level * g)) * 32767), i * 2);
  });
  return out;
}

const rng = seeded(1);
const sounds: Record<string, [number[], number]> = {
  spin: [mix([sweep(220, 880, 0.55, 0.7, 1.6), 0], [sweep(330, 1320, 0.55, 0.3, 1.6), 0.02]), PEAK],
  stop: [mix([tone(110, 0.22, 14), 0], [noise(0.02, rng, 200, 0.6, 0.5), 0]), PEAK],
  show: [mix([tone(784, 0.8, 5), 0], [tone(1175, 0.8, 6, "sine", 0, 0.6), 0.04], [tone(1568, 0.8, 8, "sine", 0, 0.4), 0.08]), PEAK],
  next: [mix([tone(988, 0.14, 22), 0], [tone(1319, 0.14, 22, "sine", 0, 0.8), 0.07]), PEAK],
  // A short dry tick, like a peg on a wheel: a high blip over a puff of noise.
  click: [mix([tone(2400, 0.014, 330, "sine", 0, 0.7), 0], [noise(0.006, rng, 700, 0.2, 0.5), 0]), 0.55],
};

mkdirSync(OUT, { recursive: true });
for (const old of readdirSync(OUT).filter((f) => f.endsWith(".snd"))) unlinkSync(join(OUT, old));
for (const [name, [samples, level]] of Object.entries(sounds)) {
  const data = finish(samples, level);
  writeFileSync(join(OUT, `${name}.snd`), data);
  console.log(`${name}.snd ${data.length} bytes, ${(data.length / SR / 2).toFixed(2)}s`);
}
