import { BrowserWindow, app, shell } from "electron";
import { getCachedSettings, getSettings, updateSettings } from "../../infra/storage/app-config.js";
import { logger } from "../../infra/system/logger.js";
import { resolveAppPath } from "../bootstrap/paths.js";

let mainWindow: BrowserWindow | null = null;
let startHiddenOnLaunch = false;

export function setStartHiddenOnLaunch(value: boolean): void {
  startHiddenOnLaunch = value;
}

export async function createMainWindow(): Promise<BrowserWindow> {
  if (mainWindow) {
    return mainWindow;
  }

  const settings = await getSettings();
  mainWindow = new BrowserWindow({
    width: settings.windowBounds?.width || 1440,
    height: settings.windowBounds?.height || 960,
    minWidth: 1180,
    minHeight: 800,
    frame: false,
    show: false,
    skipTaskbar: startHiddenOnLaunch,
    autoHideMenuBar: true,
    backgroundColor: "#f7f9fb",
    webPreferences: {
      preload: resolveAppPath("dist", "preload", "main", "preload.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.once("ready-to-show", () => {
    if (!startHiddenOnLaunch) {
      mainWindow?.show();
      mainWindow?.setSkipTaskbar(false);
      return;
    }
    mainWindow?.hide();
    mainWindow?.setSkipTaskbar(true);
  });

  const indexPath = resolveAppPath("app", "renderer", "index.html");
  await mainWindow.loadFile(indexPath);
  const diagnostics = await mainWindow.webContents.executeJavaScript(`JSON.stringify({
    location: window.location.href,
    readyState: document.readyState,
    hasApi: typeof window.api !== "undefined",
    scripts: Array.from(document.scripts).map((script) => ({
      src: script.src,
      type: script.type
    }))
  })`);
  await logger.info(`Renderer ready: ${diagnostics}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("did-fail-load", async (_event, code, description) => {
    await logger.error(`Renderer failed to load: ${code} ${description}`);
  });

  mainWindow.webContents.on("render-process-gone", async (_event, details) => {
    await logger.error(`Renderer process gone: ${details.reason}`);
  });

  mainWindow.on("close", (event) => {
    const currentSettings = getCachedSettings();
    if (currentSettings.minimizeToTrayOnClose && !mainWindow?.isDestroyed()) {
      event.preventDefault();
      mainWindow?.setSkipTaskbar(true);
      mainWindow?.hide();
      return;
    }
  });

  mainWindow.on("resized", async () => {
    if (!mainWindow) {
      return;
    }
    const bounds = mainWindow.getBounds();
    await updateSettings({
      windowBounds: {
        width: bounds.width,
        height: bounds.height
      }
    });
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export async function showMainWindow(): Promise<void> {
  const window = mainWindow ?? await createMainWindow();
  window.setSkipTaskbar(false);
  if (window.isMinimized()) {
    window.restore();
  }
  if (!window.isVisible()) {
    window.show();
  }
  window.focus();
}

export function getWindowState(): { isMaximized: boolean } {
  return {
    isMaximized: Boolean(mainWindow && mainWindow.isMaximized())
  };
}

export function minimizeMainWindow(): void {
  mainWindow?.minimize();
}

export function toggleMainWindowMaximize(): { isMaximized: boolean } {
  if (!mainWindow) {
    return { isMaximized: false };
  }
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
  return { isMaximized: mainWindow.isMaximized() };
}

export function closeMainWindow(): void {
  mainWindow?.close();
}
