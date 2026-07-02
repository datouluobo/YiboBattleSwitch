import { promises as fs } from "node:fs";
import path from "node:path";
import { app } from "electron";
import { ensureDir } from "../system/fs.js";
import { logger } from "../system/logger.js";

const LOCAL_BATTLE_NET_ROOT_FILES = [
  "CachedData.db",
  "LocalPrefs.json"
];

const LOCAL_BATTLE_NET_MANAGED_DIRS = [
  "Account",
  "BrowserCaches"
];

const BROWSER_CACHE_COMMON_DIRS = [
  "Network",
  "Session Storage",
  "Local Storage"
];

const BROWSER_CACHE_ACCOUNT_DIRS = [
  "Network",
  "Session Storage",
  "Local Storage",
  "Storage",
  "WebStorage",
  "Service Worker"
];

const VOLATILE_BROWSER_CACHE_FILE_NAMES = new Set([
  "LOCK",
  "CURRENT",
  "LOG",
  "LOG.old",
  "Cookies-journal"
]);

function getLocalBattleNetRoot(): string {
  return path.join(process.env.LOCALAPPDATA || app.getPath("appData"), "Battle.net");
}

async function listFilesUnder(rootPath: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(rootPath, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && !VOLATILE_BROWSER_CACHE_FILE_NAMES.has(entry.name)) {
      files.push(path.join(entry.parentPath, entry.name));
    }
  }
  return files;
}

async function listManagedFiles(currentAccountId = ""): Promise<string[]> {
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

  const accountDirPath = path.join(root, "Account");
  try {
    files.push(...await listFilesUnder(accountDirPath));
  } catch {
    // Ignore missing dirs.
  }

  const browserCacheRoot = path.join(root, "BrowserCaches");
  const browserCacheFiles = [
    path.join(browserCacheRoot, "LocalPrefs.json"),
    ...BROWSER_CACHE_COMMON_DIRS.map((dirName) => path.join(browserCacheRoot, "common", dirName)),
    ...(currentAccountId.trim()
      ? BROWSER_CACHE_ACCOUNT_DIRS.map((dirName) => path.join(browserCacheRoot, currentAccountId.trim(), dirName))
      : [])
  ];

  for (const targetPath of browserCacheFiles) {
    try {
      const stat = await fs.stat(targetPath);
      if (stat.isFile()) {
        files.push(targetPath);
        continue;
      }
      if (stat.isDirectory()) {
        files.push(...await listFilesUnder(targetPath));
      }
    } catch {
      // Ignore missing browser cache paths.
    }
  }

  return Array.from(new Set(files)).sort();
}

export async function readBattleNetLocalState(currentAccountId = ""): Promise<Record<string, string>> {
  const root = getLocalBattleNetRoot();
  const blobs: Record<string, string> = {};

  for (const fullPath of await listManagedFiles(currentAccountId)) {
    const relPath = path.relative(root, fullPath);
    try {
      blobs[relPath] = (await fs.readFile(fullPath)).toString("base64");
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code || "") : "";
      if (code === "EBUSY" || code === "EPERM" || code === "EACCES") {
        await logger.warn(`[snapshot] skip busy local file: ${relPath} (${code})`);
        continue;
      }
      throw error;
    }
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
