export interface RendererOperationResult {
  ok: boolean;
  message: string;
  failureReason?: string;
}

export interface RendererWindowState {
  isMaximized: boolean;
}

export interface RendererAppSettings {
  gameDirectory: string;
  battleNetLauncherPath: string;
  wowDirectory: string;
  battleNetSwitchProfile: "N" | "D" | "M" | "W";
  minimizeToTrayOnClose: boolean;
  launchAtLogin: boolean;
  minimizeOnLaunch: boolean;
  skipSwitchConfirm: boolean;
  revealedAccountIds?: string[];
  lastSelectedAccountId: string;
  windowBounds?: {
    width: number;
    height: number;
  };
}

export interface DesktopApi {
  getAppState: () => Promise<unknown>;
  listAccounts: () => Promise<unknown>;
  switchAccount: (accountId: string) => Promise<RendererOperationResult>;
  reorderAccounts: (accountIds: string[]) => Promise<RendererOperationResult & { orderedIds: string[] }>;
  saveCurrentAccount: (payload: { battleTag: string; email: string; phone: string; description: string }) => Promise<RendererOperationResult>;
  updateAccountNote: (id: string, description: string) => Promise<RendererOperationResult>;
  deleteAccount: (id: string) => Promise<RendererOperationResult>;
  backupLibrary: (targetPath: string) => Promise<RendererOperationResult>;
  importLibrary: (sourcePath: string) => Promise<RendererOperationResult>;
  backupCurrentState: () => Promise<RendererOperationResult>;
  restoreLatestBackup: () => Promise<RendererOperationResult>;
  importFromNewBeeBox: () => Promise<RendererOperationResult>;
  openDirectory: (targetPath: string) => Promise<unknown>;
  openExternal: (targetUrl: string) => Promise<unknown>;
  getWindowState: () => Promise<RendererWindowState>;
  minimizeWindow: () => Promise<unknown>;
  toggleMaximizeWindow: () => Promise<RendererWindowState>;
  closeWindow: () => Promise<unknown>;
  selectDirectory: (defaultPath?: string) => Promise<string>;
  selectImportSource: (defaultPath?: string) => Promise<string>;
  getSettings: () => Promise<RendererAppSettings>;
  updateSettings: (patch: Record<string, unknown>) => Promise<RendererAppSettings>;
  clearLogs: () => Promise<RendererOperationResult & { clearedPaths?: string[] }>;
  setGameDirectory: (targetPath: string) => Promise<RendererAppSettings>;
  takeDiagnosticSnapshot: (label: string) => Promise<RendererOperationResult>;
  compareLatestDiagnostics: () => Promise<RendererOperationResult>;
  autoDetectLauncher: () => Promise<{ ok: boolean; message: string; launcherPath: string }>;
  openLauncher: () => Promise<RendererOperationResult>;
}
