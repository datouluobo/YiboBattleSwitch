import { promises as fs } from "node:fs";
import path from "node:path";
import { app } from "electron";
import { BattleNetRegistrySnapshot, RegistryExport, RegistryValuePayload } from "../../shared/types/app.js";
import { fileExists } from "../system/fs.js";
import { execCommand } from "./command.js";

export const REGISTRY_PATHS = {
  wow: "HKCU\\Software\\Blizzard Entertainment\\Battle.net\\Launch Options\\WoW",
  wtcg: "HKCU\\Software\\Blizzard Entertainment\\Battle.net\\Launch Options\\WTCG",
  encryption: "HKCU\\Software\\Blizzard Entertainment\\Battle.net\\EncryptionKey",
  unifiedAuth: "HKCU\\Software\\Blizzard Entertainment\\Battle.net\\UnifiedAuth"
} as const;

const REGISTRY_EXPORT_KEYS = [
  "HKCU\\Software\\Battle.net",
  "HKCU\\Software\\Blizzard Entertainment"
];

function parseRegistryQuery(stdout: string): Record<string, RegistryValuePayload> {
  const result: Record<string, RegistryValuePayload> = {};

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith("HKEY_")) {
      continue;
    }

    const match = line.match(/^\s{2,}([^\s].*?)\s{2,}(REG_[A-Z0-9_]+)\s{2,}(.*)$/);
    if (!match) {
      continue;
    }

    const [, name, type, rawValue] = match;
    if (type === "REG_BINARY") {
      const hex = rawValue.replace(/\s+/g, "");
      const buffer = hex ? Buffer.from(hex, "hex") : Buffer.alloc(0);
      result[name] = {
        type,
        value: buffer.toString("base64")
      };
      continue;
    }

    result[name] = {
      type,
      value: rawValue
    };
  }

  return result;
}

async function queryRegistryValues(keyPath: string): Promise<Record<string, RegistryValuePayload>> {
  try {
    const { stdout } = await execCommand("reg.exe", ["query", keyPath]);
    return parseRegistryQuery(stdout);
  } catch {
    return {};
  }
}

async function clearRegistryValues(keyPath: string): Promise<void> {
  try {
    await execCommand("reg.exe", ["delete", keyPath, "/va", "/f"]);
  } catch {
    // Ignore missing keys.
  }
}

function registryDataForWrite(entry: RegistryValuePayload): string {
  if (entry.type === "REG_BINARY") {
    return Buffer.from(entry.value || "", "base64").toString("hex").toUpperCase();
  }
  return entry.value ?? "";
}

async function writeRegistryValueMap(keyPath: string, values: Record<string, RegistryValuePayload>): Promise<void> {
  await clearRegistryValues(keyPath);

  for (const [name, entry] of Object.entries(values)) {
    await execCommand("reg.exe", [
      "add",
      keyPath,
      "/v",
      name,
      "/t",
      entry.type,
      "/d",
      registryDataForWrite(entry),
      "/f"
    ]);
  }
}

export async function readBattleNetRegistrySnapshot(): Promise<BattleNetRegistrySnapshot> {
  const [wow, wtcg, encryption, unifiedAuth] = await Promise.all([
    queryRegistryValues(REGISTRY_PATHS.wow),
    queryRegistryValues(REGISTRY_PATHS.wtcg),
    queryRegistryValues(REGISTRY_PATHS.encryption),
    queryRegistryValues(REGISTRY_PATHS.unifiedAuth)
  ]);

  return {
    wow,
    wtcg,
    encryption,
    unifiedAuth
  };
}

export async function restoreBattleNetRegistry(snapshot: BattleNetRegistrySnapshot): Promise<void> {
  await writeRegistryValueMap(REGISTRY_PATHS.wow, snapshot.wow || {});
  await writeRegistryValueMap(REGISTRY_PATHS.wtcg, snapshot.wtcg || {});
  await writeRegistryValueMap(REGISTRY_PATHS.encryption, snapshot.encryption || {});
  await writeRegistryValueMap(REGISTRY_PATHS.unifiedAuth, snapshot.unifiedAuth || {});
}

export async function exportBattleNetRegistry(targetDir: string): Promise<RegistryExport[]> {
  await fs.mkdir(targetDir, { recursive: true });
  const exports: RegistryExport[] = [];

  for (const key of REGISTRY_EXPORT_KEYS) {
    const fileName = `${key.split("\\").pop()?.replace(/\s+/g, "-").toLowerCase() || "registry"}.reg`;
    const filePath = path.join(targetDir, fileName);
    try {
      await execCommand("reg.exe", ["export", key, filePath, "/y"]);
      exports.push({ key, path: filePath, exists: true });
    } catch {
      exports.push({ key, path: filePath, exists: false });
    }
  }

  return exports;
}

export async function restoreBattleNetRegistryExports(exportsList: RegistryExport[]): Promise<void> {
  for (const entry of exportsList) {
    if (!entry.exists || !(await fileExists(entry.path))) {
      continue;
    }
    await execCommand("reg.exe", ["import", entry.path]);
  }
}

export async function readRegistrySummary(): Promise<string[]> {
  const snapshot = await readBattleNetRegistrySnapshot();
  const gameAccount = snapshot.wow.GAME_ACCOUNT?.value || "-";
  const accountTs = snapshot.wow.ACCOUNT_TS?.value || "-";
  const unifiedAuthKeys = Object.keys(snapshot.unifiedAuth);

  return [
    `GAME_ACCOUNT=${gameAccount}`,
    `ACCOUNT_TS=${accountTs}`,
    `UnifiedAuth=${unifiedAuthKeys.length ? unifiedAuthKeys.join(", ") : "-"}`
  ];
}

export function convertLegacyUnifiedAuth(registryPayload: unknown): BattleNetRegistrySnapshot {
  const unifiedAuth: Record<string, RegistryValuePayload> = {};
  const rootValues = (registryPayload && typeof registryPayload === "object" ? (registryPayload as Record<string, unknown>)[""] : null) as Record<string, unknown> | null;

  if (rootValues) {
    for (const [name, payload] of Object.entries(rootValues)) {
      const value = payload && typeof payload === "object" ? (payload as Record<string, unknown>).Value : "";
      if (typeof value === "string" && value) {
        unifiedAuth[name] = {
          type: "REG_BINARY",
          value
        };
      }
    }
  }

  return {
    wow: {},
    wtcg: {},
    encryption: {},
    unifiedAuth
  };
}

export function getTempRegistryExportDir(): string {
  return path.join(app.getPath("temp"), "YiboBattleSwitch", "registry");
}
