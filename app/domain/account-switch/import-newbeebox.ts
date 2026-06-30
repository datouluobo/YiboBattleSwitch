import path from "node:path";
import { app } from "electron";
import { importAccountLibrary } from "../../infra/storage/library-transfer.js";
import { OperationResult } from "../../shared/types/app.js";

export async function importFromNewBeeBox(): Promise<OperationResult> {
  const battleCacheRoot = path.join(app.getPath("appData"), "NewBeeBox", "battleCache");
  const summary = await importAccountLibrary(battleCacheRoot).catch(() => ({ imported: 0, updated: 0 }));

  if (!summary.imported && !summary.updated) {
    return {
      ok: false,
      message: "没有发现可导入的 NewBeeBox 历史账号。"
    };
  }

  return {
    ok: true,
    message: `已从 NewBeeBox 导入账号。新增 ${summary.imported}，更新 ${summary.updated}`
  };
}
