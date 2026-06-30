import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readAccount, saveAccount, toAccountId } from "./account-library.js";
import { getAppPaths } from "./app-paths.js";
import { readJsonFile } from "../system/fs.js";
import { BattleNetSnapshot } from "../../shared/types/app.js";
import { execPowerShell } from "../battlenet/command.js";
import { convertLegacyUnifiedAuth } from "../battlenet/battlenet-registry.js";

interface ImportSummary {
  imported: number;
  updated: number;
}

async function loadCandidateFolders(root: string): Promise<string[]> {
  const candidateRoot = await fs.stat(path.join(root, "accounts")).then((stat) => stat.isDirectory() ? path.join(root, "accounts") : root).catch(() => root);
  const entries = await fs.readdir(candidateRoot, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(candidateRoot, entry.name));
}

async function readExternalAccount(folderPath: string): Promise<{ email: string; description: string; snapshot: BattleNetSnapshot; importedFrom: string } | null> {
  const meta = await readJsonFile<Record<string, unknown> | null>(path.join(folderPath, "meta.json"), null);
  const info = await readJsonFile<Record<string, unknown> | null>(path.join(folderPath, "info.json"), null);
  const snapshot = await readJsonFile<BattleNetSnapshot | null>(path.join(folderPath, "snapshot.json"), null);

  const email = String(meta?.email || info?.account || "");
  if (!email) {
    return null;
  }

  if (snapshot) {
    return {
      email,
      description: String(meta?.description || info?.description || ""),
      snapshot,
      importedFrom: String(meta?.importedFrom || info?.importedFrom || "ExternalLibrary")
    };
  }

  const compatSnapshot = await readJsonFile<Record<string, unknown> | null>(path.join(folderPath, "account_snapshot.json"), null);
  if (compatSnapshot) {
    return {
      email,
      description: String(meta?.description || info?.description || ""),
      snapshot: {
        capturedAt: String(compatSnapshot.savedAt || new Date().toISOString()),
        configPath: "",
        configRaw: String(compatSnapshot.battleNetConfigText || ""),
        configJson: compatSnapshot.battleNetConfigJson ?? null,
        fileBlobs: (compatSnapshot.battleNetFileBlobs as Record<string, string>) || {},
        gameAccount: String((compatSnapshot.wow as Record<string, { value?: string }> | undefined)?.GAME_ACCOUNT?.value || ""),
        savedAccountNames: [],
        registry: {
          wow: (compatSnapshot.wow as BattleNetSnapshot["registry"]["wow"]) || {},
          wtcg: (compatSnapshot.wtcg as BattleNetSnapshot["registry"]["wtcg"]) || {},
          encryption: (compatSnapshot.encryption as BattleNetSnapshot["registry"]["encryption"]) || {},
          unifiedAuth: (compatSnapshot.unifiedAuth as BattleNetSnapshot["registry"]["unifiedAuth"]) || {}
        },
        registryExports: [],
        localFiles: (compatSnapshot.battleNetLocalBlobs as Record<string, string>) || (compatSnapshot.battleNetFileBlobs as Record<string, string>) || {}
      },
      importedFrom: String(meta?.importedFrom || info?.importedFrom || "ExternalLibrary")
    };
  }

  const compatRegistry = await readJsonFile<Record<string, unknown> | null>(path.join(folderPath, "registry.json"), null);
  const configText = (await fs.readFile(path.join(folderPath, "battlenet_config.txt"), "utf8").catch(() => "")) || "";
  const configJson = await readJsonFile<unknown | null>(path.join(folderPath, "battlenet_config.json"), null);
  if (!compatRegistry && !configText && !configJson) {
    return null;
  }

  return {
    email,
    description: String(meta?.description || info?.description || ""),
    snapshot: {
      capturedAt: String(info?.importedAt || new Date().toISOString()),
      configPath: "",
      configRaw: configText,
      configJson,
      fileBlobs: {},
      gameAccount: "",
      savedAccountNames: [],
      registry: convertLegacyUnifiedAuth(compatRegistry),
      registryExports: [],
      localFiles: {}
    },
    importedFrom: String(meta?.importedFrom || info?.importedFrom || "ExternalLibrary")
  };
}

export async function backupAccountLibrary(outputDir: string): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const archivePath = path.join(outputDir, `YiboBattleSwitch-account-library-backup-${timestamp}.zip`);
  const libraryDir = getAppPaths().libraryDir;
  const escapedLibrary = libraryDir.replace(/'/g, "''");
  const escapedArchive = archivePath.replace(/'/g, "''");
  await execPowerShell(`Compress-Archive -Path '${escapedLibrary}\\*' -DestinationPath '${escapedArchive}' -Force`);
  return archivePath;
}

export async function importAccountLibrary(sourcePath: string): Promise<ImportSummary> {
  let workingRoot = sourcePath;
  let tempRoot = "";

  const stat = await fs.stat(sourcePath);
  if (stat.isFile() && sourcePath.toLowerCase().endsWith(".zip")) {
    tempRoot = path.join(os.tmpdir(), "YiboBattleSwitch", `import-${Date.now()}`);
    await fs.mkdir(tempRoot, { recursive: true });
    const escapedSource = sourcePath.replace(/'/g, "''");
    const escapedTarget = tempRoot.replace(/'/g, "''");
    await execPowerShell(`Expand-Archive -Path '${escapedSource}' -DestinationPath '${escapedTarget}' -Force`);
    workingRoot = tempRoot;
  }

  let imported = 0;
  let updated = 0;

  for (const folderPath of await loadCandidateFolders(workingRoot)) {
    const account = await readExternalAccount(folderPath);
    if (!account) {
      continue;
    }

    const existing = await readAccount(toAccountId(account.email));
    await saveAccount(account);
    if (existing) {
      updated += 1;
    } else {
      imported += 1;
    }
  }

  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }

  return { imported, updated };
}
