import { DatabaseSync } from "node:sqlite";
import { promises as fs } from "node:fs";
import path from "node:path";
import { app } from "electron";
import { fileExists } from "../system/fs.js";

export interface BattleNetLoginCacheEntry {
  name: string;
  environment: string;
  battleTag: string;
  accountId: string;
  connectedEnvironments: string;
}

export interface BattleNetCurrentIdentity {
  accountId: string;
  battleTag: string;
  environment: string;
  source: "log+cache" | "cache";
}

export interface BattleNetRuntimeState {
  status: "stable" | "login-required" | "unknown";
  accountId: string;
  reason: string;
}

function getLocalBattleNetRoot(): string {
  return path.join(process.env.LOCALAPPDATA || app.getPath("appData"), "Battle.net");
}

function getCachedDataDbPath(): string {
  return path.join(getLocalBattleNetRoot(), "CachedData.db");
}

function getLogsDir(): string {
  return path.join(getLocalBattleNetRoot(), "Logs");
}

function readLoginCacheRows(dbPath: string): BattleNetLoginCacheEntry[] {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const rows = db.prepare(`
      SELECT name, environment, battle_tag, account_id_lo, connected_environments
      FROM login_cache
    `).all() as Array<{
      name: string;
      environment: string;
      battle_tag: string;
      account_id_lo: number | string;
      connected_environments: string;
    }>;

    return rows.map((row) => ({
      name: String(row.name || ""),
      environment: String(row.environment || ""),
      battleTag: String(row.battle_tag || ""),
      accountId: String(row.account_id_lo || ""),
      connectedEnvironments: String(row.connected_environments || "")
    }));
  } finally {
    db.close();
  }
}

async function readCurrentAccountIdFromLogs(): Promise<string> {
  const logsDir = getLogsDir();
  const entries = await fs.readdir(logsDir, { withFileTypes: true }).catch(() => []);
  const files = entries
    .filter((entry) => entry.isFile() && /^battle\.net-.*\.log$/i.test(entry.name))
    .map((entry) => path.join(logsDir, entry.name));

  const detailed = await Promise.all(files.map(async (filePath) => ({
    filePath,
    stat: await fs.stat(filePath).catch(() => null)
  })));

  const sorted = detailed
    .filter((item): item is { filePath: string; stat: NonNullable<typeof item.stat> } => Boolean(item.stat))
    .sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs);

  const pattern = /Opened database at:\s+.*\\Account\\(\d+)\\account\.db/gi;

  for (const item of sorted.slice(0, 5)) {
    const raw = await fs.readFile(item.filePath, "utf8").catch(() => "");
    if (!raw) {
      continue;
    }

    let match: RegExpExecArray | null = null;
    let last = "";
    while ((match = pattern.exec(raw)) !== null) {
      last = match[1] || "";
    }
    if (last) {
      return last;
    }
  }

  return "";
}

async function listRecentBattleNetLogs(): Promise<string[]> {
  const logsDir = getLogsDir();
  const entries = await fs.readdir(logsDir, { withFileTypes: true }).catch(() => []);
  const files = entries
    .filter((entry) => entry.isFile() && /^battle\.net-.*\.log$/i.test(entry.name))
    .map((entry) => path.join(logsDir, entry.name));

  const detailed = await Promise.all(files.map(async (filePath) => ({
    filePath,
    stat: await fs.stat(filePath).catch(() => null)
  })));

  return detailed
    .filter((item): item is { filePath: string; stat: NonNullable<typeof item.stat> } => Boolean(item.stat))
    .sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs)
    .slice(0, 3)
    .map((item) => item.filePath);
}

function readFallbackAccountIdFromCache(dbPath: string): string {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const row = db.prepare(`
      SELECT value
      FROM key_value_store
      WHERE key = 'features_cached_data_points'
      LIMIT 1
    `).get() as { value?: string } | undefined;

    if (!row?.value) {
      return "";
    }

    const payload = JSON.parse(row.value) as { account_id?: number | string };
    return payload.account_id ? String(payload.account_id) : "";
  } catch {
    return "";
  } finally {
    db.close();
  }
}

export async function readBattleNetLoginCache(): Promise<BattleNetLoginCacheEntry[]> {
  const dbPath = getCachedDataDbPath();
  if (!(await fileExists(dbPath))) {
    return [];
  }

  try {
    return readLoginCacheRows(dbPath);
  } catch {
    return [];
  }
}

export async function readCurrentBattleNetIdentity(): Promise<BattleNetCurrentIdentity | null> {
  const dbPath = getCachedDataDbPath();
  if (!(await fileExists(dbPath))) {
    return null;
  }

  let loginCache: BattleNetLoginCacheEntry[] = [];
  try {
    loginCache = readLoginCacheRows(dbPath);
  } catch {
    return null;
  }

  const currentAccountId = await readCurrentAccountIdFromLogs() || readFallbackAccountIdFromCache(dbPath);
  if (!currentAccountId) {
    return null;
  }

  const matched = loginCache.find((entry) => entry.accountId === currentAccountId);
  if (!matched) {
    return {
      accountId: currentAccountId,
      battleTag: "",
      environment: "",
      source: "cache"
    };
  }

  return {
    accountId: matched.accountId,
    battleTag: matched.battleTag,
    environment: matched.environment,
    source: matched.accountId === currentAccountId ? "log+cache" : "cache"
  };
}

export async function readBattleNetRuntimeState(): Promise<BattleNetRuntimeState> {
  const logFiles = await listRecentBattleNetLogs();
  if (!logFiles.length) {
    return {
      status: "unknown",
      accountId: "",
      reason: "未找到 Battle.net 日志"
    };
  }

  const accountOpenPattern = /Opened database at:\s+.*\\Account\\(\d+)\\account\.db/i;
  const loginPromptPattern = /UAuth: begin loading:\s+https:\/\/account\.battlenet\.com\.cn\/login\//i;
  const loginFailedPattern = /Login failed\./i;
  const authErrorPattern = /UAuth: (?:status changed: Error|browser state changed: Error|browser error:)/i;

  const events: Array<{ type: "account-open" | "login-prompt" | "login-failed" | "auth-error"; accountId?: string }> = [];

  for (const filePath of logFiles.reverse()) {
    const raw = await fs.readFile(filePath, "utf8").catch(() => "");
    if (!raw) {
      continue;
    }
    for (const line of raw.split(/\r?\n/)) {
      const accountMatch = line.match(accountOpenPattern);
      if (accountMatch?.[1]) {
        events.push({ type: "account-open", accountId: accountMatch[1] });
        continue;
      }
      if (loginPromptPattern.test(line)) {
        events.push({ type: "login-prompt" });
        continue;
      }
      if (loginFailedPattern.test(line)) {
        events.push({ type: "login-failed" });
        continue;
      }
      if (authErrorPattern.test(line)) {
        events.push({ type: "auth-error" });
      }
    }
  }

  if (!events.length) {
    return {
      status: "unknown",
      accountId: "",
      reason: "日志里没有解析到登录状态事件"
    };
  }

  let lastOpenedAccountId = "";
  let lastOpenedIndex = -1;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.type === "account-open" && event.accountId) {
      lastOpenedAccountId = event.accountId;
      lastOpenedIndex = index;
    }
  }

  if (lastOpenedAccountId) {
    const tailEvents = events.slice(lastOpenedIndex + 1).filter((event) => event.type !== "account-open");
    const blockingEvent = tailEvents.find((event) => event.type === "login-failed" || event.type === "auth-error");
    if (blockingEvent) {
      return {
        status: "login-required",
        accountId: lastOpenedAccountId,
        reason: blockingEvent.type
      };
    }

    // Battle.net 在账号库已经打开后，仍可能继续输出登录页加载日志；
    // 仅凭这些页面加载事件不足以证明当前账号态不可保存。
    return {
      status: "stable",
      accountId: lastOpenedAccountId,
      reason: "account-open"
    };
  }

  const firstAuthEvent = events.find((event) => event.type !== "account-open");
  if (firstAuthEvent) {
    return {
      status: "login-required",
      accountId: "",
      reason: firstAuthEvent.type
    };
  }

  return {
    status: "unknown",
    accountId: "",
    reason: "无法判断当前登录状态"
  };
}
