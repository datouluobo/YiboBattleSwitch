import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/constants/app.js";
import { AppSettings } from "../shared/types/app.js";

const api = {
  getAppState: () => ipcRenderer.invoke(IPC_CHANNELS.GET_APP_STATE),
  listAccounts: () => ipcRenderer.invoke(IPC_CHANNELS.LIST_ACCOUNTS),
  switchAccount: (accountId: string) => ipcRenderer.invoke(IPC_CHANNELS.SWITCH_ACCOUNT, { accountId }),
  reorderAccounts: (accountIds: string[]) => ipcRenderer.invoke(IPC_CHANNELS.REORDER_ACCOUNTS, { accountIds }),
  saveCurrentAccount: (payload: { battleTag: string; email: string; phone: string; description: string }) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_CURRENT_ACCOUNT, payload),
  updateAccountNote: (id: string, description: string) => ipcRenderer.invoke("account:update-note", { id, description }),
  deleteAccount: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_ACCOUNT, { id }),
  backupLibrary: (targetPath: string) => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_LIBRARY, { path: targetPath }),
  importLibrary: (sourcePath: string) => ipcRenderer.invoke(IPC_CHANNELS.IMPORT_LIBRARY, { path: sourcePath }),
  backupCurrentState: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_CURRENT_STATE),
  restoreLatestBackup: () => ipcRenderer.invoke(IPC_CHANNELS.RESTORE_LATEST_BACKUP),
  importFromNewBeeBox: () => ipcRenderer.invoke(IPC_CHANNELS.IMPORT_FROM_NEWBEEBOX),
  openDirectory: (targetPath: string) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_DIRECTORY, targetPath),
  openExternal: (targetUrl: string) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_EXTERNAL, targetUrl),
  getWindowState: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_GET_STATE),
  minimizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
  toggleMaximizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE),
  closeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
  selectDirectory: (defaultPath = "") => ipcRenderer.invoke(IPC_CHANNELS.SELECT_DIRECTORY, defaultPath),
  selectImportSource: (defaultPath = "") => ipcRenderer.invoke(IPC_CHANNELS.SELECT_IMPORT_SOURCE, defaultPath),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),
  updateSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SETTINGS, patch),
  clearLogs: () => ipcRenderer.invoke(IPC_CHANNELS.CLEAR_LOGS),
  setGameDirectory: (targetPath: string) => ipcRenderer.invoke("settings:set-game-dir", { path: targetPath }),
  takeDiagnosticSnapshot: (label: string) => ipcRenderer.invoke(IPC_CHANNELS.TAKE_DIAGNOSTIC_SNAPSHOT, { label }),
  compareLatestDiagnostics: () => ipcRenderer.invoke(IPC_CHANNELS.COMPARE_LATEST_DIAGNOSTICS),
  autoDetectLauncher: () => ipcRenderer.invoke("launcher:auto-detect"),
  openLauncher: () => ipcRenderer.invoke("launcher:open")
};

contextBridge.exposeInMainWorld("api", api);

declare global {
  interface Window {
    api: typeof api;
  }
}
