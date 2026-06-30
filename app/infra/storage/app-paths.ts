import { app } from "electron";
import path from "node:path";

export interface AppPaths {
  userDataDir: string;
  configDir: string;
  libraryDir: string;
  accountsDir: string;
  backupsDir: string;
  diagnosticsDir: string;
  diagnosticsSnapshotsDir: string;
  diagnosticsReportsDir: string;
  logsDir: string;
  settingsFile: string;
  storageVersionFile: string;
}

export function getAppPaths(): AppPaths {
  const userDataDir = app.getPath("userData");

  return {
    userDataDir,
    configDir: path.join(userDataDir, "config"),
    libraryDir: path.join(userDataDir, "library"),
    accountsDir: path.join(userDataDir, "library", "accounts"),
    backupsDir: path.join(userDataDir, "backups"),
    diagnosticsDir: path.join(userDataDir, "diagnostics"),
    diagnosticsSnapshotsDir: path.join(userDataDir, "diagnostics", "snapshots"),
    diagnosticsReportsDir: path.join(userDataDir, "diagnostics", "reports"),
    logsDir: path.join(userDataDir, "logs"),
    settingsFile: path.join(userDataDir, "config", "settings.json"),
    storageVersionFile: path.join(userDataDir, "config", "storage-version.json")
  };
}
