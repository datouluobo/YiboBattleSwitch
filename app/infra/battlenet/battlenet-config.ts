import { promises as fs } from "node:fs";
import path from "node:path";
import { app } from "electron";
import { fileExists } from "../system/fs.js";
import { BattleNetSnapshot } from "../../shared/types/app.js";

export interface BattleNetConfigFields {
  savedAccountName: string;
  lastLoginAccount: string;
  lastLoginRegion: string;
  lastLoginAddress: string;
  lastLoginTassadar: string;
}

export function getBattleNetConfigPath(): string {
  return path.join(app.getPath("appData"), "Battle.net", "Battle.net.config");
}

export async function readBattleNetConfig(): Promise<{ path: string; raw: string; json: unknown | null }> {
  const configPath = getBattleNetConfigPath();
  if (!(await fileExists(configPath))) {
    return { path: configPath, raw: "", json: null };
  }
  const raw = await fs.readFile(configPath, "utf8");
  let json: unknown | null = null;
  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }
  return {
    path: configPath,
    raw,
    json
  };
}

export async function writeBattleNetConfig(raw: string): Promise<void> {
  const configPath = getBattleNetConfigPath();
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, raw, "utf8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseSavedAccountNames(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function extractFieldsFromJson(configJson: unknown): BattleNetConfigFields {
  const result: BattleNetConfigFields = {
    savedAccountName: "",
    lastLoginAccount: "",
    lastLoginRegion: "",
    lastLoginAddress: "",
    lastLoginTassadar: ""
  };

  if (!isRecord(configJson)) {
    return result;
  }

  const client = isRecord(configJson.Client) ? configJson.Client : null;
  if (client) {
    result.savedAccountName = parseSavedAccountNames(client.SavedAccountNames)[0] || "";
    result.lastLoginAccount = readString(client.LastLoginAccount);
  }

  for (const value of Object.values(configJson)) {
    if (!isRecord(value)) {
      continue;
    }
    const services = isRecord(value.Services) ? value.Services : null;
    if (!services) {
      continue;
    }
    result.lastLoginRegion ||= readString(services.LastLoginRegion);
    result.lastLoginAddress ||= readString(services.LastLoginAddress);
    result.lastLoginTassadar ||= readString(services.LastLoginTassadar);
  }

  return result;
}

export function extractBattleNetConfigFields(configJson: unknown): BattleNetConfigFields {
  return extractFieldsFromJson(configJson);
}

export function extractBattleNetConfigFieldsFromSnapshot(snapshot: BattleNetSnapshot): BattleNetConfigFields {
  if (snapshot.configJson) {
    return extractFieldsFromJson(snapshot.configJson);
  }

  if (snapshot.configRaw.trim()) {
    try {
      return extractFieldsFromJson(JSON.parse(snapshot.configRaw));
    } catch {
      // Ignore invalid JSON fallback.
    }
  }

  return extractFieldsFromJson(null);
}

export async function patchBattleNetConfig(fields: Partial<BattleNetConfigFields>): Promise<void> {
  const current = await readBattleNetConfig();
  const base = isRecord(current.json) ? structuredClone(current.json) : {};

  if (!isRecord(base.Client)) {
    base.Client = {};
  }

  const client = base.Client as Record<string, unknown>;
  if (typeof fields.savedAccountName === "string" && fields.savedAccountName.trim()) {
    client.SavedAccountNames = fields.savedAccountName.trim();
  }
  if (typeof fields.lastLoginAccount === "string" && fields.lastLoginAccount.trim()) {
    client.LastLoginAccount = fields.lastLoginAccount.trim();
  }

  for (const value of Object.values(base)) {
    if (!isRecord(value) || !isRecord(value.Services)) {
      continue;
    }
    const services = value.Services as Record<string, unknown>;
    if (typeof fields.lastLoginRegion === "string" && fields.lastLoginRegion.trim()) {
      services.LastLoginRegion = fields.lastLoginRegion.trim();
    }
    if (typeof fields.lastLoginAddress === "string" && fields.lastLoginAddress.trim()) {
      services.LastLoginAddress = fields.lastLoginAddress.trim();
    }
    if (typeof fields.lastLoginTassadar === "string" && fields.lastLoginTassadar.trim()) {
      services.LastLoginTassadar = fields.lastLoginTassadar.trim();
    }
  }

  await writeBattleNetConfig(`${JSON.stringify(base, null, 4)}\n`);
}
