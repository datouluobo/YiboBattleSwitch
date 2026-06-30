import { promises as fs } from "node:fs";
import path from "node:path";
import { app } from "electron";
import { ensureDir } from "../system/fs.js";

const LOCAL_BATTLE_NET_ROOT_FILES = [
  "CachedData.db",
  "LocalPrefs.json"
];

const LOCAL_BATTLE_NET_MANAGED_DIRS = [
  "Account"
];

function getLocalBattleNetRoot(): string {
  return path.join(process.env.LOCALAPPDATA || app.getPath("appData"), "Battle.net");
}

async function listManagedFiles(): Promise<string[]> {
  const root = getLocalBattleNetRoot();
  const files: string[] = [];

  for (const fileName of LOCAL_BATTLE_NET_ROOT_FILES) {
    const fullPath = path.join(root, fileName);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.isFile()) {
        files.push(fullPath);
      }
    } catch {
      // Ignore missing files.
    }
  }

  for (const dirName of LOCAL_BATTLE_NET_MANAGED_DIRS) {
    const dirPath = path.join(root, dirName);
    try {
      const entries = await fs.readdir(dirPath, { recursive: true, withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          files.push(path.join(entry.parentPath, entry.name));
        }
      }
    } catch {
      // Ignore missing dirs.
    }
  }

  return files.sort();
}

export async function readBattleNetLocalState(): Promise<Record<string, string>> {
  const root = getLocalBattleNetRoot();
  const blobs: Record<string, string> = {};

  for (const fullPath of await listManagedFiles()) {
    const relPath = path.relative(root, fullPath);
    blobs[relPath] = (await fs.readFile(fullPath)).toString("base64");
  }

  return blobs;
}

export async function restoreBattleNetLocalState(blobs: Record<string, string>): Promise<void> {
  const root = getLocalBattleNetRoot();
  await ensureDir(root);

  for (const dirName of LOCAL_BATTLE_NET_MANAGED_DIRS) {
    await fs.rm(path.join(root, dirName), { recursive: true, force: true }).catch(() => undefined);
  }

  for (const relPath of LOCAL_BATTLE_NET_ROOT_FILES) {
    if (!blobs[relPath]) {
      await fs.rm(path.join(root, relPath), { force: true }).catch(() => undefined);
    }
  }

  for (const [relPath, encoded] of Object.entries(blobs)) {
    if (!encoded) {
      continue;
    }
    const targetPath = path.join(root, relPath);
    await ensureDir(path.dirname(targetPath));
    await fs.writeFile(targetPath, Buffer.from(encoded, "base64"));
  }
}
