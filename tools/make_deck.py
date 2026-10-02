#!/usr/bin/env python3
"""Builds src/deck-<name>.txt: a variable-length text header, a delimiter line, then fixed-size records.

Header: one KEY=value per line, ended by the line "---" (DELIM below).
  NAME    short title shown in the app's settings (the deck id is the file name: deck-<id>.txt)
  ORDER   position in the settings list (optional; unnumbered decks follow, by id)
  LABEL   small tag drawn on "number" results, e.g. D20
  COUNT   items in the deck
  REPEAT  1: a result may repeat (dice, ball); 0: drawn items leave the pool
  SPREAD  results per reading, unless the user's setting overrides it
  BG      default reveal background, RRGGBB, or "settings" (the user's colour setting)
  INTRO1/INTRO2  the two lines of the start screen
  PAL     comma-separated RRGGBB for art steps, at most 31 (xpm2 allows 32 colours incl. transparent)
  BACK    repeatable; one pixel row of the card back drawn on the wheel's framed card, up to 15x11, '.' transparent,
          otherwise the BACKPAL index as ALPHABET[i]
  BACKPAL comma-separated RRGGBB for BACK
  BACKFILL/BACKEDGE  colours of the card back's body and outline, RRGGBB
  STEP    repeatable; one screen of an item's result, shown in order, Start moves to the next:
            art                 72*16 bytes: '.' transparent, else PAL index as ALPHABET[i]
            text:N[:bg]         N bytes of upper-case text, space-padded (up to two 13-char lines)
            die                 a die face for the item number (no bytes)
            number[:bg]         the item number (no bytes)
Item n (0-based) occupies sum(step sizes) bytes at dataStart + n*record; its steps follow each other inside it.
"""

import json
from pathlib import Path

from PIL import Image

W, H = 72, 16
ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+"[:31]
DELIM = "---\n"
root = Path(__file__).resolve().parent
TEXT = 32

MAJOR = [
    "A NEW LEAP OF FAITH",
    "YOU HAVE THE TOOLS",
    "TRUST YOUR INTUITION",
    "ABUNDANCE AND CARE",
    "STRUCTURE AND CONTROL",
    "FOLLOW TRADITION",
    "A CHOICE OF THE HEART",
    "WILL WINS THE DAY",
    "GENTLE COURAGE",
    "LOOK WITHIN",
    "LUCK IS TURNING",
    "FAIR AND TRUE",
    "SEE IT DIFFERENTLY",
    "AN ENDING, A RENEWAL",
    "FIND THE BALANCE",
    "BREAK YOUR CHAINS",
    "SUDDEN CHANGE",
    "HOPE RETURNS",
    "NOT ALL IS AS IT SEEMS",
    "JOY AND SUCCESS",
    "A CALL TO RISE",
    "COMPLETION",
]
WANDS = [
    "A SPARK OF ENERGY",
    "PLAN YOUR NEXT MOVE",
    "EXPANSION AHEAD",
    "TIME TO CELEBRATE",
    "HEALTHY COMPETITION",
    "VICTORY IS NEAR",
    "HOLD YOUR GROUND",
    "THINGS MOVE FAST",
    "ALMOST THERE, PERSIST",
    "A HEAVY LOAD",
    "NEWS AND CURIOSITY",
    "ACT WITH PASSION",
    "RADIATE CONFIDENCE",
    "LEAD WITH VISION",
]
CUPS = [
    "A NEW FEELING",
    "A TRUE CONNECTION",
    "SHARE THE JOY",
    "LOOK AGAIN",
    "MOURN, THEN MOVE ON",
    "SWEET MEMORIES",
    "MANY DREAMS, CHOOSE ONE",
    "WALK AWAY",
    "A WISH COMES TRUE",
    "HAPPY HOME",
    "A GENTLE MESSAGE",
    "FOLLOW YOUR HEART",
    "LISTEN WITH CARE",
    "CALM AND WISE",
]
SWORDS = [
    "CLARITY ARRIVES",
    "A TOUGH DECISION",
    "HEARTACHE HEALS",
    "REST AND RECOVER",
    "NOT WORTH THE FIGHT",
    "CALMER WATERS",
    "BEWARE OF TRICKS",
    "YOU ARE NOT TRAPPED",
    "WORRY LOOMS LARGE",
    "THE WORST IS PAST",
    "STAY ALERT",
    "SPEAK BOLDLY",
    "HONEST AND SHARP",
    "REASON RULES",
]
PENTACLES = [
    "A SOLID START",
    "BALANCE YOUR PRIORITIES",
    "TEAMWORK PAYS",
    "DON'T HOLD TOO TIGHT",
    "HELP IS NEARBY",
    "GIVE AND RECEIVE",
    "PATIENCE PAYS",
    "MASTER YOUR CRAFT",
    "ENJOY YOUR REWARDS",
    "LASTING SECURITY",
    "A NEW OPPORTUNITY",
    "STEADY PROGRESS",
    "NURTURE AND PROVIDE",
    "WEALTH AND STABILITY",
]
PREDICTIONS = MAJOR + WANDS + CUPS + SWORDS + PENTACLES
ANSWERS = [
    "It is certain",
    "It is decidedly so",
    "Without a doubt",
    "Yes definitely",
    "You may rely on it",
    "As I see it, yes",
    "Most likely",
    "Outlook good",
    "Yes",
    "Signs point to yes",
    "Reply hazy, try again",
    "Ask again later",
    "Better not tell you now",
    "Cannot predict now",
    "Concentrate and ask again",
    "Don't count on it",
    "My reply is no",
    "My sources say no",
    "Outlook not so good",
    "Very doubtful",
]


def wrap(text, width=13):
    lines, line = [], ""
    for word in text.split(" "):
        if line and len(line) + 1 + len(word) > width:
            lines.append(line)
            line = word
        else:
            line = word if not line else f"{line} {word}"
    return lines + [line] if line else lines


def fit(text):
    assert len(text) <= TEXT and len(wrap(text)) <= 2, text
    return text.ljust(TEXT).encode()


def load(path):
    im = Image.open(path).convert("RGBA")
    assert im.size == (W, H), (path, im.size)
    px = im.load()
    return [px[x, y] for y in range(H) for x in range(W)]


def art_deck(src, count=78):
    cards = [load(src(n)) for n in range(count)]
    colors = sorted({p[:3] for c in cards for p in c if p[3] > 127})
    if len(colors) > 31:
        sample = Image.new("RGB", (len(colors), 1))
        sample.putdata(colors)
        pal = sample.quantize(colors=31, method=Image.Quantize.MEDIANCUT).getpalette()
        palette = [tuple(pal[i * 3 : i * 3 + 3]) for i in range(31)]
    else:
        palette = colors
    near = {
        c: min(range(len(palette)), key=lambda i: sum((a - b) ** 2 for a, b in zip(c, palette[i], strict=True))) for c in colors
    }
    pics = ["".join(ALPHABET[near[p[:3]]] if p[3] > 127 else "." for p in c).encode() for c in cards]
    return palette, pics


def diamond_back(width, height, ring, core):
    """Concentric diamonds: a ring (palette A) around a core (palette B)."""
    rows = []
    for y in range(height):
        row = ""
        for x in range(width):
            d = abs(x - (width - 1) / 2) / ((width - 1) / 2) + abs(y - (height - 1) / 2) / ((height - 1) / 2)
            row += "A" if 0.8 <= d <= 1.0 else "B" if d <= 0.4 else "."
        rows.append(row)
    return {"BACKPAL": f"{ring},{core}", "rows": rows}


BACK_8 = {"BACKPAL": "FFFFFF", "rows": [".AAA.", "A...A", "A...A", ".AAA.", "A...A", "A...A", ".AAA."]}


def write(name, fields, steps, body=b"", back=None):
    fields = {"NAME": TITLES[name], "ORDER": ORDERS[name], **fields}
    lines = [f"{k}={v}" for k, v in fields.items()] + [f"STEP={s}" for s in steps]
    if back:
        lines += [f"BACKPAL={back['BACKPAL']}"] + [f"BACKFILL={back['fill']}", f"BACKEDGE={back['edge']}"]
        lines += [f"BACK={row}" for row in back["rows"]]
    out = ("\n".join(lines) + "\n" + DELIM).encode() + body
    (root.parent / "src" / f"deck-{name}.txt").write_bytes(out)
    print(name, len(out), "bytes")


TITLES = {"classic": "Tarot", "neon": "Neon", "ball": "8 ball", "d6": "d6"}
ORDERS = {"classic": 1, "neon": 2, "ball": 3, "d6": 5}
DICE = (4, 8, 10, 12, 20, 100)
for _i, _n in enumerate(DICE):
    TITLES[f"d{_n}"] = f"d{_n}"
    ORDERS[f"d{_n}"] = {4: 4, 8: 6, 10: 7, 12: 8, 20: 9, 100: 10}[_n]

INTRO = {"INTRO1": "ASK ALOUD,", "INTRO2": "PRESS START"}
assert len(PREDICTIONS) == 78
for name, src, bg, back in (
    (
        "classic",
        lambda n: root / "tarot-src" / f"tarot-{n:02d}.png",
        "settings",
        {**diamond_back(11, 9, "FFD24D", "C4B5FD"), "fill": "2E1065", "edge": "FFD24D"},
    ),
    (
        "neon",
        lambda n: root / "neon-src" / f"{n:02d}.png",
        "000000",
        {**diamond_back(11, 9, "00E7F5", "FF007A"), "fill": "000000", "edge": "8B2CFF"},
    ),
):
    palette, pics = art_deck(src)
    write(
        name,
        {
            "COUNT": 78,
            "REPEAT": 0,
            "SPREAD": 3,
            "BG": bg,
            **INTRO,
            "PAL": ",".join("{:02X}{:02X}{:02X}".format(*c) for c in palette),
        },
        ["art", f"text:{TEXT}:1E1B4B"],
        b"".join(pics[n] + fit(PREDICTIONS[n]) for n in range(78)),
        back,
    )

write(
    "ball",
    {"COUNT": len(ANSWERS), "REPEAT": 1, "SPREAD": 1, "BG": "0B1B4D", **INTRO},
    [f"text:{TEXT}"],
    b"".join(fit(a.upper()) for a in ANSWERS),
    {**BACK_8, "fill": "0B1B4D", "edge": "5B7BD5"},
)
write(
    "d6",
    {"COUNT": 6, "REPEAT": 1, "SPREAD": 1, "BG": "2E1065", "INTRO1": "ROLL THE DIE", "INTRO2": "PRESS START"},
    ["die"],
)
for n in DICE:
    write(
        f"d{n}",
        {"LABEL": f"D{n}", "COUNT": n, "REPEAT": 1, "SPREAD": 1, "BG": "2E1065", "INTRO1": f"ROLL D{n}", "INTRO2": "PRESS START"},
        ["number"],
    )

# The settings screen lists whatever decks exist: keep the shipped schema in step with them.
settings_path = root.parent / "src" / "appmeta" / "settings.json"
settings = json.loads(settings_path.read_text())
decks = sorted(TITLES, key=lambda d: ORDERS[d])
settings["fields"]["deck"]["options"] = [{"value": d, "label": TITLES[d]} for d in decks]
settings_path.write_text(json.dumps(settings, indent=2) + "\n")
