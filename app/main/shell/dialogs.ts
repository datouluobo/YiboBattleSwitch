import { BrowserWindow, dialog } from "electron";

export async function selectDirectory(browserWindow: BrowserWindow, defaultPath = ""): Promise<string> {
  const result = await dialog.showOpenDialog(browserWindow, {
    title: "选择目录",
    properties: ["openDirectory"],
    defaultPath: defaultPath || undefined
  });

  return result.canceled ? "" : (result.filePaths[0] || "");
}

export async function selectImportSource(browserWindow: BrowserWindow, defaultPath = ""): Promise<string> {
  const result = await dialog.showOpenDialog(browserWindow, {
    title: "选择账号库备份文件",
    properties: ["openFile"],
    filters: [
      { name: "YiboBattleSwitch Encrypted Backup", extensions: ["ybsx"] },
      { name: "YiboBattleSwitch DPAPI Backup", extensions: ["ybs-dpapi"] },
      { name: "Legacy Zip Archives", extensions: ["zip"] },
      { name: "All Files", extensions: ["*"] }
    ],
    defaultPath: defaultPath || undefined
  });

  return result.canceled ? "" : (result.filePaths[0] || "");
}
