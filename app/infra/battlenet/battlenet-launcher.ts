import { spawn } from "node:child_process";
import { detectBattleNetLauncherPath } from "./battlenet-paths.js";

export async function launchBattleNet(): Promise<string> {
  const launcherPath = await detectBattleNetLauncherPath();
  if (!launcherPath) {
    throw new Error("未找到 Battle.net Launcher 路径。请先在设置中确认安装目录。");
  }

  const child = spawn(launcherPath, [], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });

  await new Promise<void>((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  child.unref();

  return launcherPath;
}
