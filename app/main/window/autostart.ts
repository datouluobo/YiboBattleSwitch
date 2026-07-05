import { app } from "electron";

interface LaunchAtLoginOptions {
  enabled: boolean;
  openAsHidden?: boolean;
}

export function applyLaunchAtLoginSettings({ enabled, openAsHidden = false }: LaunchAtLoginOptions): void {
  if (process.platform !== "win32") {
    return;
  }

  // In development, process.execPath points to Electron itself. Registering that
  // would leave a stale "electron.app.Electron" startup item on the machine.
  if (!app.isPackaged) {
    return;
  }

  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden,
    path: process.execPath,
    args: []
  });
}

export function syncLaunchAtLogin(enabled: boolean): void {
  applyLaunchAtLoginSettings({
    enabled
  });
}
