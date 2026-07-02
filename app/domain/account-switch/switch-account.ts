import { createBackup } from "../backup/create-backup.js";
import { formatBattleNetAuthMaterialSummary } from "../../infra/battlenet/battlenet-auth-materials.js";
import { readAccount, readAccountSnapshot } from "../../infra/storage/account-library.js";
import { launchBattleNet } from "../../infra/battlenet/battlenet-launcher.js";
import { stopForSwitch } from "../../infra/battlenet/battlenet-process.js";
import { restoreBattleNetSnapshotWithProfile } from "../../infra/battlenet/battlenet-restore.js";
import { logger } from "../../infra/system/logger.js";
import { restoreLatestBackup } from "../backup/restore-latest-backup.js";
import { getAccountDisplayName } from "../../shared/account-display.js";
import { SwitchAccountResult } from "../../shared/types/app.js";
import { getSettings } from "../../infra/storage/app-config.js";

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function switchAccount(accountId: string): Promise<SwitchAccountResult> {
  const settings = await getSettings();
  const account = await readAccount(accountId);
  const snapshot = await readAccountSnapshot(accountId);
  if (!account || !snapshot) {
    return {
      ok: false,
      message: "目标账号不存在或快照不完整。"
    };
  }

  const hasConfig = Boolean(snapshot.configRaw);
  const hasAuthMaterial = Boolean(snapshot.registry.wow.WEB_TOKEN?.value || Object.keys(snapshot.registry.unifiedAuth).length);
  const displayName = getAccountDisplayName(account);
  await logger.info(
    `[switch] profile=${settings.battleNetSwitchProfile} target=${displayName || accountId} config=${hasConfig} auth=${hasAuthMaterial} roaming=${Object.keys(snapshot.fileBlobs || {}).length} local=${Object.keys(snapshot.localFiles || {}).length} authSummary=${formatBattleNetAuthMaterialSummary(snapshot)}`
  );
  const requireAuthMaterial = settings.battleNetSwitchProfile === "N";
  if (!hasConfig || (requireAuthMaterial && !hasAuthMaterial)) {
    return {
      ok: false,
      message: requireAuthMaterial
        ? "目标账号缺少完整切换材料。请先在该账号的正常登录态下重新执行一次“保存当前登录”。"
        : "目标账号缺少 Battle.net.config 切换材料。请先在该账号的正常登录态下重新执行一次“保存当前登录”。"
    };
  }

  await createBackup(`before-switch-${accountId}`);
  const stopResult = await stopForSwitch();
  if (stopResult.remaining.length) {
    const manualCloseHint = stopResult.failureReason === "AccessDenied"
      ? "当前 Battle.net 进程的完整性级别高于本工具，Windows 拒绝直接结束。请先在 Battle.net 中手动完全退出后，再点击一次切换。"
      : "请先在 Battle.net 中手动完全退出后，再点击一次切换。";
    return {
      ok: false,
      message: `Battle.net 相关进程未完全退出，已中止切换。原因：${stopResult.failureReason ?? "UnknownError"}。${manualCloseHint}`,
      rollbackTriggered: false,
      failureReason: stopResult.failureReason
    };
  }

  try {
    await restoreBattleNetSnapshotWithProfile(snapshot, `account:${displayName}`, settings.battleNetSwitchProfile);
    await wait(350);
    await launchBattleNet();
    return {
      ok: true,
      message: `已按 ${settings.battleNetSwitchProfile} 方案切换到账号：${displayName}`
    };
  } catch (error) {
    await logger.error(`[switch] failed target=${displayName} error=${error instanceof Error ? error.stack || error.message : String(error)}`);
    await restoreLatestBackup();
    return {
      ok: false,
      message: `切换失败，已尝试回滚：${error instanceof Error ? error.message : String(error)}`,
      rollbackTriggered: true
    };
  }
}
