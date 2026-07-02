import { promises as fs } from "node:fs";
import path from "node:path";
import { AccountCompatibilityRecord, AccountListItem, AccountRecord, BattleNetSnapshot } from "../../shared/types/app.js";
import { getAccountDisplayName } from "../../shared/account-display.js";
import { convertLegacyUnifiedAuth } from "../battlenet/battlenet-registry.js";
import { ensureDir, fileExists, readJsonFile, writeJsonFile } from "../system/fs.js";
import { formatDisplayDate, nowIso } from "../system/time.js";
import { getAppPaths } from "./app-paths.js";

const META_FILE = "meta.json";
const SNAPSHOT_FILE = "snapshot.json";

export function toAccountId(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/\s+/g, "-").toLowerCase();
}

function normalizeComparable(value: string): string {
  return value.trim().toLowerCase();
}

function pickPrimaryIdentifier(input: { accountId?: string; battleTag?: string; email?: string; phone?: string }): string {
  return input.accountId || input.battleTag || input.email || input.phone || `account-${Date.now()}`;
}

function matchesComparable(left: string, right: string): boolean {
  return Boolean(left && right && normalizeComparable(left) === normalizeComparable(right));
}

function scoreExistingRecordMatch(
  account: AccountRecord,
  input: { battleTag: string; email: string; phone: string; snapshot: BattleNetSnapshot }
): number {
  const expectedBattleTag = input.battleTag || input.snapshot.battleTag || "";
  let score = 0;

  if (matchesComparable(account.battleTag, expectedBattleTag)) {
    score += 10;
  }
  if (matchesComparable(account.phone, input.phone)) {
    score += 8;
  }
  if (matchesComparable(account.email, input.email)) {
    score += 6;
  }

  // 兼容旧数据：早期版本可能把 BattleTag 错存到 email 字段里。
  if (matchesComparable(account.email, expectedBattleTag)) {
    score += 4;
  }

  if (account.battleTag) {
    score += 2;
  }
  if (account.phone) {
    score += 1;
  }

  return score;
}

async function resolveAccountIdForSave(
  input: { battleTag: string; email: string; phone: string; snapshot: BattleNetSnapshot },
  options?: { preferExisting?: boolean }
): Promise<{ id: string; existing: AccountRecord | null }> {
  const preferExisting = Boolean(options?.preferExisting);
  const baseId = toAccountId(pickPrimaryIdentifier({
    accountId: input.snapshot.accountId,
    battleTag: input.battleTag,
    email: input.email,
    phone: input.phone
  }));
  const accounts = await listAccounts();
  const currentAccountId = input.snapshot.accountId?.trim() || "";
  const currentBattleTag = input.battleTag.trim() || input.snapshot.battleTag?.trim() || "";
  const currentEmail = input.email.trim();
  const currentPhone = input.phone.trim();

  if (preferExisting) {
    const exactAccountIdMatches: AccountRecord[] = [];
    if (currentAccountId) {
      for (const account of accounts) {
        const existingSnapshot = await readAccountSnapshot(account.id);
        if (!existingSnapshot?.accountId || existingSnapshot.accountId.trim() !== currentAccountId) {
          continue;
        }
        const existing = await readAccount(account.id);
        if (existing) {
          exactAccountIdMatches.push(existing);
        }
      }
    }

    if (exactAccountIdMatches.length) {
      const bestMatch = exactAccountIdMatches
        .sort((left, right) => scoreExistingRecordMatch(right, input) - scoreExistingRecordMatch(left, input))[0];
      return {
        id: bestMatch.id,
        existing: bestMatch
      };
    }

    const exactIdentityMatches: AccountRecord[] = [];
    for (const account of accounts) {
      const existing = await readAccount(account.id);
      if (!existing) {
        continue;
      }
      const hasExactIdentityMatch = matchesComparable(existing.battleTag, currentBattleTag)
        || matchesComparable(existing.email, currentEmail)
        || matchesComparable(existing.phone, currentPhone)
        || matchesComparable(existing.email, currentBattleTag);
      if (hasExactIdentityMatch) {
        exactIdentityMatches.push(existing);
      }
    }

    if (exactIdentityMatches.length === 1) {
      return {
        id: exactIdentityMatches[0].id,
        existing: exactIdentityMatches[0]
      };
    }

    if (exactIdentityMatches.length > 1) {
      const bestMatch = exactIdentityMatches
        .sort((left, right) => scoreExistingRecordMatch(right, input) - scoreExistingRecordMatch(left, input))[0];
      if (scoreExistingRecordMatch(bestMatch, input) >= 10) {
        return {
          id: bestMatch.id,
          existing: bestMatch
        };
      }
    }
  }

  const occupiedIds = new Set(accounts.map((account) => account.id));
  if (!occupiedIds.has(baseId)) {
    return {
      id: baseId,
      existing: null
    };
  }

  let suffix = 2;
  while (occupiedIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }

  return {
    id: `${baseId}-${suffix}`,
    existing: null
  };
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
    account: record.email || record.phone || record.battleTag,
    battleTag: record.battleTag,
    email: record.email,
    phone: record.phone,
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
    battleTag: snapshot.battleTag,
    accountId: snapshot.accountId,
    battleNetConfigText: snapshot.configRaw,
    battleNetConfigJson: snapshot.configJson,
    battleNetFileBlobs: snapshot.fileBlobs,
    battleNetLocalBlobs: snapshot.localFiles,
    battleNetLocalFiles: snapshot.localFiles
  });
}

async function readCompatMeta(folderPath: string, accountId: string): Promise<AccountRecord | null> {
  const meta = await readJsonFile<Record<string, unknown> | null>(path.join(folderPath, META_FILE), null);
  const info = await readJsonFile<Record<string, unknown> | null>(path.join(folderPath, "info.json"), null);
  if (!info) {
    return null;
  }

  const email = String(meta?.email || info.email || info.account || "");
  const phone = String(meta?.phone || info.phone || "");
  const battleTag = String(meta?.battleTag || info.battleTag || "");
  const updatedAt = typeof meta?.updatedAt === "string"
    ? meta.updatedAt
    : typeof info.importedAt === "string"
      ? info.importedAt
      : nowIso();
  return {
    id: accountId,
    battleTag,
    email,
    phone,
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
      battleTag: typeof fullSnapshot.battleTag === "string" ? fullSnapshot.battleTag : "",
      accountId: typeof fullSnapshot.accountId === "string" ? fullSnapshot.accountId : "",
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
      battleTag: "",
      accountId: "",
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
    battleTag: typeof raw.battleTag === "string" ? raw.battleTag : "",
    accountId: typeof raw.accountId === "string" ? raw.accountId : "",
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

export function maskPhone(value: string): string {
  const digitsOnly = value.replace(/\s+/g, "");
  if (!digitsOnly || digitsOnly.length < 7) {
    return value;
  }
  return `${digitsOnly.slice(0, 3)}****${digitsOnly.slice(-4)}`;
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
      battleTag: account.battleTag,
      email: account.email,
      maskedEmail: maskEmail(account.email),
      phone: account.phone,
      maskedPhone: maskPhone(account.phone),
      displayName: getAccountDisplayName(account),
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
    const payload = await readJsonFile<Record<string, unknown> | null>(metaPath, null);
    if (!payload) {
      return null;
    }
    return {
      id: String(payload.id || accountId),
      battleTag: String(payload.battleTag || ""),
      email: String(payload.email || ""),
      phone: String(payload.phone || ""),
      description: String(payload.description || ""),
      createdAt: String(payload.createdAt || nowIso()),
      updatedAt: String(payload.updatedAt || nowIso()),
      importedFrom: typeof payload.importedFrom === "string" ? payload.importedFrom : undefined,
      snapshotVersion: Number(payload.snapshotVersion || 1),
      sortOrder: typeof payload.sortOrder === "number" ? payload.sortOrder : undefined
    };
  }

  const legacyOwnPath = path.join(folderPath, "account.json");
  if (await fileExists(legacyOwnPath)) {
    const payload = await readJsonFile<Record<string, unknown> | null>(legacyOwnPath, null);
    if (payload && typeof payload.id === "string" && typeof payload.email === "string") {
      const record: AccountRecord = {
        id: payload.id,
        battleTag: String(payload.battleTag || ""),
        email: payload.email,
        phone: String(payload.phone || ""),
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
  battleTag: string;
  email: string;
  phone: string;
  description: string;
  snapshot: BattleNetSnapshot;
  importedFrom?: string;
  preferExisting?: boolean;
}): Promise<AccountRecord> {
  const paths = getAppPaths();
  const { id, existing } = await resolveAccountIdForSave(input, { preferExisting: input.preferExisting });
  const timestamp = nowIso();
  const record: AccountRecord = {
    id,
    battleTag: input.battleTag,
    email: input.email,
    phone: input.phone,
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

  const next: AccountRecord = {
    ...existing,
    description,
    updatedAt: nowIso()
  };

  const accountDir = path.join(getAppPaths().accountsDir, accountId);
  await ensureDir(accountDir);
  await writeJsonFile(path.join(accountDir, META_FILE), next);
  await writeJsonFile(path.join(accountDir, SNAPSHOT_FILE), snapshot);
  await writeCompatibilityFiles(accountDir, next, snapshot);

  return next;
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
