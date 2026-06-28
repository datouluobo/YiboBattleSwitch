from __future__ import annotations

import sys
from pathlib import Path
from threading import Timer

import webview
from PIL import Image

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from serve_preview import PROTOTYPE, append_log, create_server, start_server_in_thread


WINDOW_TITLE = "YiboBattleSwitch 独立账号切换器"
LOGO_PATH = ROOT.parent.parent / "logo.png"
ICON_PATH = ROOT / "app-icon.ico"
DEFAULT_WINDOW_SIZE = {"width": 1480, "height": 1080}
DEFAULT_WINDOW_POSITION = {"x": None, "y": None}


def ensure_icon_file() -> str | None:
    if not LOGO_PATH.exists():
        return None
    try:
        image = Image.open(LOGO_PATH)
        image = image.convert("RGBA")
        image.save(ICON_PATH, format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
        return str(ICON_PATH)
    except Exception:
        return None


class DesktopBridge:
    def __init__(self):
        self.window: webview.Window | None = None

    def attach_window(self, window: webview.Window) -> None:
        self.window = window

    def choose_directory(self, directory: str = "") -> str:
        if self.window is None:
            return ""
        try:
            dialog_type = getattr(getattr(webview, "FileDialog", None), "FOLDER", None)
            if dialog_type is None:
                dialog_type = getattr(webview, "FOLDER_DIALOG", None)
            if dialog_type is None:
                dialog_type = getattr(webview, "OPEN_DIALOG", 10)
            result = self.window.create_file_dialog(
                dialog_type,
                directory=directory or "",
                allow_multiple=False,
            )
        except Exception as exc:
            append_log(f"打开目录选择器失败：{exc}")
            return ""
        if not result:
            return ""
        return str(result[0])


def load_window_state() -> dict:
    state = PROTOTYPE.load_ui_state()
    window_state = state.get("desktopWindow")
    if not isinstance(window_state, dict):
        return {}
    return window_state


def save_window_state(window: webview.Window) -> None:
    try:
        state = PROTOTYPE.load_ui_state()
        state["desktopWindow"] = {
            "width": int(window.width or DEFAULT_WINDOW_SIZE["width"]),
            "height": int(window.height or DEFAULT_WINDOW_SIZE["height"]),
            "x": int(window.x) if window.x is not None else None,
            "y": int(window.y) if window.y is not None else None,
        }
        PROTOTYPE.save_ui_state(state)
    except Exception as exc:
        append_log(f"保存窗口状态失败：{exc}")


def main() -> int:
    append_log("桌面应用启动")
    server, url = create_server()
    start_server_in_thread(server)
    icon_path = ensure_icon_file()
    bridge = DesktopBridge()
    saved_window = load_window_state()

    width = int(saved_window.get("width") or DEFAULT_WINDOW_SIZE["width"])
    height = int(saved_window.get("height") or DEFAULT_WINDOW_SIZE["height"])
    pos_x = saved_window.get("x", DEFAULT_WINDOW_POSITION["x"])
    pos_y = saved_window.get("y", DEFAULT_WINDOW_POSITION["y"])

    window = webview.create_window(
        WINDOW_TITLE,
        url=url,
        js_api=bridge,
        width=width,
        height=height,
        x=pos_x,
        y=pos_y,
        min_size=(1180, 860),
        text_select=True,
        confirm_close=False,
        background_color="#F7F9FB",
    )
    bridge.attach_window(window)
    save_timer: Timer | None = None

    def schedule_save(*_args):
        nonlocal save_timer
        if save_timer is not None:
            save_timer.cancel()
        save_timer = Timer(0.35, lambda: save_window_state(window))
        save_timer.daemon = True
        save_timer.start()

    def on_closed(*_args):
        if save_timer is not None:
            save_timer.cancel()
        save_window_state(window)
        append_log("桌面窗口已关闭")
        server.shutdown()
        server.server_close()

    window.events.moved += schedule_save
    window.events.resized += schedule_save
    window.events.closed += on_closed
    webview.start(gui="edgechromium", debug=False, icon=icon_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
