"""Verify README rendering, local screenshots, safe links and social metadata."""

import importlib.util
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("knock_site_build", ROOT / "website/build.py")
assert SPEC and SPEC.loader
BUILD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILD)


def test_landing_uses_readme_and_local_assets(tmp_path: Path) -> None:
    """Keep the live page grounded in the README and repository screenshots.

    Rewriting documentation links must not break the local image gallery.
    """
    BUILD.build_site(ROOT, tmp_path)
    html = (tmp_path / "index.html").read_text()
    assert "<h1>Knock Roll Die</h1>" in html
    assert '<table class="screenshots">' in html
    assert 'src="docs/img/tarot.png"' in html
    assert 'href="https://github.com/truetug/busy-knock-roll-die-app/releases"' in html
    assert 'href="https://github.com/truetug/busy-knock-roll-die-app/blob/main/docs/DECKS.md"' in html
    assert 'href="https://truetug.info"' in html
    assert "©&nbsp;" in html
    assert "decks:start" not in html
    assert "BUSY Profit" not in html
    assert "usage.svg" not in html
    assert not (tmp_path / ".env").exists()
    assert (tmp_path / "docs/img/tarot.png").read_bytes() == (ROOT / "docs/img/tarot.png").read_bytes()
    assert (tmp_path / "screenshots/app-icon.png").read_bytes() == (ROOT / "src/appmeta/icon_front_8x8.png").read_bytes()


def test_social_card_and_metadata_match_the_domain(tmp_path: Path) -> None:
    """Expose a standard social preview with the actual tarot screen preserved.

    Only public repository artwork belongs in the generated share card.
    """
    BUILD.build_site(ROOT, tmp_path)
    html = (tmp_path / "index.html").read_text()
    assert 'content="https://knock.busy.truetug.info/screenshots/share-card.png"' in html
    assert 'name="twitter:card" content="summary_large_image"' in html
    with Image.open(tmp_path / "screenshots/share-card.png") as card:
        assert card.size == (1200, 630)
        screen = Image.open(ROOT / "docs/img/tarot.png").convert("RGB")
        assert card.crop((96, 284, 1104, 508)).resize(screen.size, Image.Resampling.NEAREST).tobytes() == screen.tobytes()


def test_readme_html_is_escaped(tmp_path: Path) -> None:
    """Treat README text as Markdown rather than permitting executable markup.

    Reuse real assets while substituting only the source text for this test.
    """
    import shutil

    source = tmp_path / "source"
    shutil.copytree(ROOT / "website", source / "website", ignore=shutil.ignore_patterns("dist", "__pycache__"))
    shutil.copytree(ROOT / "docs/img", source / "docs/img")
    (source / "src/appmeta").mkdir(parents=True)
    shutil.copy2(ROOT / "src/appmeta/icon_front_8x8.png", source / "src/appmeta/icon_front_8x8.png")
    (source / "README.md").write_text("# Hello\n\n<script>alert(1)</script>\n")
    BUILD.build_site(source, tmp_path / "output")
    html = (tmp_path / "output/index.html").read_text()
    assert "<script>" not in html
    assert "&lt;script&gt;" in html
