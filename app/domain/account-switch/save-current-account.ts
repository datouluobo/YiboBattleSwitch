import { formatBattleNetAuthMaterialSummary } from "../../infra/battlenet/battlenet-auth-materials.js";
import { saveAccount } from "../../infra/storage/account-library.js";
import { readBattleNetRuntimeState } from "../../infra/battlenet/battlenet-current-identity.js";
import { takeBattleNetSnapshot } from "../../infra/battlenet/battlenet-snapshot.js";
import { logger } from "../../infra/system/logger.js";
import { getAccountDisplayName } from "../../shared/account-display.js";
import { OperationResult } from "../../shared/types/app.js";

export async function saveCurrentAccount(input: { battleTag: string; email: string; phone: string; description: string }): Promise<OperationResult> {
  if (!input.battleTag.trim() && !input.email.trim() && !input.phone.trim()) {
    return {
      ok: false,
      message: "BattleTag、邮箱、手机号至少填写一项。"
    };
  }

  const runtimeState = await readBattleNetRuntimeState();
  if (runtimeState.status === "login-required") {
    return {
      ok: false,
      message: "当前 Battle.net 还处在登录验证或未稳定切换状态，暂时不要保存当前登录。请先完成验证并确认客户端已经真正进入目标账号后，再重新保存。"
    };
  }

  const snapshot = await takeBattleNetSnapshot("save-current-account");
  await logger.info(`[save-current-account] auth=${formatBattleNetAuthMaterialSummary(snapshot)}`);
  const hasAuthMaterial = Boolean(snapshot.registry.wow.WEB_TOKEN?.value || Object.keys(snapshot.registry.unifiedAuth).length);
  if (!hasAuthMaterial) {
    return {
      ok: false,
      message: "当前 Battle.net 状态中没有读取到可用认证材料，暂时不能保存为账号。"
    };
  }

  await saveAccount({
    battleTag: input.battleTag.trim() || snapshot.battleTag || "",
    email: input.email.trim(),
    phone: input.phone.trim(),
    description: input.description.trim(),
    snapshot,
    preferExisting: false
  });

  const displayName = getAccountDisplayName({
    id: "",
    battleTag: input.battleTag.trim() || snapshot.battleTag || "",
    email: input.email.trim(),
    phone: input.phone.trim()
  });

  return {
    ok: true,
    message: `已保存账号：${displayName}`
  };
}
