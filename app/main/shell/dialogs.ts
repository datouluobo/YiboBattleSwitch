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
    title: "选择账号库目录或备份文件",
    properties: ["openDirectory", "openFile"],
    filters: [
      { name: "Zip Archives", extensions: ["zip"] },
      { name: "All Files", extensions: ["*"] }
    ],
    defaultPath: defaultPath || undefined
  });

  return result.canceled ? "" : (result.filePaths[0] || "");
}
