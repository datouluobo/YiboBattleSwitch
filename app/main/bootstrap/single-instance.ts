import { app } from "electron";
import { showMainWindow } from "../window/main-window.js";

export function ensureSingleInstance(): boolean {
  const lock = app.requestSingleInstanceLock();
  if (!lock) {
    app.quit();
    return false;
  }

  app.on("second-instance", () => {
    void showMainWindow();
  });

  return true;
}
