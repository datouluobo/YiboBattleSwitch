import { promises as fs } from "node:fs";
import path from "node:path";
import { getAppPaths } from "../../infra/storage/app-paths.js";

export async function selectRecommendedBackup(): Promise<string | null> {
  const files = await fs.readdir(getAppPaths().backupsDir).catch(() => []);
  const jsonFiles = files.filter((item) => item.endsWith(".json")).sort().reverse();
  if (!jsonFiles.length) {
    return null;
  }
  return path.join(getAppPaths().backupsDir, jsonFiles[0]);
}
