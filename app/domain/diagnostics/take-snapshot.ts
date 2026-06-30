import path from "node:path";
import { writeJsonFile } from "../../infra/system/fs.js";
import { nowIso } from "../../infra/system/time.js";
import { takeBattleNetSnapshot } from "../../infra/battlenet/battlenet-snapshot.js";
import { getAppPaths } from "../../infra/storage/app-paths.js";
import { DiagnosticSnapshot, OperationResult } from "../../shared/types/app.js";

export async function takeDiagnosticSnapshot(label: string): Promise<OperationResult> {
  const snapshot = await takeBattleNetSnapshot(label);
  const record: DiagnosticSnapshot = {
    id: `${Date.now()}`,
    label,
    createdAt: nowIso(),
    snapshot
  };
  const filePath = path.join(getAppPaths().diagnosticsSnapshotsDir, `${record.createdAt.replace(/[:.]/g, "-")}-${label}.json`);
  await writeJsonFile(filePath, record);
  return {
    ok: true,
    message: `诊断快照已保存：${filePath}`
  };
}
