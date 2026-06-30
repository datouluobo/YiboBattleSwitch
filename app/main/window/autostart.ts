import { app } from "electron";

export function syncLaunchAtLogin(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled
  });
}
