import { spawn } from "node:child_process";
import { detectBattleNetLauncherPath } from "./battlenet-paths.js";

export async function launchBattleNet(): Promise<string> {
  const launcherPath = await detectBattleNetLauncherPath();
  if (!launcherPath) {
    throw new Error("未找到 Battle.net Launcher 路径。请先在设置中确认安装目录。");
  }

  spawn(launcherPath, [], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  }).unref();

  return launcherPath;
}
