import { ipcMain, shell } from "electron";
import path from "node:path";
import { promises as fs } from "node:fs";
import { compareLatestDiagnostics } from "../../domain/diagnostics/compare-snapshots.js";
import { takeDiagnosticSnapshot } from "../../domain/diagnostics/take-snapshot.js";
import { importFromNewBeeBox } from "../../domain/account-switch/import-newbeebox.js";
import { saveCurrentAccount } from "../../domain/account-switch/save-current-account.js";
import { switchAccount } from "../../domain/account-switch/switch-account.js";
import { createBackup } from "../../domain/backup/create-backup.js";
import { restoreLatestBackup } from "../../domain/backup/restore-latest-backup.js";
import { launchBattleNet } from "../../infra/battlenet/battlenet-launcher.js";
import { backupAccountLibrary, importAccountLibrary } from "../../infra/storage/library-transfer.js";
import { deleteAccount, listAccounts, readAccountSnapshot, reorderAccounts, updateAccountDescription } from "../../infra/storage/account-library.js";
import { getSettings, updateSettings } from "../../infra/storage/app-config.js";
import { getAppPaths } from "../../infra/storage/app-paths.js";
import { fileExists } from "../../infra/system/fs.js";
import { logger } from "../../infra/system/logger.js";
import { IPC_CHANNELS, APP_NAME, APP_VERSION } from "../../shared/constants/app.js";
import { getAccountDisplayName } from "../../shared/account-display.js";
import { AppStateDto } from "../../shared/types/app.js";
import { selectDirectory, selectImportSource } from "../shell/dialogs.js";
import { closeMainWindow, getMainWindow, getWindowState, minimizeMainWindow, toggleMainWindowMaximize } from "../window/main-window.js";
import { refreshTrayMenu } from "../window/tray.js";
import { detectBattleNetLauncherPath, detectDefaultGameDirectory, normalizeInstallDirectory } from "../../infra/battlenet/battlenet-paths.js";
import { readBattleNetConfig } from "../../infra/battlenet/battlenet-config.js";
import { detectBattleNetAccountLabel } from "../../infra/battlenet/battlenet-account-label.js";
import { readCurrentBattleNetIdentity } from "../../infra/battlenet/battlenet-current-identity.js";
import { readBattleNetLocalState } from "../../infra/battlenet/battlenet-local-state.js";
import { readBattleNetRegistrySnapshot, readRegistrySummary } from "../../infra/battlenet/battlenet-registry.js";

function extractSavedAccountNames(configJson: unknown): string[] {
  if (!configJson || typeof configJson !== "object") {
    return [];
  }

  const client = (configJson as Record<string, unknown>).Client;
  if (!client || typeof client !== "object") {
    return [];
  }

  const saved = (client as Record<string, unknown>).SavedAccountNames;
  if (Array.isArray(saved)) {
    return saved
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  if (typeof saved === "string") {
    return saved
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function extractCurrentAccountHintFromConfig(configJson: unknown): string {
  if (!configJson || typeof configJson !== "object") {
    return "";
  }

  const client = (configJson as Record<string, unknown>).Client;
  if (client && typeof client === "object") {
    const lastLoginAccount = String((client as Record<string, unknown>).LastLoginAccount || "").trim();
    if (lastLoginAccount) {
      return lastLoginAccount;
    }
  }

  const savedAccountNames = extractSavedAccountNames(configJson);
  if (savedAccountNames.length === 1) {
    return savedAccountNames[0];
  }

  return "";
}

function getCurrentGameAccount(registrySummary: string[]): string {
  const gameAccountLine = registrySummary.find((line) => line.startsWith("GAME_ACCOUNT=")) || "";
  const gameAccount = gameAccountLine.slice("GAME_ACCOUNT=".length).trim();
  return gameAccount && gameAccount !== "-" ? gameAccount : "";
}

function hasExactUnifiedAuthMatch(
  left: Record<string, { value: string }>,
  right: Record<string, { value: string }>
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (!leftKeys.length || leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every((key, index) => key === rightKeys[index] && left[key]?.value === right[key]?.value);
}

async function resolveCurrentAccountHint(
  accounts: Awaited<ReturnType<typeof listAccounts>>,
  registrySummary: string[],
  configJson: unknown
): Promise<string> {
  const configHint = extractCurrentAccountHintFromConfig(configJson);
  const currentGameAccount = getCurrentGameAccount(registrySummary);
  const currentRegistry = await readBattleNetRegistrySnapshot();
  const currentIdentity = await readCurrentBattleNetIdentity();

  if (currentIdentity?.accountId) {
    for (const account of accounts) {
      const snapshot = await readAccountSnapshot(account.id);
      if (!snapshot) {
        continue;
      }
      if (snapshot.accountId && snapshot.accountId === currentIdentity.accountId) {
        return getAccountDisplayName(account);
      }
    }

    // 如果运行时已经识别到当前 Battle.net 身份，但本地账号库里还没有对应快照，
    // 优先展示运行时身份，避免再被旧的 UnifiedAuth 匹配误导成其他账号。
    if (currentIdentity.battleTag.trim()) {
      return currentIdentity.battleTag.trim();
    }
    return currentIdentity.accountId.trim();
  }

  for (const account of accounts) {
    const snapshot = await readAccountSnapshot(account.id);
    if (!snapshot) {
      continue;
    }
    if (hasExactUnifiedAuthMatch(snapshot.registry.unifiedAuth || {}, currentRegistry.unifiedAuth || {})) {
      return getAccountDisplayName(account);
    }
  }

  if (configHint && accounts.some((item) =>
    item.email.trim().toLowerCase() === configHint.trim().toLowerCase()
    || item.phone.trim().toLowerCase() === configHint.trim().toLowerCase()
  )) {
    for (const account of accounts) {
      if (
        account.email.trim().toLowerCase() !== configHint.trim().toLowerCase()
        && account.phone.trim().toLowerCase() !== configHint.trim().toLowerCase()
      ) {
        continue;
      }
      const snapshot = await readAccountSnapshot(account.id);
      const snapshotGameAccount = snapshot?.registry.wow.GAME_ACCOUNT?.value?.trim() || "";
      if (!snapshotGameAccount || !currentGameAccount || snapshotGameAccount === currentGameAccount) {
        return getAccountDisplayName(account);
      }
    }
  }

  return "";
}

async function resolveSettingsWithDetection() {
  const settings = await getSettings();
  const patch: Partial<Awaited<ReturnType<typeof getSettings>>> = {};

  if (!settings.battleNetLauncherPath) {
    const launcherPath = await detectBattleNetLauncherPath();
    if (launcherPath) {
      patch.battleNetLauncherPath = launcherPath;
    }
  }

  if (!settings.gameDirectory) {
    const gameDirectory = await detectDefaultGameDirectory();
    if (gameDirectory) {
      patch.gameDirectory = gameDirectory;
    }
  }

  if (!Object.keys(patch).length) {
    return settings;
  }

  const nextSettings = await updateSettings(patch);
  await logger.info(`Detected runtime paths: ${JSON.stringify(patch)}`);
  return nextSettings;
}

async function buildAppState(): Promise<AppStateDto> {
  const settings = await resolveSettingsWithDetection();
  const accounts = await listAccounts();
  const registrySummary = await readRegistrySummary();
  const launcherPath = settings.battleNetLauncherPath || await detectBattleNetLauncherPath();
  const config = await readBattleNetConfig();
  const savedAccountNames = extractSavedAccountNames(config.json);
  const currentIdentity = await readCurrentBattleNetIdentity();
  const currentBattleTagLabel = await detectBattleNetAccountLabel();
  const currentLocalFiles = await readBattleNetLocalState(currentIdentity?.accountId || "");
  const currentLocalFileCount = Object.keys(currentLocalFiles).length;
  const currentBrowserCacheFileCount = Object.keys(currentLocalFiles).filter((key) => key.startsWith("BrowserCaches\\")).length;
  const importableCount = await fs.readdir(path.join(process.env.APPDATA || "", "NewBeeBox", "battleCache"), { withFileTypes: true })
    .then((entries) => entries.filter((entry) => entry.isDirectory()).length)
    .catch(() => 0);

  return {
    appName: APP_NAME,
    version: APP_VERSION,
    gameDirectory: settings.gameDirectory,
    libraryDirectory: getAppPaths().libraryDir,
    dataDirectory: getAppPaths().userDataDir,
    currentLoginName: settings.battleNetLauncherPath || launcherPath ? "已检测到 Battle.net 环境" : "未检测到 Battle.net 环境",
    currentSavedAccountName: await resolveCurrentAccountHint(accounts, registrySummary, config.json),
    currentSavedAccountCandidates: savedAccountNames,
    currentGameAccount: registrySummary[0] || "-",
    currentBattleTag: currentBattleTagLabel || currentIdentity?.battleTag || "",
    currentAccountId: currentIdentity?.accountId || "",
    currentLocalFileCount,
    currentBrowserCacheFileCount,
    wowAccounts: registrySummary.slice(1),
    accountCount: accounts.length,
    importableCount,
    permissionLabel: "普通权限",
    accounts,
    logs: logger.getRecentLines()
  };
}

export function registerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.GET_APP_STATE, async () => buildAppState());
  ipcMain.handle(IPC_CHANNELS.LIST_ACCOUNTS, async () => listAccounts());
  ipcMain.handle(IPC_CHANNELS.REORDER_ACCOUNTS, async (_event, payload: { accountIds: string[] }) => {
    const updated = await reorderAccounts(payload.accountIds || []);
    const orderedIds = updated.map((item) => item.id);
    await refreshTrayMenu();
    await logger.info(`Accounts reordered: ${orderedIds.join(", ")}`);
    return { ok: true, message: "账号顺序已更新。", orderedIds };
  });
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, async () => getSettings());

  ipcMain.handle(IPC_CHANNELS.UPDATE_SETTINGS, async (_event, patch) => {
    const next = await updateSettings(patch);
    await logger.info(`Settings updated: ${JSON.stringify(patch)}`);
    return next;
  });

  ipcMain.handle(IPC_CHANNELS.SELECT_DIRECTORY, async (_event, defaultPath: string) => {
    const window = getMainWindow();
    if (!window) {
      return "";
    }
    return selectDirectory(window, defaultPath);
  });

  ipcMain.handle(IPC_CHANNELS.SELECT_IMPORT_SOURCE, async (_event, defaultPath: string) => {
    const window = getMainWindow();
    if (!window) {
      return "";
    }
    return selectImportSource(window, defaultPath);
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_DIRECTORY, async (_event, targetPath: string) => {
    await shell.openPath(targetPath);
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_EXTERNAL, async (_event, targetUrl: string) => {
    await shell.openExternal(targetUrl);
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_GET_STATE, async () => getWindowState());
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, async () => {
    minimizeMainWindow();
    return true;
  });
  ipcMain.handle(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE, async () => toggleMainWindowMaximize());
  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, async () => {
    closeMainWindow();
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.SAVE_CURRENT_ACCOUNT, async (_event, payload: { battleTag: string; email: string; phone: string; description: string }) => {
    const result = await saveCurrentAccount(payload);
    await refreshTrayMenu();
    await logger.info(result.message);
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.DELETE_ACCOUNT, async (_event, payload: { id: string }) => {
    await deleteAccount(payload.id);
    const result = { ok: true, message: "账号已删除。" };
    await refreshTrayMenu();
    await logger.info(result.message);
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.SWITCH_ACCOUNT, async (_event, payload: { accountId: string }) => {
    const result = await switchAccount(payload.accountId);
    await logger.info(result.message);
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.BACKUP_CURRENT_STATE, async () => {
    const filePath = await createBackup("manual");
    const result = { ok: true, message: `当前状态已备份：${filePath}` };
    await logger.info(result.message);
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.BACKUP_LIBRARY, async (_event, payload: { path: string }) => {
    const archivePath = await backupAccountLibrary(payload.path || getAppPaths().userDataDir);
    const result = { ok: true, message: `账号库已导出：${archivePath}` };
    await logger.info(result.message);
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.IMPORT_LIBRARY, async (_event, payload: { path: string }) => {
    const summary = await importAccountLibrary(payload.path);
    const result = { ok: true, message: `账号库已导入。新增 ${summary.imported}，更新 ${summary.updated}` };
    await refreshTrayMenu();
    await logger.info(result.message);
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.CLEAR_LOGS, async () => {
    const clearedPaths = await logger.clear();
    return {
      ok: true,
      message: clearedPaths.length ? `日志已清空：${clearedPaths.join("、")}` : "日志已清空。",
      clearedPaths
    };
  });

  ipcMain.handle(IPC_CHANNELS.RESTORE_LATEST_BACKUP, async () => {
    const result = await restoreLatestBackup();
    await logger.info(result.message);
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.IMPORT_FROM_NEWBEEBOX, async () => {
    const result = await importFromNewBeeBox();
    await refreshTrayMenu();
    await logger.info(result.message);
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.TAKE_DIAGNOSTIC_SNAPSHOT, async (_event, payload: { label: string }) => {
    const result = await takeDiagnosticSnapshot(payload.label);
    await logger.info(result.message);
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.COMPARE_LATEST_DIAGNOSTICS, async () => {
    const result = await compareLatestDiagnostics();
    await logger.info(result.message);
    return result;
  });

  ipcMain.handle("launcher:auto-detect", async () => {
    const [launcherPath, gameDirectory] = await Promise.all([
      detectBattleNetLauncherPath(),
      detectDefaultGameDirectory()
    ]);
    if (!launcherPath && !gameDirectory) {
      return { ok: false, message: "未识别到 Battle.net / WoW 安装目录。", launcherPath: "" };
    }
    await updateSettings({
      battleNetLauncherPath: launcherPath,
      gameDirectory: gameDirectory || path.dirname(launcherPath)
    });
    return { ok: true, message: `已识别安装环境：${gameDirectory || path.dirname(launcherPath)}`, launcherPath };
  });

  ipcMain.handle("launcher:open", async () => {
    const launcherPath = await launchBattleNet();
    const result = { ok: true, message: `已启动 Battle.net：${launcherPath}` };
    await logger.info(result.message);
    return result;
  });

  ipcMain.handle("account:update-note", async (_event, payload: { id: string; description: string }) => {
    const record = await updateAccountDescription(payload.id, payload.description);
    const result = record
      ? { ok: true, message: `已更新备注：${getAccountDisplayName(record)}` }
      : { ok: false, message: "未找到要更新的账号。" };
    if (record) {
      await refreshTrayMenu();
    }
    await logger.info(result.message);
    return result;
  });

  ipcMain.handle("settings:set-game-dir", async (_event, payload: { path: string }) => {
    const normalized = normalizeInstallDirectory(payload.path || "");
    if (normalized && !(await fileExists(normalized))) {
      throw new Error("目录不存在，请确认路径。");
    }
    const settings = await updateSettings({ gameDirectory: normalized });
    await logger.info(`Game directory updated: ${settings.gameDirectory}`);
    return settings;
  });
}
