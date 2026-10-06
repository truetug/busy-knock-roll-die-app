#!/usr/bin/env python3
"""Renders the wheel's card strip into native BUSY Bar animations: src/animations/strip.anim + src/clips.json.

Why: every frame drawn from a script is an HTTP request, about 90 ms each (11 fps for one element, 7 fps for the wheel screen).
The bar plays .anim files itself, at 60 fps. The cards on the wheel are all alike, so the moving strip can be
pre-rendered, in neutral colours: the framed card in the middle, with the deck's card back, is drawn over it by the app.
The script only chooses which clip plays next, and the spin that comes out is the clip chain's.

Clips (one card = 15 px; every clip starts and ends on a card boundary, at the speed its neighbours expect, so they join):
  rest            one still frame
  hold-k          one card at constant level-k speed - plays as a loop
  up-k / down-k   a card accelerating from level k to k+1 / slowing from k+1 to k, then a "tail" of whole cards at the new speed
  launch-k        a card accelerating from rest to level k, then a tail at level k
  stop-k          one card slowing from level k to rest, then a small overshoot and settle

Why the tails: on the bar a clip that is not a loop is finished for good once it has played to its end - a new clip sent
afterwards (same element id) does not play, as measured on the bar. The next clip must therefore reach the bar *before* the
current one ends, and since a request takes ~90 ms and ramps are only 150-400 ms long there would be no time. The tail
(at least TAIL_MIN_MS of constant speed) is the window in which the follow-up is sent; the bar then switches at the clip's end.
Loops (hold-k) never end, so they carry no tail.

Needs the firmware checkout's encoder (scripts/seq2anim.py and the `flipper` package next to it) and Pillow + colorlog:
  FIRMWARE_SCRIPTS=<path to bsb firmware>/scripts  python tools/make_anim.py
Output is committed: CI does not regenerate it.
"""

import importlib.util
import json
import math
import os
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

W, H = 72, 16
CARD = 15  # px between card centres
CENTER_X, CENTER_Y = 36, 6
SIDE_W, SIDE_H = 11, 9
FPS = 60
# A ramp clip ends with at least this much constant-speed motion (see above).
TAIL_MIN_MS = 1100
# Hold speeds in px per frame, one entry per level (level 1 is the slowest); each moves one card in a whole number of frames.
LEVEL_SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.875]
# The cards passing by, in colours that suit any deck: dim, so that the framed card in the middle stands out.
FILL, EDGE = "1A1530", "5B5380"

root = Path(__file__).resolve().parent.parent
scripts = Path(os.environ.get("FIRMWARE_SCRIPTS", root.parent.parent / "shared" / "busybar-firmware" / "scripts"))


def load_encoder():
    sys.path.insert(0, str(scripts))
    spec = importlib.util.spec_from_file_location("seq2anim", scripts / "seq2anim.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.BSBAnimConverter()


def motion(v0, distance, frames):
    """Offsets (px) of `frames` frames covering `distance` at constant acceleration from speed v0."""
    a = 2 * (distance - v0 * frames) / frames**2
    return [v0 * t + a * t * t / 2 for t in range(frames)]


def with_tail(ramp, end_speed):
    """Appends whole cards of motion at `end_speed` (px/frame) after a ramp that ends one card in; joins at a card boundary."""
    cards = max(1, math.ceil(TAIL_MIN_MS / 1000 * FPS * end_speed / CARD))
    frames = round(cards * CARD / end_speed)
    return ramp + [CARD + cards * CARD * t / frames for t in range(frames)]


def end_speed(offsets):
    """Speed (px/frame) at the end of a ramp, from its last frames."""
    return (offsets[-1] - offsets[-4]) / 3


def clips():
    """name -> (offsets in px per frame, loops?)"""
    out = {"rest": ([0.0], True)}
    for k, v in enumerate(LEVEL_SPEEDS, start=1):
        out[f"hold-{k}"] = ([v * t for t in range(round(CARD / v))], True)
        ramp = motion(0.0, CARD, round(2 * CARD / v))
        out[f"launch-{k}"] = (with_tail(ramp, 2 * CARD / round(2 * CARD / v)), False)
    for k in range(1, len(LEVEL_SPEEDS)):
        lo, hi = LEVEL_SPEEDS[k - 1], LEVEL_SPEEDS[k]
        frames = round(2 * CARD / (lo + hi))
        up = motion(lo, CARD, frames)
        out[f"up-{k}"] = (with_tail(up, 2 * CARD / frames - lo), False)
        down = [CARD - p for p in reversed(motion(lo, CARD, frames))]
        out[f"down-{k + 1}"] = (with_tail(down, end_speed(down)), False)
    for k, v in enumerate(LEVEL_SPEEDS, start=1):
        frames = round(2 * CARD / v)
        glide = [v * t - v * t * t / (2 * frames) for t in range(frames)]
        settle = [CARD + 1.4 * math.sin(math.pi * t / 12) for t in range(12)]
        out[f"stop-{k}"] = (glide + settle, False)
    return out


def shade(color, amount):
    return tuple(round(c * amount) for c in color)


def hex_rgb(value):
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def render(offset, speed, fill, edge):
    im = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(im)
    fill, edge = hex_rgb(fill), hex_rgb(edge)
    trail = round(speed * 1.6) if speed >= 1.2 else 0
    # Every card is alike, so only the position within one card width matters; a long clip never runs out of cards.
    offset %= CARD
    for ghost in (True, False):
        if ghost and not trail:
            continue
        for k in range(-3, 5):
            x = round(CENTER_X + k * CARD - offset) + (trail if ghost else 0)
            box = [x - SIDE_W // 2, CENTER_Y - SIDE_H // 2, x + SIDE_W // 2, CENTER_Y + SIDE_H // 2]
            if ghost:
                d.rounded_rectangle(box, radius=2, fill=shade(fill, 0.55), outline=shade(edge, 0.35))
            else:
                d.rounded_rectangle(box, radius=2, fill=fill, outline=edge)
    return im


def build_strip(converter, catalog):
    with tempfile.TemporaryDirectory() as tmp:
        frames_dir = Path(tmp)
        sections, count = [], 0
        for name, (offsets, _loop) in catalog.items():
            start = count
            for i, p in enumerate(offsets):
                nxt = offsets[i + 1] if i + 1 < len(offsets) else p
                render(p, max(0.0, nxt - p), FILL, EDGE).save(frames_dir / f"{count}.png")
                count += 1
            sections.append({"name": name, "start": start, "end": count - 1})
        (frames_dir / "meta.json").write_text(json.dumps({"fps": FPS, "color_mode": "rgb888", "sections": sections}))
        target = root / "src" / "animations" / "strip.anim"
        target.parent.mkdir(parents=True, exist_ok=True)
        info = converter.convert_dir(frames_dir, target)
        print(f"strip.anim: {count} frames, {target.stat().st_size} bytes ({info.overall_compression_ratio:.0f}x)")


def main():
    catalog = clips()
    converter = load_encoder()
    build_strip(converter, catalog)

    # What the app needs to know: each clip's length, whether it loops, and the frames at which a card crosses into the frame
    # (one click each).
    info = {}
    for name, (offsets, loop) in catalog.items():
        top = max(offsets)
        threshold, clicks = CARD / 2, []
        while threshold <= top:
            clicks.append(next(i for i, p in enumerate(offsets) if p >= threshold))
            threshold += CARD
        info[name] = {"frames": len(offsets), "loop": loop, "clicks": clicks}
    data = {
        "fps": FPS,
        "levels": len(LEVEL_SPEEDS),
        "clips": info,
    }
    (root / "src" / "clips.json").write_text(json.dumps(data, indent=2) + "\n")
    print("clips.json:", len(info), "clips")


if __name__ == "__main__":
    main()
