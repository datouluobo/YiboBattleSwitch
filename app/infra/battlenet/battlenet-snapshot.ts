import path from "node:path";
import { BattleNetSnapshot } from "../../shared/types/app.js";
import { nowIso } from "../system/time.js";
import { exportBattleNetRegistry, getTempRegistryExportDir, readBattleNetRegistrySnapshot } from "./battlenet-registry.js";
import { readBattleNetConfig } from "./battlenet-config.js";
import { readCurrentBattleNetIdentity } from "./battlenet-current-identity.js";
import { readBattleNetLocalState } from "./battlenet-local-state.js";
import { readBattleNetRoamingState } from "./battlenet-roaming-state.js";

function extractSavedAccountNames(configJson: unknown): string[] {
  if (!configJson || typeof configJson !== "object") {
    return [];
  }

  const client = (configJson as Record<string, unknown>).Client;
  if (!client || typeof client !== "object") {
    return [];
  }

  const saved = (client as Record<string, unknown>).SavedAccountNames;
  if (Array.isArray(saved)) {
    return saved.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof saved === "string" && saved.trim()) {
    return saved
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

export async function takeBattleNetSnapshot(tag = "snapshot"): Promise<BattleNetSnapshot> {
  const [config, registry, fileBlobs, currentIdentity] = await Promise.all([
    readBattleNetConfig(),
    readBattleNetRegistrySnapshot(),
    readBattleNetRoamingState(),
    readCurrentBattleNetIdentity()
  ]);
  const registryDir = path.join(getTempRegistryExportDir(), `${tag}-${Date.now()}`);
  const registryExports = await exportBattleNetRegistry(registryDir);
  const savedAccountNames = extractSavedAccountNames(config.json);
  const stableLocalFiles = await readBattleNetLocalState(currentIdentity?.accountId || "");

  return {
    capturedAt: nowIso(),
    configPath: config.path,
    configRaw: config.raw,
    configJson: config.json,
    fileBlobs,
    gameAccount: registry.wow.GAME_ACCOUNT?.value || "",
    battleTag: currentIdentity?.battleTag || "",
    accountId: currentIdentity?.accountId || "",
    savedAccountNames,
    registry,
    registryExports,
    localFiles: stableLocalFiles
  };
}
