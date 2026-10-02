#!/usr/bin/env python3
"""Renders the wheel's card strip into native BUSY Bar animations: src/animations/strip-<n>.anim + src/clips.json.

Why: every frame drawn from a script is an HTTP request, about 90 ms each (11 fps for one element, 7 fps for the wheel screen).
The bar plays .anim files itself, at 60 fps. The cards on the wheel are all alike, face down, so the moving strip can be
pre-rendered; the script only chooses which clip plays next, and the spin that comes out is the clip chain's.

Clips (one card = 15 px; every clip starts and ends on a card boundary, at the speed its neighbours expect, so they join):
  rest            one still frame
  hold-k          one card at constant level-k speed - plays as a loop
  up-k / down-k   one card accelerating from level k to k+1 / slowing from k+1 to k
  launch-k        one card accelerating from rest to level k
  stop            one card slowing from level 1 to rest, then a small overshoot and settle

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
# Hold speeds in px per frame, one entry per level (level 1 is the slowest); each moves one card in a whole number of frames.
LEVEL_SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.875]
# Card colours per look: (fill, edge). The first is the default; the rest match decks that define their own card back.
VARIANTS = [("2E1065", "C4B5FD"), ("2E1065", "FFD24D"), ("000000", "8B2CFF"), ("0B1B4D", "5B7BD5")]

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


def clips():
    """name -> (offsets in px per frame, loops?)"""
    out = {"rest": ([0.0], True)}
    for k, v in enumerate(LEVEL_SPEEDS, start=1):
        out[f"hold-{k}"] = ([v * t for t in range(round(CARD / v))], True)
        out[f"launch-{k}"] = (motion(0.0, CARD, round(2 * CARD / v)), False)
    for k in range(1, len(LEVEL_SPEEDS)):
        lo, hi = LEVEL_SPEEDS[k - 1], LEVEL_SPEEDS[k]
        frames = round(2 * CARD / (lo + hi))
        out[f"up-{k}"] = (motion(lo, CARD, frames), False)
        out[f"down-{k + 1}"] = ([CARD - p for p in reversed(motion(lo, CARD, frames))], False)
    slow = LEVEL_SPEEDS[0]
    glide = [slow * t - slow * t * t / (2 * round(2 * CARD / slow)) for t in range(round(2 * CARD / slow))]
    settle = [CARD + 1.4 * math.sin(math.pi * t / 12) for t in range(12)]
    out["stop"] = (glide + settle, False)
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


def build_variant(converter, index, fill, edge, catalog):
    with tempfile.TemporaryDirectory() as tmp:
        frames_dir = Path(tmp)
        sections, count = [], 0
        for name, (offsets, _loop) in catalog.items():
            start = count
            for i, p in enumerate(offsets):
                nxt = offsets[i + 1] if i + 1 < len(offsets) else p
                render(p, max(0.0, nxt - p), fill, edge).save(frames_dir / f"{count}.png")
                count += 1
            sections.append({"name": name, "start": start, "end": count - 1})
        (frames_dir / "meta.json").write_text(json.dumps({"fps": FPS, "color_mode": "rgb888", "sections": sections}))
        target = root / "src" / "animations" / f"strip-{index}.anim"
        target.parent.mkdir(parents=True, exist_ok=True)
        info = converter.convert_dir(frames_dir, target)
        print(f"strip-{index}.anim: {count} frames, {target.stat().st_size} bytes ({info.overall_compression_ratio:.0f}x)")


def main():
    catalog = clips()
    converter = load_encoder()
    for index, (fill, edge) in enumerate(VARIANTS):
        build_variant(converter, index, fill, edge, catalog)

    # What the app needs to know: each clip's length, whether it loops, and when a card crosses the frame (the click).
    info = {}
    for name, (offsets, loop) in catalog.items():
        crossing = next((i for i, p in enumerate(offsets) if p >= CARD / 2), None)
        info[name] = {"frames": len(offsets), "loop": loop, "click": crossing}
    data = {
        "fps": FPS,
        "levels": len(LEVEL_SPEEDS),
        "variants": [{"file": f"strip-{i}.anim", "fill": f"#{f}FF", "edge": f"#{e}FF"} for i, (f, e) in enumerate(VARIANTS)],
        "clips": info,
    }
    (root / "src" / "clips.json").write_text(json.dumps(data, indent=2) + "\n")
    print("clips.json:", len(info), "clips")


if __name__ == "__main__":
    main()
