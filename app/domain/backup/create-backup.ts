import path from "node:path";
import { writeJsonFile } from "../../infra/system/fs.js";
import { nowIso } from "../../infra/system/time.js";
import { getAppPaths } from "../../infra/storage/app-paths.js";
import { takeBattleNetSnapshot } from "../../infra/battlenet/battlenet-snapshot.js";

export async function createBackup(label = "pre-switch"): Promise<string> {
  const snapshot = await takeBattleNetSnapshot(label);
  const fileName = `${nowIso().replace(/[:.]/g, "-")}-${label}.json`;
  const targetPath = path.join(getAppPaths().backupsDir, fileName);
  await writeJsonFile(targetPath, snapshot);
  return targetPath;
}
