import { app } from "electron";
import path from "node:path";
import { registerIpc } from "../ipc/register-ipc.js";
import { initializeStorage } from "../../infra/storage/migration.js";
import { getAppPaths } from "../../infra/storage/app-paths.js";
import { logger } from "../../infra/system/logger.js";
import { APP_NAME } from "../../shared/constants/app.js";
import { ensureSingleInstance } from "./single-instance.js";
import { createMainWindow, setStartHiddenOnLaunch, showMainWindow } from "../window/main-window.js";
import { createTray } from "../window/tray.js";
import { getSettings } from "../../infra/storage/app-config.js";

async function bootstrap(): Promise<void> {
  if (!ensureSingleInstance()) {
    return;
  }

  app.setName(APP_NAME);
  app.setPath("userData", path.join(app.getPath("appData"), APP_NAME));
  await app.whenReady();
  await initializeStorage();
  await logger.initialize(getAppPaths().logsDir);
  await logger.info("App bootstrapping");
  registerIpc();
  const settings = await getSettings();
  app.setLoginItemSettings({
    openAtLogin: settings.launchAtLogin,
    openAsHidden: settings.minimizeOnLaunch
  });
  setStartHiddenOnLaunch(settings.minimizeOnLaunch);
  await createMainWindow();
  await createTray();

  app.on("activate", async () => {
    await showMainWindow();
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}

void bootstrap().catch(async (error) => {
  console.error(error);
  await logger.error(`Bootstrap failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  app.exit(1);
});
