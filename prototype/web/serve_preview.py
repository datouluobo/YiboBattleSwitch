from __future__ import annotations

import importlib.util
import json
import os
import socket
import subprocess
import sys
import threading
import webbrowser
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
    ROOT = Path(sys._MEIPASS).resolve()
    PROJECT_ROOT = ROOT
    PROTOTYPE_PATH = ROOT / "newbeebox_account_switcher_prototype.pyw"
    LOGO_PATH = ROOT / "logo.png"
else:
    ROOT = Path(__file__).resolve().parent
    PROJECT_ROOT = ROOT.parent
    PROTOTYPE_PATH = PROJECT_ROOT / "newbeebox_account_switcher_prototype.pyw"
    LOGO_PATH = PROJECT_ROOT.parent / "logo.png"
APP_VERSION = "0.1"
LOG_LINES: list[str] = []


def load_prototype_module():
    spec = importlib.util.spec_from_file_location("yibo_battleswitch_prototype", PROTOTYPE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载原型模块: {PROTOTYPE_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


PROTOTYPE = load_prototype_module()


def append_log(message: str) -> None:
    timestamp = datetime.now().strftime("%H:%M:%S")
    LOG_LINES.append(f"[{timestamp}] {message}")
    del LOG_LINES[:-120]


def summarize_processes(processes: list[dict[str, str | int]]) -> str:
    if not processes:
        return "-"
    return ", ".join(f"{item['name']}:{item['pid']}" for item in processes)


def choose_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def get_accounts():
    return PROTOTYPE.sort_accounts_by_saved_order(PROTOTYPE.load_accounts())


def find_account(email: str):
    for account in get_accounts():
        if account.email == email:
            return account
    raise ValueError(f"未找到账号：{email}")


def launch_battlenet() -> None:
    launcher = PROTOTYPE.BATTLE_NET_LAUNCHER
    if not launcher.exists():
        raise FileNotFoundError(f"未找到战网启动器：{launcher}")
    subprocess.Popen([str(launcher)])


def normalize_install_directory(path: str) -> str:
    raw = str(path or "").strip()
    if not raw:
        return ""
    candidate = Path(raw).expanduser()
    if candidate.is_file():
        if candidate.name.lower() == "battle.net launcher.exe":
            return str(candidate.parent)
        return str(candidate.parent)

    variant_names = {root.name.lower() for root in PROTOTYPE.WOW_VARIANT_ROOTS.values()}
    if candidate.name.lower() in variant_names and candidate.parent.name.lower() == "world of warcraft":
        return str(candidate.parent)
    return str(candidate)


def normalize_backup_output_directory(path: str) -> str:
    raw = str(path or "").strip()
    if not raw:
        return ""
    candidate = Path(raw).expanduser()
    if candidate.is_file():
        return str(candidate.parent)
    return str(candidate)


def detect_default_install_directory() -> str:
    launcher_dir = PROTOTYPE.BATTLE_NET_LAUNCHER.parent
    if launcher_dir.exists():
        return str(launcher_dir)
    return normalize_install_directory(PROTOTYPE.detect_default_game_directory())


def apply_account_switch(account) -> None:
    if not account.full_snapshot:
        raise RuntimeError("该账号缺少完整快照，暂时无法直接切换。")

    backup_path = PROTOTYPE.save_snapshot(f"before-switch-{PROTOTYPE.slugify_account_name(account.email)}")
    append_log(f"切换前已备份当前状态：{backup_path.name}")

    before_pids, remaining_pids = PROTOTYPE.stop_battlenet_processes()
    if before_pids:
        append_log(f"切换前已关闭 Battle.net / Agent，命中进程：{', '.join(str(pid) for pid in before_pids)}")
    if remaining_pids:
        remaining_processes = PROTOTYPE.find_battlenet_processes()
        raise RuntimeError(
            "仍有 Battle.net 相关进程未退出。\n\n"
            f"当前残留：{summarize_processes(remaining_processes)}\n\n"
            "请先手动关闭 Battle.net 与 Agent，再重试。程序默认不要求管理员权限。"
        )

    try:
        PROTOTYPE.restore_snapshot_payload(account.full_snapshot)
        append_log(f"已恢复账号完整快照：{account.email}")
        launch_battlenet()
        append_log("已重新启动 Battle.net Launcher")
    except Exception:
        PROTOTYPE.stop_battlenet_processes()
        PROTOTYPE.restore_snapshot(backup_path)
        append_log(f"切换失败，已自动回滚到备份：{backup_path.name}")
        launch_battlenet()
        raise


def restore_latest_backup() -> str:
    PROTOTYPE.ensure_backup_dir()
    backups = sorted(PROTOTYPE.BACKUP_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not backups:
        raise RuntimeError("备份目录里还没有任何快照。")
    recommended = PROTOTYPE.pick_recommended_backup(backups[:20])
    if not recommended:
        raise RuntimeError("未能从备份目录中解析出可用快照。")
    before_pids, remaining_pids = PROTOTYPE.stop_battlenet_processes()
    if before_pids:
        append_log(f"恢复备份前已关闭 Battle.net，命中进程：{', '.join(str(pid) for pid in before_pids)}")
    if remaining_pids:
        remaining_processes = PROTOTYPE.find_battlenet_processes()
        raise RuntimeError(
            "仍有 Battle.net 相关进程未退出。\n\n"
            f"当前残留：{summarize_processes(remaining_processes)}\n\n"
            "请先手动关闭 Battle.net 与 Agent，再重试。程序默认不要求管理员权限。"
        )
    PROTOTYPE.restore_snapshot(recommended["path"])
    append_log(f"已恢复推荐备份：{recommended['path'].name}")
    launch_battlenet()
    append_log("已重新启动 Battle.net Launcher")
    return f"已恢复推荐备份：{recommended['path'].name}"


def save_current_account(account_name: str, description: str) -> dict:
    current_web_token = PROTOTYPE.read_reg_binary(PROTOTYPE.REG_BNET_WOW, "WEB_TOKEN") or b""
    if not current_web_token:
        raise RuntimeError("当前注册表中没有读取到 WoW\\WEB_TOKEN。")

    current_game_account = PROTOTYPE.read_reg_string(PROTOTYPE.REG_BNET_WOW, "GAME_ACCOUNT")
    current_config_text = PROTOTYPE.read_battlenet_config_text()
    current_config_json = PROTOTYPE.read_battlenet_config_json()
    current_login_name = PROTOTYPE.pick_primary_login_name(current_config_json, current_game_account)
    wow_game_accounts, wow_selected_account, wow_capture_source, wow_source_variant = PROTOTYPE.detect_current_wow_game_accounts()
    wow_local_account_name, wow_local_candidates, wow_accounts_by_variant = PROTOTYPE.detect_current_wow_local_account(
        current_login_name, current_game_account
    )
    current_unified_auth = PROTOTYPE.read_reg_values(PROTOTYPE.REG_BNET_UNIFIEDAUTH)
    blob_map = {
        blob_id: payload.get("value", "")
        for blob_id, payload in current_unified_auth.items()
        if payload.get("type") == PROTOTYPE.winreg.REG_BINARY and payload.get("value")
    }
    if not blob_map:
        blob_map = {"WEB_TOKEN": PROTOTYPE.base64.b64encode(current_web_token).decode("ascii")}

    target_folder = PROTOTYPE.save_account_to_library(
        account_name=account_name.strip(),
        description=description.strip(),
        saved_account_name=current_game_account,
        wow_game_accounts=wow_game_accounts,
        wow_selected_account=wow_selected_account,
        wow_capture_source=wow_capture_source,
        wow_source_variant=wow_source_variant,
        wow_local_account_name=wow_local_account_name,
        wow_local_account_candidates=wow_local_candidates,
        wow_accounts_by_variant=wow_accounts_by_variant,
        blob_map=blob_map,
        imported_from="CurrentBattleNet",
        battlenet_config_text=current_config_text,
        battlenet_config_json=current_config_json,
        battlenet_file_blobs=PROTOTYPE.read_battlenet_file_blobs(),
        full_snapshot=PROTOTYPE.build_current_snapshot_payload(),
    )
    baseline_backup = PROTOTYPE.save_snapshot(f"baseline-{PROTOTYPE.slugify_account_name(account_name.strip())}")
    append_log(f"已将当前登录态保存到账号库：{target_folder}")
    append_log(f"已创建基线备份：{baseline_backup}")
    return {
        "folder": str(target_folder),
        "backup": str(baseline_backup),
        "wowAccounts": wow_game_accounts,
    }


def build_state_payload() -> dict:
    accounts = get_accounts()
    current = PROTOTYPE.read_current_state()
    game_directory = normalize_install_directory(PROTOTYPE.get_saved_game_directory()) or detect_default_install_directory()
    selected_email = accounts[0].email if accounts else ""

    account_rows = []
    for account in accounts:
        account_rows.append(
            {
                "email": account.email,
                "maskedEmail": PROTOTYPE.mask_email(account.email),
                "description": account.description or "-",
                "lastSaved": PROTOTYPE.format_ts_ms(account.backup_time),
                "selected": account.email == selected_email,
            }
        )

    return {
        "appName": "YiboBattleSwitch",
        "version": APP_VERSION,
        "gameDirectory": game_directory,
        "accounts": account_rows,
        "currentLoginName": current.get("current_login_name") or "-",
        "currentGameAccount": current.get("game_account") or "-",
        "wowAccounts": current.get("wow_game_accounts") or [],
        "accountCount": len(account_rows),
        "importableCount": PROTOTYPE.count_external_accounts(),
        "permissionLabel": "管理员" if PROTOTYPE.is_running_as_admin() else "普通权限",
        "libraryDirectory": str(PROTOTYPE.LIBRARY_DIR),
        "dataDirectory": str(PROTOTYPE.APP_DIR),
        "logs": LOG_LINES[-40:],
    }


def json_response(handler: SimpleHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class PreviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, directory: str | None = None, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/state":
            json_response(self, 200, {"ok": True, "state": build_state_payload()})
            return
        if parsed.path == "/logo.png":
            if not LOGO_PATH.exists():
                self.send_error(404, "logo.png not found")
                return
            body = LOGO_PATH.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed.path == "/":
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/action/"):
            json_response(self, 404, {"ok": False, "message": "未知接口"})
            return

        length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(length) if length > 0 else b"{}"
        payload = json.loads(body.decode("utf-8") or "{}")
        action = parsed.path.removeprefix("/api/action/")

        try:
            message = self.handle_action(action, payload)
            json_response(self, 200, {"ok": True, "message": message, "state": build_state_payload()})
        except Exception as exc:
            append_log(f"{action} 失败：{exc}")
            json_response(self, 400, {"ok": False, "message": str(exc), "state": build_state_payload()})

    def handle_action(self, action: str, payload: dict) -> str:
        if action == "auto-detect-dir":
            game_dir = detect_default_install_directory()
            if not game_dir:
                raise RuntimeError("暂时没有自动识别到 Battle.net / WoW 安装目录。")
            PROTOTYPE.set_saved_game_directory(game_dir)
            append_log(f"已自动识别安装目录：{game_dir}")
            return f"已自动识别安装目录：{game_dir}"

        if action == "set-game-dir":
            game_dir = str(payload.get("path", "")).strip()
            if not game_dir:
                raise RuntimeError("目录路径不能为空。")
            target = Path(game_dir)
            if not target.exists():
                raise RuntimeError("目录不存在，请确认路径。")
            normalized = normalize_install_directory(str(target))
            PROTOTYPE.set_saved_game_directory(normalized)
            append_log(f"已更新安装目录：{normalized}")
            return f"已更新安装目录：{normalized}"

        if action == "open-game-dir":
            game_dir = PROTOTYPE.get_saved_game_directory() or PROTOTYPE.detect_default_game_directory()
            target = Path(game_dir)
            if not target.exists():
                raise RuntimeError("当前游戏目录不存在。")
            os.startfile(str(target))
            append_log(f"已打开目录：{target}")
            return f"已打开目录：{target}"

        if action == "save-current-account":
            account_name = str(payload.get("accountName", "")).strip()
            description = str(payload.get("description", "")).strip()
            if not account_name:
                raise RuntimeError("账号名称不能为空。")
            result = save_current_account(account_name, description)
            return f"已保存账号：{account_name}\n目录：{result['folder']}"

        if action == "backup-library":
            output_dir = str(payload.get("path", "")).strip()
            if output_dir:
                target_dir = normalize_backup_output_directory(output_dir)
            else:
                target_dir = normalize_install_directory(PROTOTYPE.get_saved_game_directory()) or detect_default_install_directory()
            if not target_dir:
                raise RuntimeError("请先设置安装目录或选择备份输出目录。")
            archive_path = PROTOTYPE.backup_account_library_to_directory(Path(target_dir))
            append_log(f"已备份账号库：{archive_path}")
            return f"账号库备份已生成：{archive_path}"

        if action == "import-library":
            library_path = str(payload.get("path", "")).strip()
            if not library_path:
                raise RuntimeError("导入路径不能为空。")
            imported, updated = PROTOTYPE.import_accounts_from_external_directory(Path(library_path))
            append_log(f"已导入外部账号库。新增 {imported}，更新 {updated}")
            return f"导入完成。新增 {imported}，更新 {updated}"

        if action == "import-newbeebox":
            imported, updated = PROTOTYPE.import_accounts_from_newbeebox()
            append_log(f"已从 NewBeeBox 导入。新增 {imported}，更新 {updated}")
            return f"已从 NewBeeBox 导入。新增 {imported}，更新 {updated}"

        if action == "update-note":
            email = str(payload.get("email", "")).strip()
            description = str(payload.get("description", "")).strip()
            account = find_account(email)
            PROTOTYPE.update_account_description(account, description)
            append_log(f"已更新备注：{email}")
            return f"已更新备注：{email}"

        if action == "delete-account":
            email = str(payload.get("email", "")).strip()
            account = find_account(email)
            PROTOTYPE.delete_account_from_library(account)
            append_log(f"已删除账号：{email}")
            return f"已删除账号：{email}"

        if action == "switch-account":
            email = str(payload.get("email", "")).strip()
            account = find_account(email)
            apply_account_switch(account)
            append_log(f"已执行切换：{email}")
            return f"已执行切换：{email}"

        if action == "restore-latest-backup":
            return restore_latest_backup()

        if action == "backup-current-state":
            snapshot_path = PROTOTYPE.save_snapshot("manual-backup")
            append_log(f"已备份当前 Battle.net 状态：{snapshot_path}")
            return f"已备份当前状态：{snapshot_path}"

        if action == "save-diagnostic-snapshot":
            label = str(payload.get("label", "")).strip() or "manual-check"
            snapshot_path = PROTOTYPE.save_diagnostic_snapshot(PROTOTYPE.slugify_account_name(label))
            append_log(f"已保存诊断快照：{snapshot_path}")
            return f"已保存诊断快照：{snapshot_path}"

        if action == "compare-latest-diagnostics":
            PROTOTYPE.ensure_diagnostic_dir()
            snapshots = sorted(PROTOTYPE.DIAGNOSTIC_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
            if len(snapshots) < 2:
                raise RuntimeError("至少需要两份诊断快照才能生成对比报告。")
            report_path = PROTOTYPE.write_snapshot_diff_report(snapshots[1], snapshots[0])
            append_log(f"已生成诊断对比报告：{report_path}")
            os.startfile(str(report_path))
            return f"已生成诊断对比报告：{report_path}"

        raise RuntimeError(f"不支持的动作：{action}")

    def log_message(self, format: str, *args):
        return


def create_server(port: int | None = None) -> tuple[ThreadingHTTPServer, str]:
    actual_port = port or choose_port()
    server = ThreadingHTTPServer(("127.0.0.1", actual_port), PreviewHandler)
    url = f"http://127.0.0.1:{actual_port}/"
    return server, url


def start_server_in_thread(server: ThreadingHTTPServer) -> threading.Thread:
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return thread


def main() -> int:
    append_log("HTML 预览服务已启动")
    server, url = create_server()
    print(f"Preview running at {url}")

    timer = threading.Timer(0.6, lambda: webbrowser.open(url))
    timer.daemon = True
    timer.start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
