export const APP_NAME = "YiboBattleSwitch";
export const APP_VERSION = "0.5.0";
export const APP_REPOSITORY_URL = "https://github.com/datouluobo/YiboBattleSwitch";
export const APP_EULA_URL = "https://github.com/datouluobo/YiboBattleSwitch/blob/main/docs/EULA.md";
export const APP_THIRD_PARTY_NOTICES_URL = "https://github.com/datouluobo/YiboBattleSwitch/blob/main/THIRD-PARTY-NOTICES.txt";
export const APP_PRIVACY_POLICY_URL = "https://gist.github.com/datouluobo/822ce73cef378c7235c48d6c8b265fa5";
export const APP_PLUGIN_ALTO_BOSS_URL = "https://github.com/datouluobo/YiboAltoBoss";
export const APP_PLUGIN_BEAST_PATHS_URL = "https://github.com/datouluobo/YiboBeastPaths";
export const APP_PLUGIN_QUEST_BLOCKER_URL = "https://github.com/datouluobo/YiboQuestBlocker";

export const ALLOWED_EXTERNAL_URLS = [
  APP_REPOSITORY_URL,
  APP_EULA_URL,
  APP_THIRD_PARTY_NOTICES_URL,
  APP_PRIVACY_POLICY_URL,
  APP_PLUGIN_ALTO_BOSS_URL,
  APP_PLUGIN_BEAST_PATHS_URL,
  APP_PLUGIN_QUEST_BLOCKER_URL
] as const;

export function isAllowedExternalUrl(targetUrl: string): boolean {
  try {
    const normalized = new URL(targetUrl).toString();
    return ALLOWED_EXTERNAL_URLS.includes(normalized as typeof ALLOWED_EXTERNAL_URLS[number]);
  } catch {
    return false;
  }
}

export const IPC_CHANNELS = {
  GET_APP_STATE: "app:get-state",
  LIST_ACCOUNTS: "account:list",
  SWITCH_ACCOUNT: "account:switch",
  REORDER_ACCOUNTS: "account:reorder",
  SAVE_CURRENT_ACCOUNT: "account:save-current",
  DELETE_ACCOUNT: "account:delete",
  BACKUP_LIBRARY: "backup:library",
  CREATE_AUTO_BACKUP: "backup:auto-create",
  IMPORT_LIBRARY: "library:import",
  BACKUP_CURRENT_STATE: "backup:current-state",
  RESTORE_LATEST_BACKUP: "backup:restore-latest",
  OPEN_DIRECTORY: "shell:open-directory",
  SELECT_DIRECTORY: "shell:select-directory",
  SELECT_IMPORT_SOURCE: "shell:select-import-source",
  GET_SETTINGS: "settings:get",
  UPDATE_SETTINGS: "settings:update",
  CLEAR_LOGS: "logs:clear",
  OPEN_EXTERNAL: "shell:open-external",
  WINDOW_GET_STATE: "window:get-state",
  WINDOW_MINIMIZE: "window:minimize",
  WINDOW_TOGGLE_MAXIMIZE: "window:toggle-maximize",
  WINDOW_CLOSE: "window:close",
  TAKE_DIAGNOSTIC_SNAPSHOT: "diagnostic:take-snapshot",
  COMPARE_LATEST_DIAGNOSTICS: "diagnostic:compare-latest"
} as const;

export const PROCESS_IMAGE_NAMES = [
  "Battle.net.exe",
  "Battle.net Launcher.exe",
  "Agent.exe"
];
