export const APP_NAME = "YiboBattleSwitch";
export const APP_VERSION = "0.4.2";

export const IPC_CHANNELS = {
  GET_APP_STATE: "app:get-state",
  LIST_ACCOUNTS: "account:list",
  SWITCH_ACCOUNT: "account:switch",
  REORDER_ACCOUNTS: "account:reorder",
  SAVE_CURRENT_ACCOUNT: "account:save-current",
  DELETE_ACCOUNT: "account:delete",
  BACKUP_LIBRARY: "backup:library",
  IMPORT_LIBRARY: "library:import",
  BACKUP_CURRENT_STATE: "backup:current-state",
  RESTORE_LATEST_BACKUP: "backup:restore-latest",
  IMPORT_FROM_NEWBEEBOX: "import:newbeebox",
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
