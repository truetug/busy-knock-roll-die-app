"""Build the public landing from README, preserving the application's own assets."""

import re
import shutil
from pathlib import Path
from urllib.parse import urlsplit

from markdown_it import MarkdownIt
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "https://github.com/truetug/busy-knock-roll-die-app"


def build_share_card(source: Path, output: Path) -> None:
    """Compose the social preview using the real app icon and tarot screenshot.

    Keep pixel artwork crisp and use the same canvas and styling as BUSY Profit.
    """
    card = Image.new("RGB", (1200, 630), "#111310")
    draw = ImageDraw.Draw(card)
    icon = Image.open(source / "src/appmeta/icon_front_8x8.png").convert("RGBA")
    icon = icon.resize((64, 64), Image.Resampling.NEAREST)
    card.paste(icon, (72, 64), icon)
    draw.text((160, 66), "Knock Roll Die", font=ImageFont.load_default(size=56), fill="#f7f7ee")
    draw.text((72, 164), "Tarot, a magic 8 ball and dice for your BUSY Bar.", font=ImageFont.load_default(size=30), fill="#bfc3b7")
    draw.rounded_rectangle((72, 260, 1128, 532), radius=20, fill="#000000", outline="#353e2d", width=2)
    screen = Image.open(source / "docs/img/tarot.png").convert("RGB")
    card.paste(screen.resize((1008, 224), Image.Resampling.NEAREST), (96, 284))
    draw.text((72, 570), "knock.busy.truetug.info", font=ImageFont.load_default(size=22), fill="#e9b35c")
    card.save(output / "screenshots/share-card.png", optimize=True)


def build_site(source: Path, output: Path) -> None:
    """Render the canonical README and rewrite repository links for a standalone site.

    Keep screenshots local, disable raw HTML and never copy runtime or secret files.
    """
    markdown = re.sub(r"<!--.*?-->", "", (source / "README.md").read_text(encoding="utf-8"), flags=re.DOTALL)
    renderer = MarkdownIt("commonmark", {"html": False}).enable("table")
    tokens = renderer.parse(markdown)
    for index, token in enumerate(tokens):
        if token.type == "table_open":
            end = next(i for i in range(index + 1, len(tokens)) if tokens[i].type == "table_close")
            if any(child.type == "image" for item in tokens[index:end] for child in item.children or []):
                token.attrSet("class", "screenshots")
        for child in token.children or []:
            if child.type == "link_open":
                href = child.attrGet("href") or ""
                if href == "../../releases":
                    child.attrSet("href", f"{REPOSITORY}/releases")
                elif href and not urlsplit(href).scheme and not href.startswith(("#", "//")):
                    child.attrSet("href", f"{REPOSITORY}/blob/main/{href}")
    body = renderer.renderer.render(tokens, renderer.options, {})
    body = body.replace("<table", '<div class="table-scroll"><table').replace("</table>", "</table></div>")
    template = (source / "website/template.html").read_text(encoding="utf-8")
    marker = "<!-- README_CONTENT -->"
    if template.count(marker) != 1:
        raise ValueError("Expected one README content marker")
    output.mkdir(parents=True, exist_ok=True)
    (output / "index.html").write_text(template.replace(marker, body), encoding="utf-8")
    shutil.copy2(source / "website/style.css", output / "style.css")
    shutil.copytree(source / "docs/img", output / "docs/img", dirs_exist_ok=True)
    (output / "screenshots").mkdir(exist_ok=True)
    shutil.copy2(source / "src/appmeta/icon_front_8x8.png", output / "screenshots/app-icon.png")
    build_share_card(source, output)


if __name__ == "__main__":
    build_site(ROOT, ROOT / "website/dist")
