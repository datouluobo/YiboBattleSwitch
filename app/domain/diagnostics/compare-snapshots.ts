import { promises as fs } from "node:fs";
import path from "node:path";
import { readJsonFile } from "../../infra/system/fs.js";
import { getAppPaths } from "../../infra/storage/app-paths.js";
import { DiagnosticSnapshot, OperationResult } from "../../shared/types/app.js";

function diffKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const beforeKeys = new Set(Object.keys(before));
  const afterKeys = new Set(Object.keys(after));
  const lines: string[] = [];

  for (const key of [...beforeKeys].filter((key) => !afterKeys.has(key)).sort()) {
    lines.push(`- removed: ${key}`);
  }
  for (const key of [...afterKeys].filter((key) => !beforeKeys.has(key)).sort()) {
    lines.push(`- added: ${key}`);
  }
  for (const key of [...afterKeys].filter((key) => beforeKeys.has(key)).sort()) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      lines.push(`- changed: ${key}`);
    }
  }

  return lines;
}

export async function compareLatestDiagnostics(): Promise<OperationResult> {
  const files = (await fs.readdir(getAppPaths().diagnosticsSnapshotsDir).catch(() => []))
    .filter((item) => item.endsWith(".json"))
    .sort()
    .reverse();

  if (files.length < 2) {
    return {
      ok: false,
      message: "至少需要两份诊断快照才能比较。"
    };
  }

  const latest = await readJsonFile<DiagnosticSnapshot | null>(path.join(getAppPaths().diagnosticsSnapshotsDir, files[0]), null);
  const previous = await readJsonFile<DiagnosticSnapshot | null>(path.join(getAppPaths().diagnosticsSnapshotsDir, files[1]), null);
  if (!latest || !previous) {
    return {
      ok: false,
      message: "诊断快照读取失败。"
    };
  }

  const registryBefore = {
    ...previous.snapshot.registry.wow,
    ...previous.snapshot.registry.wtcg,
    ...previous.snapshot.registry.encryption,
    ...previous.snapshot.registry.unifiedAuth
  };
  const registryAfter = {
    ...latest.snapshot.registry.wow,
    ...latest.snapshot.registry.wtcg,
    ...latest.snapshot.registry.encryption,
    ...latest.snapshot.registry.unifiedAuth
  };
  const configChanged = latest.snapshot.configRaw !== previous.snapshot.configRaw;
  const registryChanges = diffKeys(registryBefore, registryAfter);
  const localFileChanges = diffKeys(previous.snapshot.localFiles, latest.snapshot.localFiles);

  const reportLines = [
    "# Battle.net Diagnostic Compare",
    "",
    `- before: ${previous.createdAt} (${previous.label})`,
    `- after: ${latest.createdAt} (${latest.label})`,
    "",
    "## Summary",
    "",
    `- config changed: ${configChanged ? "yes" : "no"}`,
    `- registry changes: ${registryChanges.length}`,
    `- local file changes: ${localFileChanges.length}`,
    "",
    "## Registry Changes",
    "",
    ...(registryChanges.length ? registryChanges : ["- no changes"]),
    "",
    "## Local File Changes",
    "",
    ...(localFileChanges.length ? localFileChanges : ["- no changes"])
  ];

  const reportPath = path.join(getAppPaths().diagnosticsReportsDir, `${Date.now()}-compare-latest.md`);
  await fs.writeFile(reportPath, reportLines.join("\n"), "utf8");

  return {
    ok: true,
    message: `诊断对比已生成：${reportPath}`
  };
}
