import { saveAccount } from "../../infra/storage/account-library.js";
import { takeBattleNetSnapshot } from "../../infra/battlenet/battlenet-snapshot.js";
import { OperationResult } from "../../shared/types/app.js";

export async function saveCurrentAccount(input: { accountName: string; description: string }): Promise<OperationResult> {
  if (!input.accountName.trim()) {
    return {
      ok: false,
      message: "账号名称不能为空。"
    };
  }

  const snapshot = await takeBattleNetSnapshot("save-current-account");
  const hasAuthMaterial = Boolean(snapshot.registry.wow.WEB_TOKEN?.value || Object.keys(snapshot.registry.unifiedAuth).length);
  if (!hasAuthMaterial) {
    return {
      ok: false,
      message: "当前 Battle.net 状态中没有读取到可用认证材料，暂时不能保存为账号。"
    };
  }

  await saveAccount({
    email: input.accountName.trim(),
    description: input.description.trim(),
    snapshot
  });

  return {
    ok: true,
    message: `已保存账号：${input.accountName.trim()}`
  };
}
