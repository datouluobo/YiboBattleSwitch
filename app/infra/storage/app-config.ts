import { app } from "electron";
import { AppSettings } from "../../shared/types/app.js";
import { readJsonFile, writeJsonFile } from "../system/fs.js";
import { getAppPaths } from "./app-paths.js";

const DEFAULT_WINDOW_BOUNDS = {
  width: 1440,
  height: 960
};

const DEFAULT_SETTINGS: AppSettings = {
  gameDirectory: "",
  battleNetLauncherPath: "",
  wowDirectory: "",
  battleNetSwitchProfile: "D",
  minimizeToTrayOnClose: false,
  launchAtLogin: false,
  minimizeOnLaunch: false,
  skipSwitchConfirm: false,
  revealedAccountIds: [],
  lastSelectedAccountId: "",
  windowBounds: DEFAULT_WINDOW_BOUNDS
};

let cachedSettings: AppSettings = { ...DEFAULT_SETTINGS };

export async function getSettings(): Promise<AppSettings> {
  const paths = getAppPaths();
  const stored = await readJsonFile<Partial<AppSettings>>(paths.settingsFile, DEFAULT_SETTINGS);
  const normalizedSwitchProfile = stored.battleNetSwitchProfile === "N" || stored.battleNetSwitchProfile === "D" || stored.battleNetSwitchProfile === "M"
    ? stored.battleNetSwitchProfile
    : DEFAULT_SETTINGS.battleNetSwitchProfile;
  cachedSettings = {
    ...DEFAULT_SETTINGS,
    ...stored,
    battleNetSwitchProfile: normalizedSwitchProfile,
    revealedAccountIds: Array.isArray(stored.revealedAccountIds) ? stored.revealedAccountIds : [],
    windowBounds: {
      width: stored.windowBounds?.width ?? DEFAULT_WINDOW_BOUNDS.width,
      height: stored.windowBounds?.height ?? DEFAULT_WINDOW_BOUNDS.height
    }
  };
  return cachedSettings;
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = {
    ...(await getSettings()),
    ...patch
  };

  await writeJsonFile(getAppPaths().settingsFile, next);
  cachedSettings = next;

  if (typeof patch.launchAtLogin === "boolean") {
    app.setLoginItemSettings({
      openAtLogin: patch.launchAtLogin,
      openAsHidden: next.minimizeOnLaunch
    });
  } else if (typeof patch.minimizeOnLaunch === "boolean") {
    app.setLoginItemSettings({
      openAtLogin: next.launchAtLogin,
      openAsHidden: patch.minimizeOnLaunch
    });
  }

  return next;
}

export function getCachedSettings(): AppSettings {
  return cachedSettings;
}
