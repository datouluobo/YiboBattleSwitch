import { readCurrentBattleNetIdentity } from "./battlenet-current-identity.js";

export async function detectBattleNetAccountLabel(): Promise<string> {
  const identity = await readCurrentBattleNetIdentity();
  if (identity?.battleTag) {
    return identity.battleTag;
  }
  return "";
}
