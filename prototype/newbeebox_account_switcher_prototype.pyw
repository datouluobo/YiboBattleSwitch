import base64
import ctypes
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import zipfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import winreg

try:
    import tkinter as tk
    from tkinter import filedialog, messagebox, simpledialog, ttk
except ModuleNotFoundError:
    tk = None
    filedialog = None
    messagebox = None
    simpledialog = None
    ttk = None


BATTLE_CACHE_ROOT = Path(os.environ["APPDATA"]) / "NewBeeBox" / "battleCache"
BATTLE_NET_ROOT = Path(os.environ["APPDATA"]) / "Battle.net"
BATTLE_NET_CONFIG_PATH = BATTLE_NET_ROOT / "Battle.net.config"
BATTLE_NET_LOCAL_ROOT = Path(os.environ["LOCALAPPDATA"]) / "Battle.net"
BATTLE_NET_LOG_DIR = BATTLE_NET_LOCAL_ROOT / "Logs"
BATTLE_NET_LAUNCHER = Path(r"C:\Program Files (x86)\Battle.net\Battle.net Launcher.exe")
WOW_INSTALL_BASE = Path(r"C:\Program Files (x86)\World of Warcraft")
WOW_VARIANT_ROOTS = {
    "wow": WOW_INSTALL_BASE / "_retail_",
    "wow_classic": WOW_INSTALL_BASE / "_classic_",
    "wow_classic_era": WOW_INSTALL_BASE / "_classic_era_",
    "wow_classic_titan": WOW_INSTALL_BASE / "_classic_titan_",
}
if getattr(sys, "frozen", False):
    APP_DIR = Path(sys.executable).resolve().parent
else:
    APP_DIR = Path(__file__).resolve().parent
BACKUP_DIR = APP_DIR / "battle_net_state_backups"
DIAGNOSTIC_DIR = APP_DIR / "diagnostic_snapshots"
LIBRARY_DIR = APP_DIR / "battle_switch_library"
LIBRARY_ACCOUNTS_DIR = LIBRARY_DIR / "accounts"
UI_STATE_PATH = LIBRARY_DIR / "ui_state.json"
APP_VERSION = "0.1"

REG_BNET_ROOT = r"Software\Blizzard Entertainment\Battle.net"
REG_BNET_WOW = REG_BNET_ROOT + r"\Launch Options\WoW"
REG_BNET_WTCG = REG_BNET_ROOT + r"\Launch Options\WTCG"
REG_BNET_ENCRYPTION = REG_BNET_ROOT + r"\EncryptionKey"
REG_BNET_UNIFIEDAUTH = REG_BNET_ROOT + r"\UnifiedAuth"

CANDIDATE_BINARY_TARGETS = {
    r"UnifiedAuth\按 Blob 名写入": ("UNIFIEDAUTH", ""),
    r"WoW\WEB_TOKEN": (REG_BNET_WOW, "WEB_TOKEN"),
    r"WTCG\WEB_TOKEN": (REG_BNET_WTCG, "WEB_TOKEN"),
    r"EncryptionKey\CacheDatabase": (REG_BNET_ENCRYPTION, "CacheDatabase"),
}

LOCAL_BATTLE_NET_ROOT_FILES = {
    "CachedData.db",
    "LocalPrefs.json",
}
LOCAL_BATTLE_NET_MANAGED_DIRS = {
    "Account",
}


def mask_email(email: str) -> str:
    if "@" not in email:
        return email
    name, domain = email.split("@", 1)
    if len(name) <= 3:
        masked_name = name[0] + "*" * max(1, len(name) - 1)
    else:
        masked_name = name[:3] + "*" * max(4, len(name) - 3)
    if "." in domain:
        domain_name, suffix = domain.rsplit(".", 1)
        masked_domain = domain_name[:2] + "*" * max(4, len(domain_name) - 2)
        return f"{masked_name}@{masked_domain}.{suffix}"
    return f"{masked_name}@{domain[:2]}****"


def format_ts_ms(value) -> str:
    if not value:
        return "-"
    try:
        return datetime.fromtimestamp(int(value) / 1000).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return str(value)


def format_ts_s(value) -> str:
    if not value:
        return "-"
    try:
        return datetime.fromtimestamp(int(value)).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return str(value)


def ensure_backup_dir() -> None:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)


def ensure_diagnostic_dir() -> None:
    DIAGNOSTIC_DIR.mkdir(parents=True, exist_ok=True)


def ensure_library_dir() -> None:
    LIBRARY_ACCOUNTS_DIR.mkdir(parents=True, exist_ok=True)


def is_running_as_admin() -> bool:
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def relaunch_current_script_as_admin() -> bool:
    try:
        script_path = str(Path(__file__).resolve())
        result = ctypes.windll.shell32.ShellExecuteW(
            None,
            "runas",
            sys.executable,
            f'"{script_path}"',
            None,
            1,
        )
        return result > 32
    except Exception:
        return False


def read_reg_values(path: str) -> dict:
    values = {}
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, path) as key:
        index = 0
        while True:
            try:
                name, value, reg_type = winreg.EnumValue(key, index)
                values[name] = {
                    "type": reg_type,
                    "value": base64.b64encode(value).decode("ascii") if reg_type == winreg.REG_BINARY else value,
                }
                index += 1
            except OSError:
                break
    return values


def read_reg_tree(path: str) -> dict:
    tree = {"values": {}, "subkeys": {}}
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, path) as key:
            index = 0
            while True:
                try:
                    name, value, reg_type = winreg.EnumValue(key, index)
                    tree["values"][name] = {
                        "type": reg_type,
                        "value": base64.b64encode(value).decode("ascii") if reg_type == winreg.REG_BINARY else value,
                    }
                    index += 1
                except OSError:
                    break
            sub_index = 0
            while True:
                try:
                    subkey_name = winreg.EnumKey(key, sub_index)
                    child_path = f"{path}\\{subkey_name}"
                    tree["subkeys"][subkey_name] = read_reg_tree(child_path)
                    sub_index += 1
                except OSError:
                    break
    except FileNotFoundError:
        pass
    return tree


def write_reg_values(path: str, values: dict) -> None:
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, path) as key:
        for name, payload in values.items():
            reg_type = payload["type"]
            value = base64.b64decode(payload["value"]) if reg_type == winreg.REG_BINARY else payload["value"]
            winreg.SetValueEx(key, name, 0, reg_type, value)


def delete_reg_tree(path: str) -> None:
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, path, 0, winreg.KEY_READ | winreg.KEY_WRITE) as key:
            subkeys = []
            index = 0
            while True:
                try:
                    subkeys.append(winreg.EnumKey(key, index))
                    index += 1
                except OSError:
                    break
        for subkey_name in subkeys:
            delete_reg_tree(f"{path}\\{subkey_name}")
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, path)
    except FileNotFoundError:
        return


def clear_reg_values(path: str) -> None:
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, path, 0, winreg.KEY_READ | winreg.KEY_WRITE) as key:
            names = []
            index = 0
            while True:
                try:
                    name, _, _ = winreg.EnumValue(key, index)
                    names.append(name)
                    index += 1
                except OSError:
                    break
            for name in names:
                winreg.DeleteValue(key, name)
    except FileNotFoundError:
        return


def read_reg_binary(path: str, name: str) -> bytes | None:
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, path) as key:
            value, reg_type = winreg.QueryValueEx(key, name)
        if reg_type == winreg.REG_BINARY:
            return bytes(value)
    except FileNotFoundError:
        return None
    return None


def read_reg_string(path: str, name: str) -> str:
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, path) as key:
            value, _ = winreg.QueryValueEx(key, name)
        return str(value)
    except FileNotFoundError:
        return ""


def write_reg_binary(path: str, name: str, value: bytes) -> None:
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, path) as key:
        winreg.SetValueEx(key, name, 0, winreg.REG_BINARY, value)


def write_reg_string(path: str, name: str, value: str) -> None:
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, path) as key:
        winreg.SetValueEx(key, name, 0, winreg.REG_SZ, value)


def normalize_account_token(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "", str(value or "").strip()).upper()


def guess_login_local_token(login_name: str) -> str:
    login_name = str(login_name or "").strip()
    if "@" in login_name:
        login_name = login_name.split("@", 1)[0]
    return normalize_account_token(login_name)


def parse_config_wtf_setting(path: Path, key: str) -> str:
    if not path.exists():
        return ""
    pattern = re.compile(rf'^SET\s+{re.escape(key)}\s+"([^"]*)"', re.IGNORECASE)
    try:
        for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            match = pattern.match(line.strip())
            if match:
                return match.group(1).strip()
    except Exception:
        return ""
    return ""


def read_current_wow_variant() -> str:
    agent_uid = parse_config_wtf_setting(WOW_VARIANT_ROOTS["wow_classic"] / "WTF" / "Config.wtf", "agentUID")
    if agent_uid == "wow_classic":
        return "wow_classic"
    if agent_uid == "wow_classic_era":
        return "wow_classic_era"
    if agent_uid == "wow_classic_titan":
        return "wow_classic_titan"
    if agent_uid == "wow":
        return "wow"
    return "wow_classic"


def parse_latest_wow_game_accounts_from_aurora(variant: str) -> list[str]:
    root = WOW_VARIANT_ROOTS.get(variant)
    if not root:
        return []
    aurora_log = root / "Logs" / "Aurora.log"
    if not aurora_log.exists():
        return []
    try:
        lines = aurora_log.read_text(encoding="utf-8", errors="ignore").splitlines()
    except Exception:
        return []
    name_pattern = re.compile(r'BGS_ code="ERROR_OK \(0\)" name="([^"]+)"')
    start_index = 0
    for index in range(len(lines) - 1, -1, -1):
        if "Starting login" in lines[index]:
            start_index = index
            break
    names: list[str] = []
    seen: set[str] = set()
    for line in lines[start_index:]:
        match = name_pattern.search(line)
        if not match:
            continue
        name = match.group(1).strip()
        if not name or name in seen:
            continue
        seen.add(name)
        names.append(name)
    return sorted(names, key=lambda item: (item.lower(), item))


def parse_latest_wow_game_accounts_from_battlenet_log() -> tuple[list[str], str, str]:
    if not BATTLE_NET_LOG_DIR.exists():
        return [], "", ""
    logs = sorted(
        BATTLE_NET_LOG_DIR.glob("battle.net-*.log"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    if not logs:
        return [], "", ""
    game_info_pattern = re.compile(r'Received GameLevelInfo: \(Game: CN-WoW-[^)]+\) info=.*?\|name="([^"]+)"')
    selected_pattern = re.compile(r'New selection for product group WoW: account=GameAccount\([^)]* name=([^) ]+)')
    for log_path in logs[:5]:
        try:
            lines = log_path.read_text(encoding="utf-8", errors="ignore").splitlines()
        except Exception:
            continue
        start_index = 0
        for index in range(len(lines) - 1, -1, -1):
            line = lines[index]
            if "Login triggered. entityId=" in line or "Querying game accounts for region: CN" in line:
                start_index = index
                break
        names: list[str] = []
        seen: set[str] = set()
        selected_name = ""
        for line in lines[start_index:]:
            match = game_info_pattern.search(line)
            if match:
                name = match.group(1).strip()
                if name and name not in seen:
                    seen.add(name)
                    names.append(name)
            match = selected_pattern.search(line)
            if match:
                selected_name = match.group(1).strip()
        if names:
            names = sorted(names, key=lambda item: (item.lower(), item))
            return names, selected_name, f"battle.net 日志: {log_path.name}"
    return [], "", ""


def detect_current_wow_game_accounts() -> tuple[list[str], str, str, str]:
    variant = read_current_wow_variant()
    names, selected_name, source_label = parse_latest_wow_game_accounts_from_battlenet_log()
    if names:
        return names, selected_name, source_label, variant
    aurora_names = parse_latest_wow_game_accounts_from_aurora(variant)
    if aurora_names:
        selected_name = read_reg_string(REG_BNET_WOW, "GAME_ACCOUNT").strip()
        return aurora_names, selected_name, f"WoW 日志: {variant}", variant
    return [], "", "", variant


def collect_wow_account_directories() -> list[dict]:
    directories: list[dict] = []
    for variant, root in WOW_VARIANT_ROOTS.items():
        account_root = root / "WTF" / "Account"
        if not account_root.exists():
            continue
        for folder in sorted(account_root.iterdir()):
            if not folder.is_dir():
                continue
            if folder.name.lower() == "savedvariables":
                continue
            directories.append(
                {
                    "variant": variant,
                    "name": folder.name,
                    "path": folder,
                    "mtime": folder.stat().st_mtime,
                }
            )
    return directories


def read_recent_aurora_account_names(limit_lines: int = 400) -> list[str]:
    pattern = re.compile(r'BGS_ code="ERROR_OK \(0\)" name="([^"]+)"')
    names: list[str] = []
    seen: set[str] = set()
    for root in WOW_VARIANT_ROOTS.values():
        aurora_log = root / "Logs" / "Aurora.log"
        if not aurora_log.exists():
            continue
        try:
            lines = aurora_log.read_text(encoding="utf-8", errors="ignore").splitlines()
        except Exception:
            continue
        for line in lines[-limit_lines:]:
            match = pattern.search(line)
            if not match:
                continue
            name = match.group(1).strip()
            if name and name not in seen:
                seen.add(name)
                names.append(name)
    return names


def detect_current_wow_local_account(login_name: str, registry_game_account: str) -> tuple[str, list[str], dict[str, list[str]]]:
    directories = collect_wow_account_directories()
    if not directories:
        return "", [], {}
    login_token = guess_login_local_token(login_name)
    registry_token = normalize_account_token(registry_game_account)
    recent_names = set(read_recent_aurora_account_names())
    names_by_variant: dict[str, list[str]] = {}
    best_name = ""
    best_score = -1
    candidate_scores: dict[str, int] = {}
    for entry in directories:
        name = entry["name"]
        names_by_variant.setdefault(entry["variant"], [])
        if name not in names_by_variant[entry["variant"]]:
            names_by_variant[entry["variant"]].append(name)
        score = 0
        if login_token and normalize_account_token(name) == login_token:
            score += 100
        if registry_token and normalize_account_token(name) == registry_token:
            score += 40
        if name in recent_names:
            score += 60
        if not re.fullmatch(r"WoW\d+", name, re.IGNORECASE):
            score += 5
        candidate_scores[name] = max(candidate_scores.get(name, 0), score)
        if score > best_score:
            best_name = name
            best_score = score
    candidates = [name for name, score in sorted(candidate_scores.items(), key=lambda item: (-item[1], item[0])) if score > 0]
    if not best_name and len(candidate_scores) == 1:
        best_name = next(iter(candidate_scores))
    return best_name, candidates, names_by_variant


def write_unifiedauth_blob_map(blob_map: dict[str, str]) -> None:
    clear_reg_values(REG_BNET_UNIFIEDAUTH)
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, REG_BNET_UNIFIEDAUTH) as key:
        for blob_id, encoded_value in blob_map.items():
            if not encoded_value:
                continue
            value = base64.b64decode(encoded_value)
            winreg.SetValueEx(key, blob_id, 0, winreg.REG_BINARY, value)


def find_battlenet_processes() -> list[dict[str, str | int]]:
    process_names = {
        "Battle.net",
        "Battle.net.exe",
        "Agent",
        "Agent.exe",
    }
    processes: list[dict[str, str | int]] = []
    try:
        output = subprocess.check_output(
            ["tasklist", "/FO", "CSV", "/NH"],
            text=True,
            encoding="utf-8",
            errors="ignore",
        )
    except Exception:
        return processes
    for line in output.splitlines():
        parts = [item.strip('"') for item in line.split('","')]
        if len(parts) < 2:
            continue
        process_name, pid_text = parts[0], parts[1]
        if process_name in process_names:
            try:
                processes.append({"name": process_name, "pid": int(pid_text)})
            except ValueError:
                continue
    return processes


def find_battlenet_process_ids() -> list[int]:
    return [int(item["pid"]) for item in find_battlenet_processes()]


def summarize_battlenet_processes(processes: list[dict[str, str | int]]) -> str:
    if not processes:
        return "-"
    return ", ".join(f"{item['name']}:{item['pid']}" for item in processes)


def stop_battlenet_processes() -> tuple[list[int], list[int]]:
    before_processes = find_battlenet_processes()
    before_pids = [int(item["pid"]) for item in before_processes]
    if not before_processes:
        return [], []
    image_names = sorted({str(item["name"]) for item in before_processes})
    for _ in range(3):
        for image_name in image_names:
            subprocess.run(
                ["taskkill", "/IM", image_name, "/F"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="ignore",
                check=False,
            )
        time.sleep(0.5)
        remaining_processes = find_battlenet_processes()
        if not remaining_processes:
            return before_pids, []
    # Final fallback: kill by exact PID in case some child/renamed processes survived image-name based termination.
    for pid in before_pids:
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/F"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
            check=False,
        )
    remaining_pids = before_pids
    for _ in range(12):
        time.sleep(0.5)
        remaining_pids = find_battlenet_process_ids()
        if not remaining_pids:
            break
    return before_pids, remaining_pids


def save_snapshot(label: str) -> Path:
    ensure_backup_dir()
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    out_path = BACKUP_DIR / f"{timestamp}-{label}.json"
    payload = build_current_snapshot_payload()
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return out_path


def build_current_snapshot_payload() -> dict:
    return {
        "savedAt": datetime.now().isoformat(timespec="seconds"),
        "wow": read_reg_values(REG_BNET_WOW),
        "wtcg": read_reg_values(REG_BNET_WTCG),
        "encryption": read_reg_values(REG_BNET_ENCRYPTION),
        "unifiedAuth": read_reg_values(REG_BNET_UNIFIEDAUTH),
        "battleNetConfigText": read_battlenet_config_text(),
        "battleNetConfigJson": read_battlenet_config_json(),
        "battleNetFileBlobs": read_battlenet_file_blobs(),
        "battleNetLocalBlobs": read_battlenet_local_blobs(),
    }


def restore_snapshot(path: Path) -> None:
    payload = json.loads(path.read_text(encoding="utf-8"))
    restore_snapshot_payload(payload)


def restore_snapshot_payload(payload: dict) -> None:
    if "wow" in payload:
        write_reg_values(REG_BNET_WOW, payload["wow"])
    if "wtcg" in payload:
        write_reg_values(REG_BNET_WTCG, payload["wtcg"])
    if "encryption" in payload:
        write_reg_values(REG_BNET_ENCRYPTION, payload["encryption"])
    clear_reg_values(REG_BNET_UNIFIEDAUTH)
    if "unifiedAuth" in payload:
        write_reg_values(REG_BNET_UNIFIEDAUTH, payload["unifiedAuth"])
    if "battleNetConfigText" in payload:
        write_battlenet_config_text(payload["battleNetConfigText"] or "")
    if "battleNetFileBlobs" in payload:
        write_battlenet_file_blobs(payload["battleNetFileBlobs"] or {})
    if "battleNetLocalBlobs" in payload:
        write_battlenet_local_blobs(payload["battleNetLocalBlobs"] or {})


def load_backup_payload(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def summarize_backup(path: Path) -> dict:
    payload = load_backup_payload(path)
    unified_auth = payload.get("unifiedAuth") or {}
    wow = payload.get("wow") or {}
    config_json = payload.get("battleNetConfigJson") or {}
    battle_net_file_blobs = payload.get("battleNetFileBlobs") or {}
    battle_net_local_blobs = payload.get("battleNetLocalBlobs") or {}
    saved_account_names = extract_saved_account_names(config_json)
    score = 0
    score += len(unified_auth) * 100
    score += 10 if wow.get("WEB_TOKEN") else 0
    score += 5 if wow.get("GAME_ACCOUNT") else 0
    score += 5 if saved_account_names else 0
    score += 20 if battle_net_file_blobs else 0
    score += 15 if battle_net_local_blobs else 0
    return {
        "path": path,
        "payload": payload,
        "unifiedauth_count": len(unified_auth),
        "unifiedauth_keys": sorted(unified_auth.keys()),
        "saved_account_names": saved_account_names,
        "battle_net_file_count": len(battle_net_file_blobs),
        "battle_net_local_count": len(battle_net_local_blobs),
        "game_account": (
            ((wow.get("GAME_ACCOUNT") or {}).get("value"))
            if isinstance(wow.get("GAME_ACCOUNT"), dict)
            else wow.get("GAME_ACCOUNT")
        ) or "",
        "score": score,
    }


def pick_recommended_backup(backups: list[Path]) -> dict | None:
    summaries = [summarize_backup(path) for path in backups]
    if not summaries:
        return None
    # Strongly prefer backups that include a full Battle.net file snapshot.
    # Older "registry-only" backups should lose to newer full snapshots, even if they contain more auth blobs.
    best = max(
        summaries,
        key=lambda item: (
            1 if item["battle_net_file_count"] > 0 else 0,
            item["score"],
            item["path"].stat().st_mtime,
        ),
    )
    return best


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(65536)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def collect_file_state(root: Path) -> dict:
    files: dict[str, dict] = {}
    if not root.exists():
        return files
    for file_path in sorted(root.rglob("*")):
        if not file_path.is_file():
            continue
        rel_path = str(file_path.relative_to(root))
        stat = file_path.stat()
        files[rel_path] = {
            "size": stat.st_size,
            "mtime": int(stat.st_mtime),
            "sha256": sha256_file(file_path),
        }
    return files


def read_battlenet_config_text() -> str:
    if not BATTLE_NET_CONFIG_PATH.exists():
        return ""
    return BATTLE_NET_CONFIG_PATH.read_text(encoding="utf-8", errors="ignore")


def read_battlenet_config_json() -> dict | None:
    text = read_battlenet_config_text()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def write_battlenet_config_text(config_text: str) -> None:
    BATTLE_NET_ROOT.mkdir(parents=True, exist_ok=True)
    BATTLE_NET_CONFIG_PATH.write_text(config_text, encoding="utf-8")


def read_battlenet_file_blobs() -> dict[str, str]:
    blobs: dict[str, str] = {}
    if not BATTLE_NET_ROOT.exists():
        return blobs
    for file_path in sorted(BATTLE_NET_ROOT.rglob("*")):
        if not file_path.is_file():
            continue
        rel_path = str(file_path.relative_to(BATTLE_NET_ROOT))
        blobs[rel_path] = base64.b64encode(file_path.read_bytes()).decode("ascii")
    return blobs


def write_battlenet_file_blobs(blobs: dict[str, str]) -> None:
    BATTLE_NET_ROOT.mkdir(parents=True, exist_ok=True)
    for rel_path, encoded_blob in blobs.items():
        if not encoded_blob:
            continue
        target_path = BATTLE_NET_ROOT / rel_path
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_bytes(base64.b64decode(encoded_blob))


def iter_battlenet_local_snapshot_files() -> list[Path]:
    files: list[Path] = []
    if not BATTLE_NET_LOCAL_ROOT.exists():
        return files
    for file_name in sorted(LOCAL_BATTLE_NET_ROOT_FILES):
        path = BATTLE_NET_LOCAL_ROOT / file_name
        if path.is_file():
            files.append(path)
    for dir_name in sorted(LOCAL_BATTLE_NET_MANAGED_DIRS):
        root = BATTLE_NET_LOCAL_ROOT / dir_name
        if not root.exists():
            continue
        for file_path in sorted(root.rglob("*")):
            if file_path.is_file():
                files.append(file_path)
    return files


def read_battlenet_local_blobs() -> dict[str, str]:
    blobs: dict[str, str] = {}
    for file_path in iter_battlenet_local_snapshot_files():
        rel_path = str(file_path.relative_to(BATTLE_NET_LOCAL_ROOT))
        blobs[rel_path] = base64.b64encode(file_path.read_bytes()).decode("ascii")
    return blobs


def write_battlenet_local_blobs(blobs: dict[str, str]) -> None:
    BATTLE_NET_LOCAL_ROOT.mkdir(parents=True, exist_ok=True)
    for rel_path, encoded_blob in blobs.items():
        if not encoded_blob:
            continue
        target_path = BATTLE_NET_LOCAL_ROOT / rel_path
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_bytes(base64.b64decode(encoded_blob))


def save_diagnostic_snapshot(label: str) -> Path:
    ensure_diagnostic_dir()
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    out_path = DIAGNOSTIC_DIR / f"{timestamp}-{label}.json"
    payload = {
        "savedAt": datetime.now().isoformat(timespec="seconds"),
        "registryTree": read_reg_tree(REG_BNET_ROOT),
        "battleNetFiles": collect_file_state(BATTLE_NET_ROOT),
        "battleNetLocalFiles": {
            str(path.relative_to(BATTLE_NET_LOCAL_ROOT)): {
                "size": path.stat().st_size,
                "mtime": int(path.stat().st_mtime),
                "sha256": sha256_file(path),
            }
            for path in iter_battlenet_local_snapshot_files()
        },
        "battleNetConfigText": read_battlenet_config_text(),
        "battleNetConfigJson": read_battlenet_config_json(),
    }
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return out_path


def flatten_reg_tree(tree: dict, prefix: str = "") -> dict[str, dict]:
    flat: dict[str, dict] = {}
    for name, payload in tree.get("values", {}).items():
        flat[f"{prefix}|{name}"] = payload
    for subkey_name, sub_tree in tree.get("subkeys", {}).items():
        next_prefix = f"{prefix}\\{subkey_name}" if prefix else subkey_name
        flat.update(flatten_reg_tree(sub_tree, next_prefix))
    return flat


def diff_maps(before: dict, after: dict) -> list[str]:
    lines: list[str] = []
    keys = sorted(set(before) | set(after))
    for key in keys:
        before_value = before.get(key)
        after_value = after.get(key)
        if before_value == after_value:
            continue
        if before_value is None:
            lines.append(f"+ {key}")
        elif after_value is None:
            lines.append(f"- {key}")
        else:
            lines.append(f"~ {key}")
    return lines


def flatten_json_tree(value, prefix: str = "") -> dict[str, str]:
    flat: dict[str, str] = {}
    if isinstance(value, dict):
        for key, child in value.items():
            next_prefix = f"{prefix}.{key}" if prefix else str(key)
            flat.update(flatten_json_tree(child, next_prefix))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            next_prefix = f"{prefix}[{index}]"
            flat.update(flatten_json_tree(child, next_prefix))
    else:
        flat[prefix] = json.dumps(value, ensure_ascii=False)
    return flat


def write_snapshot_diff_report(before_path: Path, after_path: Path) -> Path:
    before_payload = json.loads(before_path.read_text(encoding="utf-8"))
    after_payload = json.loads(after_path.read_text(encoding="utf-8"))
    before_reg = flatten_reg_tree(before_payload.get("registryTree", {}), REG_BNET_ROOT)
    after_reg = flatten_reg_tree(after_payload.get("registryTree", {}), REG_BNET_ROOT)
    before_files = before_payload.get("battleNetFiles", {})
    after_files = after_payload.get("battleNetFiles", {})
    before_local_files = before_payload.get("battleNetLocalFiles", {})
    after_local_files = after_payload.get("battleNetLocalFiles", {})
    before_config = flatten_json_tree(before_payload.get("battleNetConfigJson") or {})
    after_config = flatten_json_tree(after_payload.get("battleNetConfigJson") or {})

    reg_lines = diff_maps(before_reg, after_reg)
    file_lines = diff_maps(before_files, after_files)
    local_file_lines = diff_maps(before_local_files, after_local_files)
    config_lines = diff_maps(before_config, after_config)

    report_path = DIAGNOSTIC_DIR / f"{after_path.stem}-diff-vs-{before_path.stem}.md"
    report = [
        f"# Diagnostic Diff",
        "",
        f"- before: `{before_path.name}`",
        f"- after: `{after_path.name}`",
        "",
        "## Registry Changes",
    ]
    report.extend(reg_lines or ["(no changes)"])
    report.extend(["", "## Battle.net File Changes"])
    report.extend(file_lines or ["(no changes)"])
    report.extend(["", "## Battle.net Local File Changes"])
    report.extend(local_file_lines or ["(no changes)"])
    report.extend(["", "## Battle.net.config JSON Changes"])
    report.extend(config_lines or ["(no changes)"])
    report_path.write_text("\n".join(report), encoding="utf-8")
    return report_path


@dataclass
class AccountEntry:
    email: str
    description: str
    backup_time: int | None
    last_login_time: int | None
    saved_account_name: str
    wow_game_accounts: list[str]
    wow_selected_account: str
    wow_capture_source: str
    wow_source_variant: str
    wow_local_account_name: str
    wow_local_account_candidates: list[str]
    wow_accounts_by_variant: dict[str, list[str]]
    blob_ids: list[str]
    blob_map: dict[str, str]
    battlenet_config_text: str
    battlenet_config_json: dict | None
    battlenet_file_blobs: dict[str, str]
    full_snapshot: dict
    folder: Path
    source: str


def slugify_account_name(value: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip())
    normalized = normalized.strip(".-").lower()
    return normalized or f"account-{int(time.time())}"


def load_json_file(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def read_account_config_text(folder: Path) -> str:
    config_path = folder / "battlenet_config.txt"
    if not config_path.exists():
        return ""
    return config_path.read_text(encoding="utf-8", errors="ignore")


def read_account_config_json(folder: Path) -> dict | None:
    json_path = folder / "battlenet_config.json"
    if json_path.exists():
        try:
            return load_json_file(json_path)
        except Exception:
            pass
    text = read_account_config_text(folder)
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def write_account_config_snapshot(folder: Path, config_text: str, config_json: dict | None) -> None:
    config_text_path = folder / "battlenet_config.txt"
    config_json_path = folder / "battlenet_config.json"
    if config_text:
        config_text_path.write_text(config_text, encoding="utf-8")
    elif config_text_path.exists():
        config_text_path.unlink()
    if config_json is not None:
        config_json_path.write_text(
            json.dumps(config_json, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    elif config_json_path.exists():
        config_json_path.unlink()


def read_account_file_blobs(folder: Path) -> dict[str, str]:
    blobs_path = folder / "battlenet_files.json"
    if not blobs_path.exists():
        return {}
    try:
        data = load_json_file(blobs_path)
    except Exception:
        return {}
    return {str(key): str(value) for key, value in data.items() if value}


def write_account_file_blobs(folder: Path, blobs: dict[str, str]) -> None:
    blobs_path = folder / "battlenet_files.json"
    if blobs:
        blobs_path.write_text(
            json.dumps(blobs, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    elif blobs_path.exists():
        blobs_path.unlink()


def read_account_full_snapshot(folder: Path) -> dict:
    snapshot_path = folder / "account_snapshot.json"
    if not snapshot_path.exists():
        return {}
    try:
        return load_json_file(snapshot_path)
    except Exception:
        return {}


def write_account_full_snapshot(folder: Path, snapshot: dict) -> None:
    snapshot_path = folder / "account_snapshot.json"
    if snapshot:
        snapshot_path.write_text(
            json.dumps(snapshot, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    elif snapshot_path.exists():
        snapshot_path.unlink()


def extract_saved_account_names(config_json: dict | None) -> list[str]:
    if not isinstance(config_json, dict):
        return []
    client = config_json.get("Client")
    if not isinstance(client, dict):
        return []
    saved_names = client.get("SavedAccountNames")
    if isinstance(saved_names, list):
        return [str(item) for item in saved_names if str(item).strip()]
    if isinstance(saved_names, str) and saved_names.strip():
        return [saved_names.strip()]
    return []


def pick_primary_login_name(config_json: dict | None, current_game_account: str) -> str:
    saved_account_names = extract_saved_account_names(config_json)
    for candidate in saved_account_names:
        candidate = candidate.strip()
        if "@" in candidate:
            return candidate
    for candidate in saved_account_names:
        candidate = candidate.strip()
        if candidate:
            return candidate
    return current_game_account.strip()


def extract_snapshot_game_account(snapshot: dict) -> str:
    wow = snapshot.get("wow") or {}
    value = wow.get("GAME_ACCOUNT")
    if isinstance(value, dict):
        value = value.get("value")
    return str(value or "").strip()


def build_account_entry_from_folder(folder: Path, source: str) -> AccountEntry | None:
    info_path = folder / "info.json"
    account_path = folder / "account.json"
    registry_path = folder / "registry.json"
    try:
        info = load_json_file(info_path)
        account = load_json_file(account_path)
        registry = load_json_file(registry_path)
    except Exception:
        return None
    root_values = registry.get("", {})
    blob_ids = sorted(root_values.keys())
    blob_map = {
        blob_id: payload.get("Value", "")
        for blob_id, payload in root_values.items()
        if isinstance(payload, dict) and payload.get("Value")
    }
    battlenet_config_text = read_account_config_text(folder)
    battlenet_config_json = read_account_config_json(folder)
    battlenet_file_blobs = read_account_file_blobs(folder)
    full_snapshot = read_account_full_snapshot(folder)
    return AccountEntry(
        email=info.get("account") or folder.name,
        description=info.get("description", ""),
        backup_time=info.get("backupTime"),
        last_login_time=info.get("lastLoginTime"),
        saved_account_name=account.get("savedAccountName", ""),
        wow_game_accounts=[str(item) for item in account.get("wowGameAccounts", []) if str(item).strip()],
        wow_selected_account=str(account.get("wowSelectedAccount", "") or ""),
        wow_capture_source=str(account.get("wowCaptureSource", "") or ""),
        wow_source_variant=str(account.get("wowSourceVariant", "") or ""),
        wow_local_account_name=account.get("wowLocalAccountName", ""),
        wow_local_account_candidates=[str(item) for item in account.get("wowLocalAccountCandidates", []) if str(item).strip()],
        wow_accounts_by_variant={
            str(key): [str(item) for item in value if str(item).strip()]
            for key, value in (account.get("wowAccountsByVariant", {}) or {}).items()
            if isinstance(value, list)
        },
        blob_ids=blob_ids,
        blob_map=blob_map,
        battlenet_config_text=battlenet_config_text,
        battlenet_config_json=battlenet_config_json,
        battlenet_file_blobs=battlenet_file_blobs,
        full_snapshot=full_snapshot,
        folder=folder,
        source=source,
    )


def load_accounts_from_root(root: Path, source: str) -> list[AccountEntry]:
    accounts: list[AccountEntry] = []
    if not root.exists():
        return accounts
    for folder in sorted(root.iterdir()):
        if not folder.is_dir():
            continue
        entry = build_account_entry_from_folder(folder, source)
        if entry:
            accounts.append(entry)
    return accounts


def load_accounts() -> list[AccountEntry]:
    ensure_library_dir()
    return load_accounts_from_root(LIBRARY_ACCOUNTS_DIR, "library")


def count_external_accounts() -> int:
    return len(load_accounts_from_root(BATTLE_CACHE_ROOT, "newbeebox"))


def import_accounts_from_newbeebox() -> tuple[int, int]:
    ensure_library_dir()
    imported = 0
    updated = 0
    for account in load_accounts_from_root(BATTLE_CACHE_ROOT, "newbeebox"):
        folder_name = slugify_account_name(account.email)
        target_folder = LIBRARY_ACCOUNTS_DIR / folder_name
        target_folder.mkdir(parents=True, exist_ok=True)
        info_payload = {
            "account": account.email,
            "description": account.description,
            "backupTime": account.backup_time,
            "lastLoginTime": account.last_login_time,
            "importedFrom": "NewBeeBox",
            "importedAt": datetime.now().isoformat(timespec="seconds"),
        }
        account_payload = {
            "savedAccountName": account.saved_account_name,
            "wowGameAccounts": account.wow_game_accounts,
            "wowSelectedAccount": account.wow_selected_account,
            "wowCaptureSource": account.wow_capture_source,
            "wowSourceVariant": account.wow_source_variant,
            "wowLocalAccountName": account.wow_local_account_name,
            "wowLocalAccountCandidates": account.wow_local_account_candidates,
            "wowAccountsByVariant": account.wow_accounts_by_variant,
        }
        registry_payload = {
            "": {
                blob_id: {"Value": blob_value}
                for blob_id, blob_value in account.blob_map.items()
            }
        }
        already_exists = (target_folder / "info.json").exists()
        (target_folder / "info.json").write_text(
            json.dumps(info_payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        (target_folder / "account.json").write_text(
            json.dumps(account_payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        (target_folder / "registry.json").write_text(
            json.dumps(registry_payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        write_account_config_snapshot(target_folder, "", None)
        write_account_file_blobs(target_folder, {})
        write_account_full_snapshot(target_folder, {})
        if already_exists:
            updated += 1
        else:
            imported += 1
    return imported, updated


def save_account_to_library(
    account_name: str,
    description: str,
    saved_account_name: str,
    wow_game_accounts: list[str],
    wow_selected_account: str,
    wow_capture_source: str,
    wow_source_variant: str,
    wow_local_account_name: str,
    wow_local_account_candidates: list[str],
    wow_accounts_by_variant: dict[str, list[str]],
    blob_map: dict[str, str],
    imported_from: str,
    battlenet_config_text: str,
    battlenet_config_json: dict | None,
    battlenet_file_blobs: dict[str, str],
    full_snapshot: dict,
) -> Path:
    ensure_library_dir()
    folder_name = slugify_account_name(account_name)
    target_folder = LIBRARY_ACCOUNTS_DIR / folder_name
    target_folder.mkdir(parents=True, exist_ok=True)
    now_ms = int(time.time() * 1000)
    info_payload = {
        "account": account_name,
        "description": description,
        "backupTime": now_ms,
        "lastLoginTime": now_ms,
        "importedFrom": imported_from,
        "importedAt": datetime.now().isoformat(timespec="seconds"),
    }
    account_payload = {
        "savedAccountName": saved_account_name,
        "wowGameAccounts": wow_game_accounts,
        "wowSelectedAccount": wow_selected_account,
        "wowCaptureSource": wow_capture_source,
        "wowSourceVariant": wow_source_variant,
        "wowLocalAccountName": wow_local_account_name,
        "wowLocalAccountCandidates": wow_local_account_candidates,
        "wowAccountsByVariant": wow_accounts_by_variant,
    }
    registry_payload = {
        "": {
            blob_id: {"Value": blob_value}
            for blob_id, blob_value in blob_map.items()
        }
    }
    (target_folder / "info.json").write_text(
        json.dumps(info_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (target_folder / "account.json").write_text(
        json.dumps(account_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (target_folder / "registry.json").write_text(
        json.dumps(registry_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    write_account_config_snapshot(target_folder, battlenet_config_text, battlenet_config_json)
    write_account_file_blobs(target_folder, battlenet_file_blobs)
    write_account_full_snapshot(target_folder, full_snapshot)
    return target_folder


def delete_account_from_library(account: AccountEntry) -> None:
    if account.folder.parent != LIBRARY_ACCOUNTS_DIR:
        raise ValueError("只能删除本程序账号库中的账号。")
    for file_path in account.folder.iterdir():
        if file_path.is_file():
            file_path.unlink()
    account.folder.rmdir()


def read_current_state() -> dict:
    current_web_token = read_reg_binary(REG_BNET_WOW, "WEB_TOKEN") or b""
    unified_auth_values = read_reg_values(REG_BNET_UNIFIEDAUTH)
    current_game_account = read_reg_string(REG_BNET_WOW, "GAME_ACCOUNT")
    current_config_json = read_battlenet_config_json()
    current_login_name = pick_primary_login_name(current_config_json, current_game_account)
    wow_game_accounts, wow_selected_account, wow_capture_source, wow_source_variant = detect_current_wow_game_accounts()
    wow_local_account_name, wow_local_candidates, wow_accounts_by_variant = detect_current_wow_local_account(
        current_login_name, current_game_account
    )
    saved_account_names = extract_saved_account_names(current_config_json)
    return {
        "game_account": current_game_account,
        "wow_game_accounts": wow_game_accounts,
        "wow_selected_account": wow_selected_account,
        "wow_capture_source": wow_capture_source,
        "wow_source_variant": wow_source_variant,
        "wow_game_accounts_ready": bool(wow_game_accounts),
        "wow_local_account_name": wow_local_account_name,
        "wow_local_candidates": wow_local_candidates,
        "wow_accounts_by_variant": wow_accounts_by_variant,
        "account_ts": read_reg_string(REG_BNET_WOW, "ACCOUNT_TS"),
        "web_token_len": len(current_web_token),
        "web_token_b64": base64.b64encode(current_web_token).decode("ascii") if current_web_token else "",
        "cache_database_len": len(read_reg_binary(REG_BNET_ENCRYPTION, "CacheDatabase") or b""),
        "unifiedauth_count": len(unified_auth_values),
        "current_login_name": current_login_name,
        "saved_account_names": saved_account_names,
        "battle_net_file_count": len(read_battlenet_file_blobs()),
        "battle_net_local_count": len(read_battlenet_local_blobs()),
    }


def count_local_snapshot_files(snapshot: dict | None) -> int:
    if not isinstance(snapshot, dict):
        return 0
    return len(snapshot.get("battleNetLocalBlobs") or {})


def load_ui_state() -> dict:
    ensure_library_dir()
    if not UI_STATE_PATH.exists():
        return {}
    try:
        return load_json_file(UI_STATE_PATH)
    except Exception:
        return {}


def save_ui_state(state: dict) -> None:
    ensure_library_dir()
    UI_STATE_PATH.write_text(
        json.dumps(state, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def get_saved_game_directory() -> str:
    state = load_ui_state()
    return str(state.get("gameDirectory", "") or "")


def set_saved_game_directory(path: str) -> None:
    state = load_ui_state()
    state["gameDirectory"] = str(path or "").strip()
    save_ui_state(state)


def get_saved_account_order() -> list[str]:
    state = load_ui_state()
    order = state.get("accountOrder")
    if not isinstance(order, list):
        return []
    return [str(item) for item in order if str(item).strip()]


def set_saved_account_order(order: list[str]) -> None:
    state = load_ui_state()
    state["accountOrder"] = [str(item) for item in order if str(item).strip()]
    save_ui_state(state)


def sort_accounts_by_saved_order(accounts: list[AccountEntry]) -> list[AccountEntry]:
    order = get_saved_account_order()
    if not order:
        return accounts
    order_index = {email: idx for idx, email in enumerate(order)}
    return sorted(
        accounts,
        key=lambda account: (
            order_index.get(account.email, len(order_index) + 1000),
            -(account.backup_time or 0),
            account.email.lower(),
        ),
    )


def persist_current_account_order(accounts: list[AccountEntry]) -> None:
    set_saved_account_order([account.email for account in accounts])


def update_account_description(account: AccountEntry, description: str) -> None:
    info_path = account.folder / "info.json"
    payload = load_json_file(info_path)
    payload["description"] = description
    info_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def detect_default_game_directory() -> str:
    for root in WOW_VARIANT_ROOTS.values():
        if root.exists():
            return str(root.parent)
    if WOW_INSTALL_BASE.exists():
        return str(WOW_INSTALL_BASE)
    return ""


def import_accounts_from_external_directory(root: Path) -> tuple[int, int]:
    ensure_library_dir()
    candidate_root = root / "accounts" if (root / "accounts").exists() else root
    imported = 0
    updated = 0
    for account in load_accounts_from_root(candidate_root, "external"):
        folder_name = slugify_account_name(account.email)
        target_folder = LIBRARY_ACCOUNTS_DIR / folder_name
        target_folder.mkdir(parents=True, exist_ok=True)
        already_exists = (target_folder / "info.json").exists()
        shutil.copy2(account.folder / "info.json", target_folder / "info.json")
        shutil.copy2(account.folder / "account.json", target_folder / "account.json")
        shutil.copy2(account.folder / "registry.json", target_folder / "registry.json")
        write_account_config_snapshot(target_folder, account.battlenet_config_text, account.battlenet_config_json)
        write_account_file_blobs(target_folder, account.battlenet_file_blobs)
        write_account_full_snapshot(target_folder, account.full_snapshot)
        if already_exists:
            updated += 1
        else:
            imported += 1
    return imported, updated


def backup_account_library_to_directory(output_dir: Path) -> Path:
    ensure_library_dir()
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    archive_path = output_dir / f"YiboBattleSwitch-account-library-backup-{timestamp}.zip"
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for file_path in LIBRARY_DIR.rglob("*"):
            if file_path.is_file():
                archive.write(file_path, file_path.relative_to(LIBRARY_DIR.parent))
    return archive_path


BaseTk = tk.Tk if tk is not None else object


class App(BaseTk):
    def __init__(self) -> None:
        if tk is None:
            raise RuntimeError("当前环境缺少 tkinter，无法启动 Tk 界面。")
        super().__init__()
        self.title("YiboBattleSwitch 独立账号切换器")
        self.geometry("1180x820")
        self.minsize(1040, 720)

        self.accounts: list[AccountEntry] = []
        self.account_by_id: dict[str, AccountEntry] = {}
        self.selected_account: AccountEntry | None = None

        self.current_summary_var = tk.StringVar()
        self.game_dir_var = tk.StringVar(value=get_saved_game_directory() or detect_default_game_directory())
        self.debug_toggle_var = tk.StringVar(value="展开调试")
        self.status_var = tk.StringVar(value="准备就绪")

        self._configure_styles()
        self._build_ui()
        self._persist_game_directory()
        self.refresh_all()

    def _configure_styles(self) -> None:
        self.option_add("*Font", ("Microsoft YaHei UI", 10))
        self.configure(bg="#f3f6fb")
        style = ttk.Style(self)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass

        style.configure(".", background="#f3f6fb", foreground="#172033")
        style.configure("Card.TFrame", background="#ffffff", relief="flat")
        style.configure("Card.TLabelframe", background="#ffffff", borderwidth=1, relief="solid")
        style.configure("Card.TLabelframe.Label", background="#ffffff", foreground="#172033", font=("Microsoft YaHei UI", 10, "bold"))
        style.configure("Topbar.TFrame", background="#ffffff")
        style.configure("Footer.TFrame", background="#ffffff")
        style.configure("App.TLabel", background="#f3f6fb", foreground="#172033")
        style.configure("Muted.TLabel", background="#ffffff", foreground="#5f6f86")
        style.configure("HeroTitle.TLabel", background="#ffffff", foreground="#10233f", font=("Microsoft YaHei UI", 18, "bold"))
        style.configure("Wordmark.TLabel", background="#ffffff", foreground="#00aeff", font=("Microsoft YaHei UI", 11, "bold"))
        style.configure("Version.TLabel", background="#ffffff", foreground="#7f8b99", font=("Microsoft YaHei UI", 9))
        style.configure("SectionTitle.TLabel", background="#ffffff", foreground="#10233f", font=("Microsoft YaHei UI", 10, "bold"))
        style.configure("Primary.TButton", padding=(22, 14), font=("Microsoft YaHei UI", 11, "bold"))
        style.configure("Treeview", rowheight=42, fieldbackground="#ffffff", background="#ffffff", foreground="#172033", borderwidth=0)
        style.configure("Treeview.Heading", background="#eef3fb", foreground="#31435f", relief="flat", padding=(8, 8))
        style.map("Treeview", background=[("selected", "#dceaff")], foreground=[("selected", "#0e223d")])

    def _build_ui(self) -> None:
        self.columnconfigure(0, weight=1)
        self.rowconfigure(0, weight=1)
        self.rowconfigure(1, weight=0)

        shell = ttk.Frame(self, style="Topbar.TFrame")
        shell.grid(row=0, column=0, sticky="nsew")
        shell.columnconfigure(0, weight=1)
        shell.rowconfigure(1, weight=1)

        topbar = ttk.Frame(shell, padding=(24, 12), style="Topbar.TFrame")
        topbar.grid(row=0, column=0, sticky="ew")
        topbar.columnconfigure(0, weight=1)
        wordmark = ttk.Frame(topbar, style="Topbar.TFrame")
        wordmark.grid(row=0, column=0, sticky="w")
        ttk.Label(wordmark, text="YiboBattleSwitch", style="Wordmark.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(wordmark, text="| v0.1", style="Version.TLabel").grid(row=0, column=1, sticky="w", padx=(8, 0))
        ttk.Button(topbar, text="关于", command=self.show_about_dialog).grid(row=0, column=1, sticky="e")

        outer = ttk.Frame(shell, padding=18, style="Card.TFrame")
        outer.grid(row=0, column=0, sticky="nsew")
        outer.columnconfigure(0, weight=1)
        outer.rowconfigure(2, weight=1)
        shell.rowconfigure(0, weight=0)
        shell.rowconfigure(1, weight=1)
        outer.grid_configure(row=1, column=0)

        header = ttk.Frame(outer, padding=18, style="Card.TFrame")
        header.grid(row=0, column=0, sticky="ew")
        header.columnconfigure(0, weight=1)

        title_box = ttk.Frame(header, style="Card.TFrame")
        title_box.grid(row=0, column=0, sticky="w")
        ttk.Label(title_box, text="暴雪战网Battle.net切换工具", style="HeroTitle.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(
            title_box,
            text="保存当前登录，选择账号并点击切换。",
            style="Muted.TLabel",
            wraplength=760,
            justify="left",
        ).grid(row=1, column=0, sticky="w", pady=(8, 0))

        game_dir_card = ttk.LabelFrame(outer, text="游戏目录", padding=16, style="Card.TLabelframe")
        game_dir_card.grid(row=1, column=0, sticky="ew", pady=(12, 0))
        game_dir_card.columnconfigure(0, weight=1)
        game_dir_card.columnconfigure(1, weight=0)
        game_dir_card.columnconfigure(2, weight=0)
        game_dir_card.columnconfigure(3, weight=0)
        self.game_dir_entry = ttk.Entry(game_dir_card, textvariable=self.game_dir_var)
        self.game_dir_entry.grid(row=0, column=0, sticky="ew")
        self.game_dir_entry.configure(state="readonly")
        self.game_dir_entry.bind("<FocusOut>", lambda _event: self._persist_game_directory())
        ttk.Button(game_dir_card, text="自动搜索", command=self.auto_detect_game_directory).grid(row=0, column=1, padx=(10, 8))
        ttk.Button(game_dir_card, text="手动选择", command=self.select_game_directory).grid(row=0, column=2, padx=(0, 8))
        ttk.Button(game_dir_card, text="打开目录", command=self.open_game_directory).grid(row=0, column=3)
        ttk.Label(
            game_dir_card,
            text="用于定位当前 WoW 安装目录，也是账号库备份输出位置。",
            style="Muted.TLabel",
        ).grid(row=1, column=0, columnspan=4, sticky="w", pady=(8, 0))

        library_card = ttk.LabelFrame(outer, text="账号库", padding=16, style="Card.TLabelframe")
        library_card.grid(row=2, column=0, sticky="nsew", pady=(12, 0))
        library_card.columnconfigure(0, weight=1)
        library_card.rowconfigure(1, weight=1)

        ttk.Label(library_card, textvariable=self.current_summary_var, style="Muted.TLabel", wraplength=1040, justify="left").grid(
            row=0, column=0, sticky="w"
        )

        columns = ("masked_email", "desc", "backup")
        self.tree = ttk.Treeview(library_card, columns=columns, show="headings", selectmode="browse")
        self.tree.heading("masked_email", text="账号")
        self.tree.heading("desc", text="备注")
        self.tree.heading("backup", text="最近保存")
        self.tree.column("masked_email", width=340, anchor="w")
        self.tree.column("desc", width=220, anchor="w")
        self.tree.column("backup", width=220, anchor="w")
        self.tree.grid(row=1, column=0, sticky="nsew", pady=(12, 0))
        self.tree.bind("<<TreeviewSelect>>", self.on_select_account)
        left_scroll = ttk.Scrollbar(library_card, orient="vertical", command=self.tree.yview)
        left_scroll.grid(row=1, column=1, sticky="ns", pady=(12, 0))
        self.tree.configure(yscrollcommand=left_scroll.set)

        actions = ttk.Frame(library_card, style="Card.TFrame")
        actions.grid(row=2, column=0, sticky="ew", pady=(14, 0))
        actions.columnconfigure(0, weight=1)

        row_one = ttk.Frame(actions, style="Card.TFrame")
        row_one.grid(row=0, column=0, sticky="ew")
        row_one.columnconfigure(8, weight=1)
        ttk.Button(row_one, text="切换到此账号", style="Primary.TButton", command=self.switch_to_selected_account).grid(row=0, column=0, padx=(0, 10))
        ttk.Button(row_one, text="保存当前登录", command=self.save_current_as_account).grid(row=0, column=1, padx=(0, 8))
        ttk.Button(row_one, text="备份库", command=self.backup_account_library).grid(row=0, column=2, padx=(0, 8))
        ttk.Button(row_one, text="导入库", command=self.import_library).grid(row=0, column=3, padx=(0, 12))
        ttk.Button(row_one, text="上移", command=lambda: self.move_selected_account(-1)).grid(row=0, column=4, padx=(0, 8))
        ttk.Button(row_one, text="下移", command=lambda: self.move_selected_account(1)).grid(row=0, column=5, padx=(0, 8))
        ttk.Button(row_one, text="修改备注", command=self.edit_selected_account_note).grid(row=0, column=6, padx=(0, 8))
        ttk.Button(row_one, text="删除选中账号", command=self.delete_selected_account).grid(row=0, column=7)

        row_two = ttk.Frame(actions, style="Card.TFrame")
        row_two.grid(row=1, column=0, sticky="w", pady=(10, 0))
        ttk.Button(row_two, text="刷新", command=self.refresh_all).grid(row=0, column=0, padx=(0, 8))
        ttk.Button(row_two, textvariable=self.debug_toggle_var, command=self.toggle_debug_panel).grid(row=0, column=1)

        self.debug_frame = ttk.LabelFrame(outer, text="调试", padding=16, style="Card.TLabelframe")
        self.debug_frame.grid(row=3, column=0, sticky="ew", pady=(12, 0))
        self.debug_frame.columnconfigure(0, weight=1)
        self.debug_frame.columnconfigure(1, weight=1)
        self.debug_frame.rowconfigure(1, weight=1)

        ttk.Label(self.debug_frame, text="当前选中账号信息、日志和认证项统一收在这里。", style="Muted.TLabel").grid(
            row=0, column=0, columnspan=2, sticky="w"
        )

        left_debug = ttk.Frame(self.debug_frame, style="Card.TFrame")
        left_debug.grid(row=1, column=0, sticky="nsew", pady=(12, 0), padx=(0, 8))
        left_debug.columnconfigure(0, weight=1)
        left_debug.rowconfigure(1, weight=1)
        ttk.Label(left_debug, text="调试信息", style="SectionTitle.TLabel").grid(row=0, column=0, sticky="w")
        self.detail_text = tk.Text(left_debug, height=10, wrap="word", bd=0, bg="#f8fbff", fg="#172033")
        self.detail_text.grid(row=1, column=0, sticky="nsew", pady=(8, 8))
        self.auth_text = tk.Text(left_debug, height=7, wrap="word", bd=0, bg="#f8fbff", fg="#172033")
        self.auth_text.grid(row=2, column=0, sticky="ew")

        right_debug = ttk.Frame(self.debug_frame, style="Card.TFrame")
        right_debug.grid(row=1, column=1, sticky="nsew", pady=(12, 0), padx=(8, 0))
        right_debug.columnconfigure(0, weight=1)
        right_debug.rowconfigure(1, weight=1)
        ttk.Label(right_debug, text="日志", style="SectionTitle.TLabel").grid(row=0, column=0, sticky="w")
        self.log_text = tk.Text(right_debug, height=18, wrap="word", bd=0, bg="#f8fbff", fg="#172033")
        self.log_text.grid(row=1, column=0, sticky="nsew", pady=(8, 12))

        debug_actions = ttk.Frame(right_debug, style="Card.TFrame")
        debug_actions.grid(row=2, column=0, sticky="ew")
        ttk.Button(debug_actions, text="恢复最近一次备份", command=self.restore_latest_backup).grid(row=0, column=0, padx=(0, 8), pady=(0, 8))
        ttk.Button(debug_actions, text="导入 NewBeeBox", command=self.import_from_newbeebox).grid(row=0, column=1, padx=(0, 8), pady=(0, 8))
        ttk.Button(debug_actions, text="打开账号库目录", command=self.open_library_dir).grid(row=0, column=2, pady=(0, 8))
        ttk.Button(debug_actions, text="备份当前状态", command=self.backup_current_state).grid(row=1, column=0, padx=(0, 8))
        ttk.Button(debug_actions, text="诊断快照", command=self.capture_diagnostic_snapshot).grid(row=1, column=1, padx=(0, 8))
        ttk.Button(debug_actions, text="比较最近两次诊断", command=self.compare_latest_diagnostics).grid(row=1, column=2)
        ttk.Button(debug_actions, text="仅恢复配置", command=self.restore_selected_account_config).grid(row=2, column=0, padx=(0, 8), pady=(8, 0))
        ttk.Button(debug_actions, text="仅恢复认证", command=self.restore_selected_account_unifiedauth).grid(row=2, column=1, padx=(0, 8), pady=(8, 0))
        ttk.Button(debug_actions, text="打开备份目录", command=self.open_backup_dir).grid(row=2, column=2, pady=(8, 0))
        ttk.Button(debug_actions, text="以管理员重启本程序", command=self.relaunch_as_admin).grid(row=3, column=0, columnspan=3, sticky="w", pady=(8, 0))

        self.debug_frame.grid_remove()

        footer = ttk.Frame(shell, padding=(24, 10), style="Footer.TFrame")
        footer.grid(row=2, column=0, sticky="ew")
        footer.columnconfigure(0, weight=1)
        ttk.Label(
            footer,
            text="BattleSwitchLab © 2024 - Professional Utility",
            style="Version.TLabel",
        ).grid(row=0, column=0, sticky="w")
        footer_links = ttk.Frame(footer, style="Footer.TFrame")
        footer_links.grid(row=0, column=1, sticky="e")
        ttk.Button(footer_links, text="日志", command=self.show_debug_logs).grid(row=0, column=0, padx=(0, 8))
        ttk.Button(footer_links, text="调试", command=self.toggle_debug_panel).grid(row=0, column=1, padx=(0, 8))
        ttk.Button(footer_links, text="关于", command=self.show_about_dialog).grid(row=0, column=2)

        status = ttk.Label(self, textvariable=self.status_var, relief="sunken", anchor="w")
        status.grid(row=1, column=0, sticky="ew")

    def _persist_game_directory(self) -> None:
        set_saved_game_directory(self.game_dir_var.get())

    def show_about_dialog(self) -> None:
        about = tk.Toplevel(self)
        about.title("关于 YiboBattleSwitch")
        about.transient(self)
        about.grab_set()
        about.resizable(False, False)
        about.configure(bg="#f3f6fb")

        container = ttk.Frame(about, padding=18, style="Card.TFrame")
        container.grid(row=0, column=0, sticky="nsew")
        container.columnconfigure(0, weight=1)

        ttk.Label(container, text="YiboBattleSwitch", style="HeroTitle.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(
            container,
            text="Battle.net / WoW 多账号本地切换工具",
            style="Muted.TLabel",
        ).grid(row=1, column=0, sticky="w", pady=(6, 0))
        ttk.Label(
            container,
            text=(
                f"版本号：v{APP_VERSION}\n"
                f"账号库目录：{LIBRARY_DIR}\n"
                f"数据目录：{APP_DIR}\n\n"
                "请先确认游戏目录，再执行账号库备份或账号切换。"
            ),
            justify="left",
        ).grid(row=2, column=0, sticky="w", pady=(12, 0))
        ttk.Button(container, text="关闭", command=about.destroy).grid(row=3, column=0, sticky="e", pady=(16, 0))

    def auto_detect_game_directory(self) -> None:
        game_dir = detect_default_game_directory()
        if not game_dir:
            messagebox.showwarning("未找到目录", "暂时没有自动识别到 WoW 安装目录，请手动填写。")
            return
        self.game_dir_var.set(game_dir)
        self._persist_game_directory()
        self.log(f"已自动识别游戏目录: {game_dir}")

    def select_game_directory(self) -> None:
        selected_dir = filedialog.askdirectory(title="选择游戏目录")
        if not selected_dir:
            return
        self.game_dir_var.set(selected_dir)
        self._persist_game_directory()
        self.log(f"已手动设置游戏目录: {selected_dir}")

    def open_game_directory(self) -> None:
        game_dir = Path(self.game_dir_var.get().strip())
        if not game_dir.exists():
            messagebox.showwarning("目录不存在", "当前游戏目录不存在，请先确认路径。")
            return
        os.startfile(str(game_dir))

    def backup_account_library(self) -> None:
        output_dir_text = self.game_dir_var.get().strip()
        if not output_dir_text:
            messagebox.showwarning("未设置目录", "请先确认游戏目录，再执行账号库备份。")
            return
        output_dir = Path(output_dir_text)
        if not output_dir.exists():
            messagebox.showwarning("目录不存在", "当前游戏目录不存在，请先确认路径。")
            return
        try:
            archive_path = backup_account_library_to_directory(output_dir)
            self.log(f"已备份账号库到: {archive_path}")
            messagebox.showinfo("备份完成", f"账号库备份已生成：\n{archive_path}")
        except Exception as exc:
            self.log(f"备份账号库失败: {exc}")
            messagebox.showerror("备份失败", str(exc))

    def import_library(self) -> None:
        selected_dir = filedialog.askdirectory(title="选择要导入的账号库目录")
        if not selected_dir:
            return
        try:
            imported, updated = import_accounts_from_external_directory(Path(selected_dir))
            self.refresh_all()
            self.log(f"已导入外部账号库。新增 {imported}，更新 {updated}")
            messagebox.showinfo("导入完成", f"新增: {imported}\n更新: {updated}")
        except Exception as exc:
            self.log(f"导入外部账号库失败: {exc}")
            messagebox.showerror("导入失败", str(exc))

    def toggle_debug_panel(self) -> None:
        if self.debug_frame.winfo_ismapped():
            self.debug_frame.grid_remove()
            self.debug_toggle_var.set("展开调试")
        else:
            self.debug_frame.grid()
            self.debug_toggle_var.set("收起调试")

    def show_debug_logs(self) -> None:
        if not self.debug_frame.winfo_ismapped():
            self.debug_frame.grid()
            self.debug_toggle_var.set("收起调试")
        self.log_text.focus_set()

    def move_selected_account(self, offset: int) -> None:
        if not self.selected_account:
            messagebox.showwarning("未选择账号", "请先选择一个账号。")
            return
        current_index = next((idx for idx, account in enumerate(self.accounts) if account.email == self.selected_account.email), -1)
        if current_index < 0:
            return
        new_index = current_index + offset
        if new_index < 0 or new_index >= len(self.accounts):
            return
        self.accounts[current_index], self.accounts[new_index] = self.accounts[new_index], self.accounts[current_index]
        persist_current_account_order(self.accounts)
        selected_email = self.selected_account.email
        self.refresh_all(selected_email=selected_email)

    def edit_selected_account_note(self) -> None:
        if not self.selected_account:
            messagebox.showwarning("未选择账号", "请先选择要修改备注的账号。")
            return
        new_desc = simpledialog.askstring(
            "修改备注",
            "请输入新的备注：",
            initialvalue=self.selected_account.description or "",
        )
        if new_desc is None:
            return
        try:
            update_account_description(self.selected_account, new_desc.strip())
            self.refresh_all(selected_email=self.selected_account.email)
            self.log(f"已更新备注: {self.selected_account.email}")
        except Exception as exc:
            self.log(f"修改备注失败: {exc}")
            messagebox.showerror("修改失败", str(exc))

    def log(self, message: str) -> None:
        stamp = datetime.now().strftime("%H:%M:%S")
        self.log_text.insert("end", f"[{stamp}] {message}\n")
        self.log_text.see("end")
        self.status_var.set(message)

    def refresh_all(self, selected_email: str | None = None) -> None:
        previous_selection = selected_email or (self.selected_account.email if self.selected_account else "")
        self.accounts = sort_accounts_by_saved_order(load_accounts())
        persist_current_account_order(self.accounts)
        self.account_by_id.clear()
        for item in self.tree.get_children():
            self.tree.delete(item)
        for idx, account in enumerate(self.accounts):
            iid = f"acc-{idx}"
            self.account_by_id[iid] = account
            self.tree.insert(
                "",
                "end",
                iid=iid,
                values=(
                    mask_email(account.email),
                    account.description or "-",
                    format_ts_ms(account.backup_time),
                ),
            )
        current = read_current_state()
        external_count = count_external_accounts()
        privilege_label = "管理员" if is_running_as_admin() else "普通权限"
        saved_names = ", ".join(current["saved_account_names"]) if current["saved_account_names"] else "-"
        wow_game_accounts = ", ".join(current["wow_game_accounts"]) if current["wow_game_accounts"] else "-"
        self.current_summary_var.set(
            f"已保存 {len(self.accounts)} 个账号。当前 Battle.net 登录候选：{current['current_login_name'] or '-'}；"
            f"当前子账号：{current['game_account'] or '-'}；WoW 子账号：{wow_game_accounts}；"
            f"最近账号时间：{format_ts_s(current['account_ts'])}；可导入：{external_count}；权限：{privilege_label}。"
        )

        target_iid = ""
        if previous_selection:
            for iid, account in self.account_by_id.items():
                if account.email == previous_selection:
                    target_iid = iid
                    break
        if not target_iid and self.tree.get_children():
            target_iid = self.tree.get_children()[0]
        if target_iid:
            self.tree.selection_set(target_iid)
            self.tree.focus(target_iid)
            self.on_select_account()
        elif not self.accounts:
            self.selected_account = None
            self.detail_text.delete("1.0", "end")
            self.auth_text.delete("1.0", "end")
            self.detail_text.insert(
                "1.0",
                "当前账号库为空。\n\n"
                "如果你此前在 NewBeeBox 中保存过账号，可以在调试面板里点击“导入 NewBeeBox”。\n"
                "如果你当前已经正常登录 Battle.net，也可以直接点“保存当前登录为账号”。",
            )
            self.auth_text.insert("1.0", f"SavedAccountNames：{saved_names}\n认证项：{current['unifiedauth_count']}")
        self.log("已刷新本程序账号库与当前 Battle.net 状态")

    def on_select_account(self, _event=None) -> None:
        selection = self.tree.selection()
        if not selection:
            return
        account = self.account_by_id.get(selection[0])
        if not account:
            return
        self.selected_account = account
        self.detail_text.delete("1.0", "end")
        saved_account_names = extract_saved_account_names(account.battlenet_config_json)
        primary_login_name = pick_primary_login_name(account.battlenet_config_json, account.saved_account_name)
        snapshot_game_account = extract_snapshot_game_account(account.full_snapshot) or account.saved_account_name
        material_summary = []
        material_summary.append("配置快照" if account.battlenet_config_text else "无配置快照")
        material_summary.append("认证快照" if account.blob_map else "无认证快照")
        material_summary.append(
            f"Battle.net 文件 {len(account.battlenet_file_blobs)} 份" if account.battlenet_file_blobs else "无 Battle.net 文件快照"
        )
        material_summary.append(
            f"本地状态 {count_local_snapshot_files(account.full_snapshot)} 份"
            if count_local_snapshot_files(account.full_snapshot)
            else "无本地状态快照"
        )
        material_summary.append("完整快照" if account.full_snapshot else "无完整快照")
        material_summary.append(
            "可直接切换"
            if account.full_snapshot
            else "材料不完整"
        )
        details = [
            f"账号标识：{account.email}",
            f"备注：{account.description or '-'}",
            f"Battle.net 注册表子账号：{snapshot_game_account or '-'}",
            f"WoW 子账号列表（最近登录日志）：{', '.join(account.wow_game_accounts) if account.wow_game_accounts else '-'}",
            f"Battle.net 默认 WoW 子账号：{account.wow_selected_account or '-'}",
            f"WoW 子账号来源：{account.wow_capture_source or '-'}",
            f"WoW 来源版本：{account.wow_source_variant or '-'}",
            f"最近保存：{format_ts_ms(account.backup_time)}",
            f"最近登录：{format_ts_ms(account.last_login_time)}",
            f"Battle.net 登录名候选：{primary_login_name or '-'}",
            f"SavedAccountNames：{', '.join(saved_account_names) if saved_account_names else '-'}",
            f"可用材料：{' / '.join(material_summary)}",
            f"认证项数量：{len(account.blob_ids)}",
            f"完整快照：{'有' if account.full_snapshot else '无'}",
            f"本地状态快照文件数：{count_local_snapshot_files(account.full_snapshot)}",
            f"账号目录文件：{', '.join(sorted(p.name for p in account.folder.iterdir() if p.is_file()))}",
        ]
        self.detail_text.insert("1.0", "\n".join(details))
        auth_lines = [
            f"认证项数量：{len(account.blob_ids)}",
            f"认证项列表：{', '.join(account.blob_ids) if account.blob_ids else '-'}",
        ]
        self.auth_text.delete("1.0", "end")
        self.auth_text.insert("1.0", "\n".join(auth_lines))

    def import_from_newbeebox(self) -> None:
        try:
            imported, updated = import_accounts_from_newbeebox()
            self.refresh_all()
            self.log(f"已从 NewBeeBox 导入账号。新增 {imported}，更新 {updated}")
            messagebox.showinfo(
                "导入完成",
                f"已写入本程序账号库。\n\n新增: {imported}\n更新: {updated}",
            )
        except Exception as exc:
            self.log(f"导入失败: {exc}")
            messagebox.showerror("导入失败", str(exc))

    def save_current_as_account(self) -> None:
        current_web_token = read_reg_binary(REG_BNET_WOW, "WEB_TOKEN") or b""
        if not current_web_token:
            messagebox.showwarning("无法保存", "当前注册表中没有读取到 WoW\\WEB_TOKEN。")
            return
        current_game_account = read_reg_string(REG_BNET_WOW, "GAME_ACCOUNT")
        current_config_text = read_battlenet_config_text()
        current_config_json = read_battlenet_config_json()
        current_login_name = pick_primary_login_name(current_config_json, current_game_account)
        wow_game_accounts, wow_selected_account, wow_capture_source, wow_source_variant = detect_current_wow_game_accounts()
        wow_local_account_name, wow_local_candidates, wow_accounts_by_variant = detect_current_wow_local_account(
            current_login_name, current_game_account
        )
        current_unified_auth = read_reg_values(REG_BNET_UNIFIEDAUTH)
        blob_map = {
            blob_id: payload.get("value", "")
            for blob_id, payload in current_unified_auth.items()
            if payload.get("type") == winreg.REG_BINARY and payload.get("value")
        }
        if not blob_map:
            blob_map = {"WEB_TOKEN": base64.b64encode(current_web_token).decode("ascii")}
        suggested_name = current_login_name or f"manual-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        prompt = (
            "请输入账号名称或邮箱：\n\n"
            f"检测到 Battle.net 登录名候选: {current_login_name or '-'}\n"
            f"检测到 Battle.net 注册表子账号: {current_game_account or '-'}\n"
            f"检测到 WoW 子账号列表: {', '.join(wow_game_accounts) if wow_game_accounts else '-'}\n"
            f"检测到 Battle.net 默认 WoW 子账号: {wow_selected_account or '-'}\n"
            f"检测来源: {wow_capture_source or '-'}\n"
            "说明: 若这里仍为空，再考虑先进入一次 WoW 登录/角色界面。"
        )
        account_name = simpledialog.askstring("保存当前登录", prompt, initialvalue=suggested_name)
        if not account_name:
            return
        description = simpledialog.askstring("保存当前登录", "可选备注：", initialvalue="保存自当前 Battle.net 登录态") or ""
        target_folder = save_account_to_library(
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
            battlenet_file_blobs=read_battlenet_file_blobs(),
            full_snapshot=build_current_snapshot_payload(),
        )
        baseline_backup = save_snapshot(f"baseline-{slugify_account_name(account_name.strip())}")
        self.refresh_all()
        self.log(f"已将当前登录态保存到本程序账号库: {target_folder}")
        self.log(f"已同步创建当前登录态基线备份: {baseline_backup}")
        if wow_game_accounts:
            wow_capture_message = (
                f"WoW 子账号列表已捕获:\n{', '.join(wow_game_accounts)}\n\n"
                f"Battle.net 默认 WoW 子账号: {wow_selected_account or '-'}\n"
                f"检测来源: {wow_capture_source or '-'}"
            )
        else:
            wow_capture_message = (
                "本次未捕获到 WoW 子账号列表。\n\n"
                "Battle.net 日志和 WoW 日志里都没有可用结果。\n"
                "这时再尝试先进入一次 WoW 登录/角色界面，"
                "然后回到本程序重新执行“保存当前登录为账号”。"
            )
        messagebox.showinfo(
            "保存完成",
            f"账号库已保存到:\n{target_folder}\n\n"
            f"并已创建基线备份:\n{baseline_backup}\n\n"
            f"{wow_capture_message}",
        )

    def relaunch_as_admin(self) -> None:
        if is_running_as_admin():
            messagebox.showinfo("已是管理员", "当前程序已经在管理员权限下运行。")
            return
        try:
            if relaunch_current_script_as_admin():
                self.log("已请求以管理员权限重新启动本程序")
                self.destroy()
            else:
                raise RuntimeError("用户取消了 UAC 提权，或系统拒绝了管理员启动。")
        except Exception as exc:
            self.log(f"管理员重启失败: {exc}")
            messagebox.showerror("重启失败", str(exc))

    def delete_selected_account(self) -> None:
        if not self.selected_account:
            messagebox.showwarning("未选择账号", "请先选择要删除的账号。")
            return
        if self.selected_account.source != "library":
            messagebox.showwarning("无法删除", "当前仅允许删除本程序账号库中的账号。")
            return
        confirmed = messagebox.askyesno(
            "确认删除",
            f"将删除账号库中的账号：\n\n{self.selected_account.email}\n\n目录：\n{self.selected_account.folder}",
        )
        if not confirmed:
            return
        try:
            deleted_email = self.selected_account.email
            delete_account_from_library(self.selected_account)
            self.refresh_all()
            self.log(f"已删除账号库中的账号: {deleted_email}")
        except Exception as exc:
            self.log(f"删除账号失败: {exc}")
            messagebox.showerror("删除失败", str(exc))

    def backup_current_state(self) -> None:
        try:
            path = save_snapshot("manual-backup")
            self.log(f"已备份当前 Battle.net 状态到: {path}")
            messagebox.showinfo("备份完成", f"已保存到:\n{path}")
        except Exception as exc:
            self.log(f"备份失败: {exc}")
            messagebox.showerror("备份失败", str(exc))

    def capture_diagnostic_snapshot(self) -> None:
        label = simpledialog.askstring("诊断快照", "请输入快照标签：", initialvalue="manual-check")
        if not label:
            return
        try:
            path = save_diagnostic_snapshot(slugify_account_name(label))
            self.log(f"已保存诊断快照: {path}")
            messagebox.showinfo("诊断快照完成", f"已保存到:\n{path}")
        except Exception as exc:
            self.log(f"诊断快照失败: {exc}")
            messagebox.showerror("诊断快照失败", str(exc))

    def compare_latest_diagnostics(self) -> None:
        ensure_diagnostic_dir()
        snapshots = sorted(DIAGNOSTIC_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        if len(snapshots) < 2:
            messagebox.showwarning("快照不足", "至少需要两份诊断快照才能生成对比报告。")
            return
        after_path = snapshots[0]
        before_path = snapshots[1]
        try:
            report_path = write_snapshot_diff_report(before_path, after_path)
            self.log(f"已生成诊断对比报告: {report_path}")
            os.startfile(str(report_path))
            messagebox.showinfo(
                "对比完成",
                f"已生成报告：\n{report_path}\n\n比较对象：\n- before: {before_path.name}\n- after: {after_path.name}",
            )
        except Exception as exc:
            self.log(f"生成诊断对比报告失败: {exc}")
            messagebox.showerror("对比失败", str(exc))

    def prototype_switch(self) -> None:
        message = (
            "实验写回已暂停。\n\n"
            "原因：当前已确认无论是单独写回 WEB_TOKEN，还是整组写回 UnifiedAuth，"
            "都会导致 Battle.net 退出登录、认证失效，或进入错误状态。\n\n"
            "下一步建议：\n"
            "1. 先用“恢复最近一次备份”回退到可登录状态\n"
            "2. 再用“诊断快照”记录手动切号前后差异\n"
            "3. 等补齐 Battle.net.config 和完整认证链路后，再恢复写回实验"
        )
        self.log("已阻止实验写回：当前链路不完整，继续写回会破坏 Battle.net 登录态")
        messagebox.showwarning("实验已暂停", message)

    def _apply_account_materials(
        self,
        account: AccountEntry,
        *,
        include_config: bool,
        include_auth: bool,
        include_files: bool,
        include_full_snapshot: bool,
        backup_label: str,
        operation_name: str,
        rollback_on_failure: bool,
    ) -> None:
        backup_path = save_snapshot(backup_label)
        self.log(f"{operation_name}前已备份当前状态: {backup_path}")

        before_pids, remaining_pids = stop_battlenet_processes()
        if before_pids:
            self.log(f"{operation_name}前已关闭 Battle.net / Agent，命中进程: {', '.join(str(pid) for pid in before_pids)}")
        if remaining_pids:
            remaining_processes = find_battlenet_processes()
            reasons: list[str] = []
            if not is_running_as_admin():
                reasons.append("当前程序不是管理员权限，无法结束部分 Battle.net / Agent 进程。")
            reasons.append(f"仍存活进程: {summarize_battlenet_processes(remaining_processes)}")
            raise RuntimeError("无法安全执行操作。\n\n" + "\n".join(reasons))

        changed = False
        try:
            if include_full_snapshot and account.full_snapshot:
                restore_snapshot_payload(account.full_snapshot)
                self.log(f"已恢复 {account.email} 的完整账号快照")
                changed = True
            else:
                if include_files and account.battlenet_file_blobs:
                    write_battlenet_file_blobs(account.battlenet_file_blobs)
                    self.log(f"已写回 {account.email} 的 Battle.net 文件快照，共 {len(account.battlenet_file_blobs)} 个文件")
                    changed = True
                if include_config:
                    write_battlenet_config_text(account.battlenet_config_text)
                    self.log(f"已写回 {account.email} 的 Battle.net 配置")
                    changed = True
                if include_auth:
                    write_unifiedauth_blob_map(account.blob_map)
                    self.log(f"已写回 {account.email} 的认证状态，共 {len(account.blob_map)} 项")
                    changed = True
            self.launch_battlenet()
        except Exception:
            if rollback_on_failure and changed:
                try:
                    stop_battlenet_processes()
                    restore_snapshot(backup_path)
                    self.launch_battlenet()
                    self.log(f"{operation_name}失败，已自动回滚到操作前备份: {backup_path.name}")
                except Exception as rollback_exc:
                    self.log(f"{operation_name}失败，且自动回滚失败: {rollback_exc}")
            raise

    def switch_to_selected_account(self) -> None:
        if not self.selected_account:
            messagebox.showwarning("未选择账号", "请先选择一个账号。")
            return
        account = self.selected_account
        if not account.full_snapshot:
            messagebox.showwarning(
                "材料不完整",
                "这个账号缺少完整切换所需的完整健康快照。\n\n"
                "请先重新保存一次当前正常登录状态，或换一个材料完整的账号。",
            )
            return
        confirmed = messagebox.askyesno(
            "确认切换账号",
            f"将切换到：\n{account.email}\n\n"
            f"Battle.net 登录名候选：{pick_primary_login_name(account.battlenet_config_json, account.saved_account_name) or '-'}\n"
            f"Battle.net 注册表子账号：{extract_snapshot_game_account(account.full_snapshot) or account.saved_account_name or '-'}\n"
            f"WoW 子账号列表：{', '.join(account.wow_game_accounts) if account.wow_game_accounts else '-'}\n"
            "本操作会自动备份当前健康状态，关闭 Battle.net / Agent，"
            "恢复目标账号配置和认证，再重新启动 Battle.net。",
        )
        if not confirmed:
            return
        try:
            self._apply_account_materials(
                account,
                include_config=False,
                include_auth=False,
                include_files=False,
                include_full_snapshot=True,
                backup_label=f"before-switch-{slugify_account_name(account.email)}",
                operation_name="切换账号",
                rollback_on_failure=True,
            )
            self.refresh_all()
            messagebox.showinfo("切换已执行", f"已执行切换：\n{account.email}\n\n请观察 Battle.net 是否回到目标账号状态。")
        except Exception as exc:
            self.log(f"切换账号失败: {exc}")
            messagebox.showerror("切换失败", str(exc))

    def restore_selected_account_config(self) -> None:
        if not self.selected_account:
            messagebox.showwarning("未选择账号", "请先选择一个账号。")
            return
        account = self.selected_account
        if not account.battlenet_config_text:
            messagebox.showwarning(
                "缺少配置快照",
                "这个账号目录里还没有保存 `Battle.net.config` 快照。\n\n"
                "可先在目标登录态下点击“保存当前登录为账号”，再尝试恢复配置。",
            )
            return
        confirmed = messagebox.askyesno(
            "确认恢复账号配置",
            f"将把下列账号保存的 Battle.net.config 写回当前 Battle.net：\n\n"
            f"{account.email}\n\n"
            "本操作会先自动备份当前状态。\n"
            "如果勾选了“写回前强制关闭 Battle.net，并在确认退出后重新启动”，"
            "还会先关闭 Battle.net，再写回配置并重新启动。",
        )
        if not confirmed:
            return
        try:
            self._apply_account_materials(
                account,
                include_config=True,
                include_auth=False,
                include_files=False,
                include_full_snapshot=False,
                backup_label=f"before-config-restore-{slugify_account_name(account.email)}",
                operation_name="恢复账号配置",
                rollback_on_failure=False,
            )
            self.refresh_all()
            messagebox.showinfo(
                "恢复完成",
                f"已写回账号配置：\n{account.email}",
            )
        except Exception as exc:
            self.log(f"恢复账号配置失败: {exc}")
            messagebox.showerror("恢复失败", str(exc))

    def restore_selected_account_unifiedauth(self) -> None:
        if not self.selected_account:
            messagebox.showwarning("未选择账号", "请先选择一个账号。")
            return
        account = self.selected_account
        if not account.blob_map:
            messagebox.showwarning(
                "缺少认证快照",
                "这个账号目录里还没有保存 `UnifiedAuth` 二进制值快照。",
            )
            return
        confirmed = messagebox.askyesno(
            "确认恢复账号认证",
            f"将把下列账号保存的 UnifiedAuth 写回当前 Battle.net：\n\n"
            f"{account.email}\n\n"
            f"准备写回的 Blob 数: {len(account.blob_map)}\n"
            f"Blob 列表: {', '.join(account.blob_ids) if account.blob_ids else '-'}\n\n"
            "警告：当前实验已经验证，这一步很可能导致 Battle.net 进入离线、未登录或认证失效状态。\n\n"
            "本操作会先自动备份当前状态。\n"
            "如果勾选了“写回前强制关闭 Battle.net，并在确认退出后重新启动”，"
            "还会先关闭 Battle.net，再写回认证并重新启动。",
        )
        if not confirmed:
            return
        try:
            self._apply_account_materials(
                account,
                include_config=False,
                include_auth=True,
                include_files=False,
                include_full_snapshot=False,
                backup_label=f"before-auth-restore-{slugify_account_name(account.email)}",
                operation_name="恢复账号认证",
                rollback_on_failure=False,
            )
            self.refresh_all()
            messagebox.showinfo(
                "恢复完成",
                f"已写回账号认证：\n{account.email}\n\n"
                f"写回 Blob 数: {len(account.blob_map)}",
            )
        except Exception as exc:
            self.log(f"恢复账号认证失败: {exc}")
            messagebox.showerror("恢复失败", str(exc))

    def restore_latest_backup(self) -> None:
        ensure_backup_dir()
        backups = sorted(BACKUP_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not backups:
            messagebox.showwarning("没有备份", "备份目录里还没有任何快照。")
            return
        recommended = pick_recommended_backup(backups[:20])
        if not recommended:
            messagebox.showwarning("没有可用备份", "未能从备份目录中解析出可用快照。")
            return
        target_backup = recommended["path"]
        summary_text = (
            f"将恢复推荐备份：\n{target_backup.name}\n\n"
            f"UnifiedAuth 项数: {recommended['unifiedauth_count']}\n"
            f"UnifiedAuth 键: {', '.join(recommended['unifiedauth_keys']) if recommended['unifiedauth_keys'] else '-'}\n"
            f"SavedAccountNames: {', '.join(recommended['saved_account_names']) if recommended['saved_account_names'] else '-'}\n"
            f"GAME_ACCOUNT: {recommended['game_account'] or '-'}\n\n"
            f"Battle.net 文件快照数: {recommended['battle_net_file_count']}\n"
            f"Battle.net 本地状态快照数: {recommended['battle_net_local_count']}\n\n"
            "说明：这里不会盲目恢复“最新文件”，因为最新备份可能已经是损坏后的状态。"
        )
        confirmed = messagebox.askyesno("确认恢复备份", summary_text)
        if not confirmed:
            return
        try:
            before_pids, remaining_pids = stop_battlenet_processes()
            if before_pids:
                self.log(f"恢复备份前已关闭 Battle.net，命中进程: {', '.join(str(pid) for pid in before_pids)}")
            if remaining_pids:
                remaining_processes = find_battlenet_processes()
                reasons: list[str] = []
                if not is_running_as_admin():
                    reasons.append("当前程序不是管理员权限，无法结束部分 Battle.net / WoW 相关进程。")
                reasons.append(f"仍存活进程: {summarize_battlenet_processes(remaining_processes)}")
                raise RuntimeError("无法安全恢复备份。\n\n" + "\n".join(reasons))
            restore_snapshot(target_backup)
            self.log(
                f"已恢复推荐备份: {target_backup.name}，"
                f"UnifiedAuth 项数 {recommended['unifiedauth_count']}"
            )
            self.launch_battlenet()
            self.refresh_all()
            messagebox.showinfo("恢复完成", f"已恢复:\n{target_backup}")
        except Exception as exc:
            self.log(f"恢复失败: {exc}")
            messagebox.showerror("恢复失败", str(exc))

    def open_backup_dir(self) -> None:
        ensure_backup_dir()
        os.startfile(str(BACKUP_DIR))

    def open_library_dir(self) -> None:
        ensure_library_dir()
        os.startfile(str(LIBRARY_DIR))

    def launch_battlenet(self) -> None:
        if not BATTLE_NET_LAUNCHER.exists():
            messagebox.showerror("未找到战网启动器", f"找不到:\n{BATTLE_NET_LAUNCHER}")
            return
        try:
            subprocess.Popen([str(BATTLE_NET_LAUNCHER)])
            self.log("已启动 Battle.net Launcher")
        except Exception as exc:
            self.log(f"启动 Battle.net 失败: {exc}")
            messagebox.showerror("启动失败", str(exc))


def main() -> int:
    if tk is None:
        raise RuntimeError("当前环境缺少 tkinter，无法启动 Tk 界面。")
    if not is_running_as_admin():
        if relaunch_current_script_as_admin():
            return 0
        return 1
    app = App()
    app.mainloop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
