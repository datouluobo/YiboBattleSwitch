import { ensureDir, writeJsonFile } from "../system/fs.js";
import { getAppPaths } from "./app-paths.js";

const STORAGE_VERSION = 1;

export async function initializeStorage(): Promise<void> {
  const paths = getAppPaths();
  await Promise.all([
    ensureDir(paths.configDir),
    ensureDir(paths.accountsDir),
    ensureDir(paths.backupsDir),
    ensureDir(paths.diagnosticsSnapshotsDir),
    ensureDir(paths.diagnosticsReportsDir),
    ensureDir(paths.logsDir)
  ]);

  await writeJsonFile(paths.storageVersionFile, {
    version: STORAGE_VERSION,
    initializedAt: new Date().toISOString()
  });
}
