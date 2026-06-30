import { promises as fs } from "node:fs";
import path from "node:path";
import { app } from "electron";
import { ensureDir } from "../system/fs.js";

function getBattleNetRoamingRoot(): string {
  return path.join(app.getPath("appData"), "Battle.net");
}

async function listRoamingFiles(): Promise<string[]> {
  const root = getBattleNetRoamingRoot();
  try {
    const entries = await fs.readdir(root, { recursive: true, withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(entry.parentPath, entry.name))
      .sort();
  } catch {
    return [];
  }
}

export async function readBattleNetRoamingState(): Promise<Record<string, string>> {
  const root = getBattleNetRoamingRoot();
  const blobs: Record<string, string> = {};

  for (const fullPath of await listRoamingFiles()) {
    const relPath = path.relative(root, fullPath);
    blobs[relPath] = (await fs.readFile(fullPath)).toString("base64");
  }

  return blobs;
}

export async function restoreBattleNetRoamingState(blobs: Record<string, string>): Promise<void> {
  const root = getBattleNetRoamingRoot();
  await ensureDir(root);

  const existingFiles = await listRoamingFiles();
  const expected = new Set(Object.keys(blobs));

  for (const fullPath of existingFiles) {
    const relPath = path.relative(root, fullPath);
    if (expected.has(relPath)) {
      continue;
    }
    await fs.rm(fullPath, { force: true }).catch(() => undefined);
  }

  for (const [relPath, encoded] of Object.entries(blobs)) {
    if (!encoded) {
      continue;
    }
    const targetPath = path.join(root, relPath);
    await ensureDir(path.dirname(targetPath));
    await fs.writeFile(targetPath, Buffer.from(encoded, "base64"));
  }

  const removeEmptyDirs = async (targetDir: string): Promise<void> => {
    const entries = await fs.readdir(targetDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const childDir = path.join(targetDir, entry.name);
      await removeEmptyDirs(childDir);
    }
    const remaining = await fs.readdir(targetDir).catch(() => []);
    if (!remaining.length && targetDir !== root) {
      await fs.rmdir(targetDir).catch(() => undefined);
    }
  };

  await removeEmptyDirs(root);
}
