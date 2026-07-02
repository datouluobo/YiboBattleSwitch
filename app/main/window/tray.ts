import { Menu, Tray, app, dialog, nativeImage } from "electron";
import { listAccounts } from "../../infra/storage/account-library.js";
import { logger } from "../../infra/system/logger.js";
import { switchAccount } from "../../domain/account-switch/switch-account.js";
import { getAccountDisplayName } from "../../shared/account-display.js";
import { resolveAppPath } from "../bootstrap/paths.js";
import { showMainWindow } from "./main-window.js";

let tray: Tray | null = null;

async function buildTrayMenu(): Promise<Menu> {
  const accounts = await listAccounts().catch(() => []);
  const accountItems = accounts.length
    ? accounts.map((account) => ({
      label: `${getAccountDisplayName(account)}${account.description && account.description !== "-" ? ` (${account.description})` : ""}`,
      click: async () => {
        const result = await switchAccount(account.id);
        await logger.info(`Tray switch result for ${getAccountDisplayName(account)}: ${result.message}`);
        if (!result.ok) {
          await dialog.showMessageBox({
            type: "error",
            title: "切换失败",
            message: result.message
          });
          return;
        }
      }
    }))
    : [{
      label: "暂无可切换账号",
      enabled: false
    }];

  return Menu.buildFromTemplate([
    {
      label: "显示主窗口",
      click: () => {
        void showMainWindow();
      }
    },
    { type: "separator" },
    ...accountItems,
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        app.exit(0);
      }
    }
  ]);
}

export async function createTray(): Promise<Tray> {
  if (tray) {
    return tray;
  }

  const iconPath = resolveAppPath("assets", "icons", "app-icon.ico");
  tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip("YiboBattleSwitch");
  tray.setContextMenu(await buildTrayMenu());
  tray.on("right-click", async () => {
    tray?.setContextMenu(await buildTrayMenu());
    tray?.popUpContextMenu();
  });
  tray.on("double-click", () => {
    void showMainWindow();
  });
  return tray;
}
