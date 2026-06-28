from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
BUILD = ROOT / "build"
LOGO = ROOT.parent.parent / "logo.png"
ICON = ROOT / "app-icon.ico"
MANIFEST = ROOT / "app.manifest"


def ensure_icon() -> Path | None:
    if not LOGO.exists():
        return None
    image = Image.open(LOGO)
    image = image.convert("RGBA")
    image.save(ICON, format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    return ICON


def main() -> int:
    icon_path = ensure_icon()
    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--windowed",
        "--name",
        "YiboBattleSwitch",
        "--distpath",
        str(DIST),
        "--workpath",
        str(BUILD),
        "--specpath",
        str(ROOT),
        "--icon",
        str(icon_path) if icon_path else "",
        "--manifest",
        str(MANIFEST),
        "--add-data",
        f"{ROOT / 'index.html'};.",
        "--add-data",
        f"{ROOT.parent / 'newbeebox_account_switcher_prototype.pyw'};.",
        "--add-data",
        f"{LOGO};." if LOGO.exists() else "",
        "--add-data",
        f"{icon_path};." if icon_path and icon_path.exists() else "",
        str(ROOT / "desktop_app.py"),
    ]
    command = [item for item in command if item]
    return subprocess.call(command, cwd=str(ROOT))


if __name__ == "__main__":
    raise SystemExit(main())
