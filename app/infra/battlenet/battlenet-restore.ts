import { logger } from "../system/logger.js";
import { BattleNetSnapshot, BattleNetSwitchProfile } from "../../shared/types/app.js";
import { restoreBattleNetRegistry } from "./battlenet-registry.js";
import { extractBattleNetConfigFieldsFromSnapshot, patchBattleNetConfig, writeBattleNetConfig } from "./battlenet-config.js";
import { restoreBattleNetRoamingState } from "./battlenet-roaming-state.js";
import { restoreBattleNetLocalState } from "./battlenet-local-state.js";

function countRegistryValues(snapshot: BattleNetSnapshot): number {
  return Object.keys(snapshot.registry.wow || {}).length
    + Object.keys(snapshot.registry.wtcg || {}).length
    + Object.keys(snapshot.registry.encryption || {}).length
    + Object.keys(snapshot.registry.unifiedAuth || {}).length;
}

export async function restoreBattleNetSnapshot(snapshot: BattleNetSnapshot, sourceLabel: string): Promise<void> {
  await logger.info(
    `[restore] source=${sourceLabel} registry=${countRegistryValues(snapshot)} roaming=${Object.keys(snapshot.fileBlobs || {}).length} local=${Object.keys(snapshot.localFiles || {}).length} config=${snapshot.configRaw ? "yes" : "no"}`
  );

  // Align restore order with the original prototype chain:
  // registry -> config -> roaming files -> local files.
  await restoreBattleNetRegistry(snapshot.registry);
  await writeBattleNetConfig(snapshot.configRaw);
  await restoreBattleNetRoamingState(snapshot.fileBlobs || {});
  await restoreBattleNetLocalState(snapshot.localFiles || {});
}

export async function restoreBattleNetSnapshotWithProfile(
  snapshot: BattleNetSnapshot,
  sourceLabel: string,
  profile: BattleNetSwitchProfile
): Promise<void> {
  await logger.info(`[restore] profile=${profile} source=${sourceLabel}`);

  if (profile === "N") {
    await restoreBattleNetSnapshot(snapshot, sourceLabel);
    return;
  }

  const fields = extractBattleNetConfigFieldsFromSnapshot(snapshot);
  if (!fields.savedAccountName) {
    throw new Error(`目标账号缺少 Battle.net.config 账号指向，无法按 ${profile} 方案切换。`);
  }

  if (profile === "D" || profile === "M") {
    await patchBattleNetConfig({
      savedAccountName: fields.savedAccountName
    });
    return;
  }

  await patchBattleNetConfig({
    savedAccountName: fields.savedAccountName,
    lastLoginRegion: fields.lastLoginRegion,
    lastLoginAddress: fields.lastLoginAddress,
    lastLoginTassadar: fields.lastLoginTassadar
  });
}
