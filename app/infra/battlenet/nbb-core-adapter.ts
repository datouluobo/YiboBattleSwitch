import path from "node:path";
import { createRequire } from "node:module";
import { getAppPaths } from "../storage/app-paths.js";

type NbbResult = {
  code: number;
  message?: string;
  data?: string;
};

type BattleNetAccountCtor = new (cacheRoot: string, wowExePath: string) => {
  switch(account: string): Promise<NbbResult>;
};

function loadNbbCore(): { BattleNetAccount: BattleNetAccountCtor } {
  const requireModule = createRequire(path.join(process.cwd(), "package.json"));
  const target = path.join(process.cwd(), "vendor", "nbb-core", "dist", "index.js");
  return requireModule(target) as { BattleNetAccount: BattleNetAccountCtor };
}

export async function switchViaNbbCore(accountName: string, wowExePath: string): Promise<NbbResult> {
  const { BattleNetAccount } = loadNbbCore();
  const accountRoot = getAppPaths().accountsDir;
  const runtime = new BattleNetAccount(accountRoot, wowExePath);
  return runtime.switch(accountName);
}
