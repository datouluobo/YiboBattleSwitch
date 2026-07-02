import { createHash } from "node:crypto";
import { BattleNetSnapshot } from "../../shared/types/app.js";

export interface BattleNetAuthMaterialSummary {
  accountId: string;
  unifiedAuthKeys: string[];
  unifiedAuthHashes: Record<string, string>;
  cachedDataHash: string;
  accountDbHash: string;
  cookiesHash: string;
}

function shortHash(value: string): string {
  if (!value) {
    return "";
  }
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function firstPresent(values: Array<string | undefined>): string {
  for (const value of values) {
    if (value) {
      return value;
    }
  }
  return "";
}

export function summarizeBattleNetAuthMaterials(snapshot: BattleNetSnapshot): BattleNetAuthMaterialSummary {
  const accountId = snapshot.accountId?.trim() || "";
  const localFiles = snapshot.localFiles || {};
  const roamingFiles = snapshot.fileBlobs || {};
  const unifiedAuth = snapshot.registry.unifiedAuth || {};
  const accountDbPath = accountId ? `Account\\${accountId}\\account.db` : "";
  const cookiesPath = accountId ? `BrowserCaches\\${accountId}\\Network\\Cookies` : "";
  const unifiedAuthKeys = Object.keys(unifiedAuth).sort();

  return {
    accountId,
    unifiedAuthKeys,
    unifiedAuthHashes: Object.fromEntries(
      unifiedAuthKeys.map((key) => [key, shortHash(unifiedAuth[key]?.value || "")])
    ),
    cachedDataHash: shortHash(firstPresent([
      localFiles["CachedData.db"],
      roamingFiles["CachedData.db"]
    ])),
    accountDbHash: shortHash(firstPresent([
      accountDbPath ? localFiles[accountDbPath] : "",
      accountDbPath ? roamingFiles[accountDbPath] : ""
    ])),
    cookiesHash: shortHash(cookiesPath ? localFiles[cookiesPath] : "")
  };
}

export function formatBattleNetAuthMaterialSummary(snapshot: BattleNetSnapshot): string {
  const summary = summarizeBattleNetAuthMaterials(snapshot);
  const unifiedAuthLabel = summary.unifiedAuthKeys.length
    ? summary.unifiedAuthKeys.map((key) => `${key}:${summary.unifiedAuthHashes[key] || "-"}`).join(",")
    : "-";

  return [
    `accountId=${summary.accountId || "-"}`,
    `unifiedAuth=${unifiedAuthLabel}`,
    `cachedData=${summary.cachedDataHash || "-"}`,
    `accountDb=${summary.accountDbHash || "-"}`,
    `cookies=${summary.cookiesHash || "-"}`
  ].join(" ");
}
