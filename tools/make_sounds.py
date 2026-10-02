#!/usr/bin/env python3
"""Synthesises the app's sound effects into src/sounds/<event>.snd.

A .snd file is what the bar plays: raw signed 16-bit little-endian mono PCM at 44100 Hz, no header.
Five files: one per event - spin (the wheel starts), stop (it settles), show (the result opens), next (the next step of a
result) - and click, played for every card that passes the frame.
Output is deterministic, so CI can check it is up to date.

To use your own sounds, replace the files in src/sounds/ (or on the bar, in the app's sounds/ folder).
Convert any audio with ffmpeg:
  ffmpeg -i in.wav -ac 1 -ar 44100 -f s16le -acodec pcm_s16le out.snd
"""

import math
import random
import struct
from pathlib import Path

SR = 44100
PEAK = 0.8
OUT = Path(__file__).resolve().parent.parent / "src" / "sounds"


def silence(seconds):
    return [0.0] * int(SR * seconds)


def mix(*layers):
    """Sums layers, each (samples, start_seconds)."""
    length = max(int(start * SR) + len(samples) for samples, start in layers)
    out = [0.0] * length
    for samples, start in layers:
        offset = int(start * SR)
        for i, v in enumerate(samples):
            out[offset + i] += v
    return out


def env_decay(n, rate):
    return [math.exp(-rate * i / SR) for i in range(n)]


def tone(freq, seconds, decay=8.0, wave="sine", vibrato=0.0, gain=1.0):
    n = int(SR * seconds)
    env = env_decay(n, decay)
    out = []
    phase = 0.0
    for i in range(n):
        f = freq * (1 + vibrato * math.sin(2 * math.pi * 6 * i / SR))
        phase += 2 * math.pi * f / SR
        v = math.sin(phase) if wave == "sine" else (1.0 if math.sin(phase) >= 0 else -1.0) * 0.5
        out.append(v * env[i] * gain)
    return out


def sweep(f0, f1, seconds, wave="sine", gain=1.0, shape=1.0):
    """Frequency glide from f0 to f1 with a fade in and out."""
    n = int(SR * seconds)
    out = []
    phase = 0.0
    for i in range(n):
        t = i / n
        f = f0 + (f1 - f0) * (t**shape)
        phase += 2 * math.pi * f / SR
        v = math.sin(phase) if wave == "sine" else (1.0 if math.sin(phase) >= 0 else -1.0) * 0.5
        out.append(v * math.sin(math.pi * t) * gain)
    return out


def noise(seconds, rng, decay=30.0, lowpass=0.0, gain=1.0):
    """White noise with a decay; lowpass in 0..1 smooths it (higher = darker)."""
    n = int(SR * seconds)
    env = env_decay(n, decay)
    out = []
    prev = 0.0
    for i in range(n):
        prev = lowpass * prev + (1 - lowpass) * rng.uniform(-1, 1)
        out.append(prev * env[i] * gain)
    return out


def rattle(seconds, rng, hits, lowpass=0.5):
    """A cluster of short clacks, thinning out over time."""
    layers = []
    for k in range(hits):
        t = seconds * (k / hits) ** 0.8
        layers.append((noise(0.03, rng, decay=120, lowpass=lowpass, gain=0.9 * (1 - 0.6 * k / hits)), t))
    return mix(*layers)


def finish(samples, peak_level=PEAK):
    """Normalises to `peak_level`, fades the ends and packs to s16le."""
    peak = max(abs(v) for v in samples) or 1.0
    fade = int(SR * 0.004)
    out = bytearray()
    for i, v in enumerate(samples):
        g = min(1.0, i / fade, (len(samples) - i) / fade)
        out += struct.pack("<h", int(max(-1.0, min(1.0, v / peak * peak_level * g)) * 32767))
    return bytes(out)


def bells(rng):
    return {
        "spin": mix((sweep(220, 880, 0.55, gain=0.7, shape=1.6), 0), (sweep(330, 1320, 0.55, gain=0.3, shape=1.6), 0.02)),
        "stop": mix((tone(110, 0.22, decay=14, gain=1.0), 0), (noise(0.02, rng, decay=200, lowpass=0.6, gain=0.5), 0)),
        "show": mix(
            (tone(784, 0.8, decay=5), 0), (tone(1175, 0.8, decay=6, gain=0.6), 0.04), (tone(1568, 0.8, decay=8, gain=0.4), 0.08)
        ),
        "next": mix((tone(988, 0.14, decay=22), 0), (tone(1319, 0.14, decay=22, gain=0.8), 0.07)),
    }


def click(rng):
    """A short dry tick, like a peg on a wheel: a high blip over a puff of noise."""
    return mix((tone(2400, 0.014, decay=330, gain=0.7), 0), (noise(0.006, rng, decay=700, lowpass=0.2, gain=0.5), 0))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.snd"):
        old.unlink()
    rng = random.Random("sounds")
    sounds = {event: (samples, PEAK) for event, samples in bells(rng).items()}
    sounds["click"] = (click(rng), 0.55)
    for name, (samples, level) in sounds.items():
        data = finish(samples, level)
        (OUT / f"{name}.snd").write_bytes(data)
        print(f"{name}.snd {len(data)} bytes, {len(data) / SR / 2:.2f}s")


if __name__ == "__main__":
    main()
