import { promises as fs } from "node:fs";
import path from "node:path";
import { AccountCompatibilityRecord, AccountListItem, AccountRecord, BattleNetSnapshot } from "../../shared/types/app.js";
import { convertLegacyUnifiedAuth } from "../battlenet/battlenet-registry.js";
import { ensureDir, fileExists, readJsonFile, writeJsonFile } from "../system/fs.js";
import { formatDisplayDate, nowIso } from "../system/time.js";
import { getAppPaths } from "./app-paths.js";

const META_FILE = "meta.json";
const SNAPSHOT_FILE = "snapshot.json";

export function toAccountId(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/\s+/g, "-").toLowerCase();
}

function currentTimestampMs(): number {
  return Date.now();
}

function createCompatibilityRecord(snapshot: BattleNetSnapshot): AccountCompatibilityRecord {
  return {
    savedAccountName: snapshot.gameAccount || "",
    wowGameAccounts: [],
    wowSelectedAccount: snapshot.gameAccount || "",
    wowCaptureSource: snapshot.savedAccountNames.length ? "Battle.net.config" : "",
    wowSourceVariant: "",
    wowLocalAccountName: "",
    wowLocalAccountCandidates: [],
    wowAccountsByVariant: {}
  };
}

function compatRegistryPayload(snapshot: BattleNetSnapshot): Record<string, Record<string, { Value: string }>> {
  return {
    "": Object.fromEntries(
      Object.entries(snapshot.registry.unifiedAuth || {}).map(([name, payload]) => [name, { Value: payload.value }])
    )
  };
}

async function writeCompatibilityFiles(accountDir: string, record: AccountRecord, snapshot: BattleNetSnapshot): Promise<void> {
  const infoPayload = {
    account: record.email,
    description: record.description,
    backupTime: currentTimestampMs(),
    lastLoginTime: currentTimestampMs(),
    importedFrom: record.importedFrom || "YiboBattleSwitch",
    importedAt: nowIso()
  };

  await writeJsonFile(path.join(accountDir, "info.json"), infoPayload);
  await writeJsonFile(path.join(accountDir, "account.json"), createCompatibilityRecord(snapshot));
  await writeJsonFile(path.join(accountDir, "registry.json"), compatRegistryPayload(snapshot));

  if (snapshot.configRaw) {
    await fs.writeFile(path.join(accountDir, "battlenet_config.txt"), snapshot.configRaw, "utf8");
  }
  if (snapshot.configJson) {
    await writeJsonFile(path.join(accountDir, "battlenet_config.json"), snapshot.configJson);
  }
  if (Object.keys(snapshot.fileBlobs || {}).length) {
    await writeJsonFile(path.join(accountDir, "battlenet_files.json"), snapshot.fileBlobs);
  }
  if (Object.keys(snapshot.localFiles).length) {
    await writeJsonFile(path.join(accountDir, "battlenet_local_files.json"), snapshot.localFiles);
  }
  await writeJsonFile(path.join(accountDir, "account_snapshot.json"), {
    savedAt: snapshot.capturedAt,
    wow: snapshot.registry.wow,
    wtcg: snapshot.registry.wtcg,
    encryption: snapshot.registry.encryption,
    unifiedAuth: snapshot.registry.unifiedAuth,
    battleNetConfigText: snapshot.configRaw,
    battleNetConfigJson: snapshot.configJson,
    battleNetFileBlobs: snapshot.fileBlobs,
    battleNetLocalBlobs: snapshot.localFiles,
    battleNetLocalFiles: snapshot.localFiles
  });
}

async function readCompatMeta(folderPath: string, accountId: string): Promise<AccountRecord | null> {
  const info = await readJsonFile<Record<string, unknown> | null>(path.join(folderPath, "info.json"), null);
  if (!info) {
    return null;
  }

  const email = String(info.account || accountId);
  const updatedAt = typeof info.importedAt === "string" ? info.importedAt : nowIso();
  return {
    id: accountId,
    email,
    description: String(info.description || ""),
    createdAt: updatedAt,
    updatedAt,
    importedFrom: typeof info.importedFrom === "string" ? info.importedFrom : "ExternalLibrary",
    snapshotVersion: 1
  };
}

async function readCompatSnapshot(folderPath: string): Promise<BattleNetSnapshot | null> {
  const fullSnapshot = await readJsonFile<Record<string, unknown> | null>(path.join(folderPath, "account_snapshot.json"), null);
  const compatRegistry = await readJsonFile<Record<string, unknown> | null>(path.join(folderPath, "registry.json"), null);
  const configText = (await fs.readFile(path.join(folderPath, "battlenet_config.txt"), "utf8").catch(() => "")) || "";
  const configJson = await readJsonFile<unknown | null>(path.join(folderPath, "battlenet_config.json"), null);
  const fileBlobs = await readJsonFile<Record<string, string>>(path.join(folderPath, "battlenet_files.json"), {});
  const localFiles = await readJsonFile<Record<string, string>>(path.join(folderPath, "battlenet_local_files.json"), {});
  const fallbackLocalFiles = Object.keys(localFiles).length
    ? localFiles
    : await readJsonFile<Record<string, string>>(path.join(folderPath, "battlenet_files.json"), {});

  if (fullSnapshot) {
    const rawRegistry = {
      wow: (fullSnapshot.wow as BattleNetSnapshot["registry"]["wow"]) || {},
      wtcg: (fullSnapshot.wtcg as BattleNetSnapshot["registry"]["wtcg"]) || {},
      encryption: (fullSnapshot.encryption as BattleNetSnapshot["registry"]["encryption"]) || {},
      unifiedAuth: (fullSnapshot.unifiedAuth as BattleNetSnapshot["registry"]["unifiedAuth"]) || {}
    };
    const gameAccountPayload = rawRegistry.wow.GAME_ACCOUNT;
    const gameAccount = gameAccountPayload && typeof gameAccountPayload === "object" ? String(gameAccountPayload.value || "") : "";

    return {
      capturedAt: typeof fullSnapshot.savedAt === "string" ? fullSnapshot.savedAt : nowIso(),
      configPath: "",
      configRaw: typeof fullSnapshot.battleNetConfigText === "string" ? fullSnapshot.battleNetConfigText : configText,
      configJson: fullSnapshot.battleNetConfigJson ?? configJson,
      fileBlobs: (fullSnapshot.battleNetFileBlobs as Record<string, string>) || fileBlobs,
      gameAccount,
      savedAccountNames: [],
      registry: rawRegistry,
      registryExports: [],
      localFiles: (fullSnapshot.battleNetLocalBlobs as Record<string, string>) || (fullSnapshot.battleNetFileBlobs as Record<string, string>) || fallbackLocalFiles
    };
  }

  if (compatRegistry || configText || configJson) {
    const registry = convertLegacyUnifiedAuth(compatRegistry);
    return {
      capturedAt: nowIso(),
      configPath: "",
      configRaw: configText,
      configJson,
      fileBlobs,
      gameAccount: "",
      savedAccountNames: [],
      registry,
      registryExports: [],
      localFiles: fallbackLocalFiles
    };
  }

  return null;
}

async function normalizeSnapshot(folderPath: string, snapshot: BattleNetSnapshot | Record<string, unknown>): Promise<BattleNetSnapshot> {
  const compatFullSnapshot = await readJsonFile<Record<string, unknown> | null>(path.join(folderPath, "account_snapshot.json"), null);
  const compatFileBlobs = await readJsonFile<Record<string, string>>(path.join(folderPath, "battlenet_files.json"), {});
  const compatLocalFiles = await readJsonFile<Record<string, string>>(path.join(folderPath, "battlenet_local_files.json"), {});

  const raw = snapshot as Record<string, unknown>;
  const fileBlobs = (raw.fileBlobs as Record<string, string>) || (raw.battleNetFileBlobs as Record<string, string>) || (compatFullSnapshot?.battleNetFileBlobs as Record<string, string>) || compatFileBlobs || {};
  const localFiles = (raw.localFiles as Record<string, string>) || (raw.battleNetLocalBlobs as Record<string, string>) || (compatFullSnapshot?.battleNetLocalBlobs as Record<string, string>) || compatLocalFiles || {};

  return {
    capturedAt: typeof raw.capturedAt === "string" ? raw.capturedAt : String(raw.savedAt || nowIso()),
    configPath: typeof raw.configPath === "string" ? raw.configPath : "",
    configRaw: typeof raw.configRaw === "string" ? raw.configRaw : String(raw.battleNetConfigText || ""),
    configJson: raw.configJson ?? raw.battleNetConfigJson ?? null,
    fileBlobs,
    gameAccount: typeof raw.gameAccount === "string" ? raw.gameAccount : "",
    savedAccountNames: Array.isArray(raw.savedAccountNames) ? raw.savedAccountNames.map((item) => String(item || "").trim()).filter(Boolean) : [],
    registry: (raw.registry as BattleNetSnapshot["registry"]) || {
      wow: (raw.wow as BattleNetSnapshot["registry"]["wow"]) || {},
      wtcg: (raw.wtcg as BattleNetSnapshot["registry"]["wtcg"]) || {},
      encryption: (raw.encryption as BattleNetSnapshot["registry"]["encryption"]) || {},
      unifiedAuth: (raw.unifiedAuth as BattleNetSnapshot["registry"]["unifiedAuth"]) || {}
    },
    registryExports: Array.isArray(raw.registryExports) ? raw.registryExports as BattleNetSnapshot["registryExports"] : [],
    localFiles
  };
}

export function maskEmail(value: string): string {
  const [name, domain] = value.split("@");
  if (!domain || name.length < 3) {
    return value;
  }
  return `${name.slice(0, 2)}***@${domain}`;
}

export async function listAccounts(): Promise<AccountListItem[]> {
  const paths = getAppPaths();
  const entries = await fs.readdir(paths.accountsDir, { withFileTypes: true }).catch(() => []);
  const items: AccountListItem[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const account = await readAccount(entry.name);
    if (!account) {
      continue;
    }
    items.push({
      id: account.id,
      email: account.email,
      maskedEmail: maskEmail(account.email),
      description: account.description || "-",
      lastSaved: formatDisplayDate(account.updatedAt),
      importedFrom: account.importedFrom,
      sortOrder: account.sortOrder
    });
  }

  return items.sort((a, b) => {
    if (typeof a.sortOrder === "number" && typeof b.sortOrder === "number") {
      return a.sortOrder - b.sortOrder;
    }
    if (typeof a.sortOrder === "number") {
      return -1;
    }
    if (typeof b.sortOrder === "number") {
      return 1;
    }
    return b.lastSaved.localeCompare(a.lastSaved);
  });
}

export async function readAccount(accountId: string): Promise<AccountRecord | null> {
  const paths = getAppPaths();
  const folderPath = path.join(paths.accountsDir, accountId);
  const metaPath = path.join(folderPath, META_FILE);

  if (await fileExists(metaPath)) {
    return readJsonFile<AccountRecord | null>(metaPath, null);
  }

  const legacyOwnPath = path.join(folderPath, "account.json");
  if (await fileExists(legacyOwnPath)) {
    const payload = await readJsonFile<Record<string, unknown> | null>(legacyOwnPath, null);
    if (payload && typeof payload.id === "string" && typeof payload.email === "string") {
      const record: AccountRecord = {
        id: payload.id,
        email: payload.email,
        description: String(payload.description || ""),
        createdAt: String(payload.createdAt || nowIso()),
        updatedAt: String(payload.updatedAt || nowIso()),
        importedFrom: typeof payload.importedFrom === "string" ? payload.importedFrom : undefined,
        snapshotVersion: Number(payload.snapshotVersion || 1),
        sortOrder: typeof payload.sortOrder === "number" ? payload.sortOrder : undefined
      };
      await writeJsonFile(metaPath, record);
      return record;
    }
  }

  return readCompatMeta(folderPath, accountId);
}

export async function readAccountSnapshot(accountId: string): Promise<BattleNetSnapshot | null> {
  const paths = getAppPaths();
  const folderPath = path.join(paths.accountsDir, accountId);
  const snapshotPath = path.join(folderPath, SNAPSHOT_FILE);

  if (await fileExists(snapshotPath)) {
    const snapshot = await readJsonFile<BattleNetSnapshot | Record<string, unknown> | null>(snapshotPath, null);
    if (!snapshot) {
      return null;
    }
    return normalizeSnapshot(folderPath, snapshot);
  }

  return readCompatSnapshot(folderPath);
}

export async function saveAccount(input: {
  email: string;
  description: string;
  snapshot: BattleNetSnapshot;
  importedFrom?: string;
}): Promise<AccountRecord> {
  const paths = getAppPaths();
  const id = toAccountId(input.email || `account-${Date.now()}`);
  const existing = await readAccount(id);
  const timestamp = nowIso();
  const record: AccountRecord = {
    id,
    email: input.email,
    description: input.description,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
    importedFrom: input.importedFrom,
    snapshotVersion: 2,
    sortOrder: existing?.sortOrder ?? Date.now()
  };

  const accountDir = path.join(paths.accountsDir, id);
  await ensureDir(accountDir);
  await writeJsonFile(path.join(accountDir, META_FILE), record);
  await writeJsonFile(path.join(accountDir, SNAPSHOT_FILE), input.snapshot);
  await writeCompatibilityFiles(accountDir, record, input.snapshot);

  return record;
}

export async function updateAccountDescription(accountId: string, description: string): Promise<AccountRecord | null> {
  const existing = await readAccount(accountId);
  const snapshot = await readAccountSnapshot(accountId);
  if (!existing || !snapshot) {
    return null;
  }

  return saveAccount({
    email: existing.email,
    description,
    snapshot,
    importedFrom: existing.importedFrom
  });
}

export async function reorderAccounts(accountIds: string[]): Promise<AccountRecord[]> {
  const updated: AccountRecord[] = [];

  for (let index = 0; index < accountIds.length; index += 1) {
    const accountId = accountIds[index];
    const existing = await readAccount(accountId);
    const snapshot = await readAccountSnapshot(accountId);
    if (!existing || !snapshot) {
      continue;
    }

    const next: AccountRecord = {
      ...existing,
      sortOrder: index + 1
    };
    const accountDir = path.join(getAppPaths().accountsDir, accountId);
    await writeJsonFile(path.join(accountDir, META_FILE), next);
    updated.push(next);
  }

  return updated;
}

export async function deleteAccount(accountId: string): Promise<void> {
  const paths = getAppPaths();
  await fs.rm(path.join(paths.accountsDir, accountId), { recursive: true, force: true });
}
