import { promises as fs } from "node:fs";
import { readJsonFile } from "../../infra/system/fs.js";
import { launchBattleNet } from "../../infra/battlenet/battlenet-launcher.js";
import { stopForSwitch } from "../../infra/battlenet/battlenet-process.js";
import { restoreBattleNetSnapshot } from "../../infra/battlenet/battlenet-restore.js";
import { selectRecommendedBackup } from "./select-recommended-backup.js";
import { BattleNetSnapshot, OperationResult } from "../../shared/types/app.js";

export async function restoreLatestBackup(): Promise<OperationResult> {
  const backupFile = await selectRecommendedBackup();
  if (!backupFile) {
    return { ok: false, message: "没有可恢复的备份。" };
  }

  const stopResult = await stopForSwitch();
  if (stopResult.remaining.length) {
    return { ok: false, message: `Battle.net 相关进程未完全退出：${stopResult.remaining.map((item) => item.imageName).join(", ")}` };
  }

  const snapshot = await readJsonFile<BattleNetSnapshot | null>(backupFile, null);
  if (!snapshot) {
    return { ok: false, message: "备份文件损坏，无法恢复。" };
  }

  await restoreBattleNetSnapshot(snapshot, `backup:${backupFile}`);
  await launchBattleNet();

  return { ok: true, message: `已恢复最近备份：${backupFile}` };
}
