import { PROCESS_IMAGE_NAMES } from "../../shared/constants/app.js";
import { ProcessMatch, ProcessStopResult } from "../../shared/types/app.js";
import { execCommand, execPowerShell } from "./command.js";

function parseTaskList(csv: string): ProcessMatch[] {
  return csv
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^"|"$/g, "").split("\",\""))
    .filter((parts) => parts.length >= 5)
    .map((parts) => ({
      imageName: parts[0],
      pid: Number(parts[1]),
      sessionName: parts[2],
      sessionNumber: Number(parts[3]),
      memUsage: parts[4]
    }))
    .filter((item) => PROCESS_IMAGE_NAMES.includes(item.imageName));
}

async function listProcesses(): Promise<ProcessMatch[]> {
  const { stdout } = await execCommand("tasklist.exe", ["/FO", "CSV"]);
  return parseTaskList(stdout);
}

interface WmiTerminateResult {
  processId: number;
  parentProcessId: number;
  name: string;
  returnValue: number;
}

function escapePowerShellSingleQuotedValue(value: string): string {
  return value.replace(/'/g, "''");
}

function parseWmiTerminateResults(stdout: string): WmiTerminateResult[] {
  const text = stdout.trim();
  if (!text) {
    return [];
  }

  const parsed = JSON.parse(text) as WmiTerminateResult | WmiTerminateResult[];
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function terminateByImage(imageName: string): Promise<WmiTerminateResult[]> {
  const escapedImageName = escapePowerShellSingleQuotedValue(imageName);
  const script = [
    `$items = Get-CimInstance Win32_Process -Filter "Name='${escapedImageName}'"`,
    `if (-not $items) { '[]'; exit 0 }`,
    `$results = foreach ($item in $items) {`,
    `  $invoke = Invoke-CimMethod -InputObject $item -MethodName Terminate`,
    `  [pscustomobject]@{ processId = $item.ProcessId; parentProcessId = $item.ParentProcessId; name = $item.Name; returnValue = $invoke.ReturnValue }`,
    `}`,
    `$results | ConvertTo-Json -Compress`
  ].join("; ");
  const { stdout } = await execPowerShell(script);
  return parseWmiTerminateResults(stdout);
}

async function terminateByPid(pid: number): Promise<WmiTerminateResult[]> {
  const script = [
    `$item = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"`,
    `if (-not $item) { '[]'; exit 0 }`,
    `$invoke = Invoke-CimMethod -InputObject $item -MethodName Terminate`,
    `[pscustomobject]@{ processId = $item.ProcessId; parentProcessId = $item.ParentProcessId; name = $item.Name; returnValue = $invoke.ReturnValue } | ConvertTo-Json -Compress`
  ].join("; ");
  const { stdout } = await execPowerShell(script);
  return parseWmiTerminateResults(stdout);
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function stopForSwitch(): Promise<ProcessStopResult> {
  const startedAt = Date.now();
  const initial = await listProcesses();
  const failures: WmiTerminateResult[] = [];
  if (!initial.length) {
    return {
      matched: [],
      terminated: [],
      remaining: [],
      failureReason: null,
      elapsedMs: Date.now() - startedAt
    };
  }

  for (const imageName of PROCESS_IMAGE_NAMES) {
    try {
      const results = await terminateByImage(imageName);
      failures.push(...results.filter((item) => item.returnValue !== 0));
    } catch (error) {
      void error;
    }
  }

  await wait(1500);

  let remaining = await listProcesses();
  for (let round = 0; round < 6 && remaining.length; round += 1) {
    for (const processInfo of remaining) {
      try {
        const results = await terminateByPid(processInfo.pid);
        failures.push(...results.filter((item) => item.returnValue !== 0));
      } catch (error) {
        void error;
      }
    }
    await wait(1000);
    remaining = await listProcesses();
  }

  const terminated = initial.filter((item) => !remaining.some((candidate) => candidate.pid === item.pid));
  const respawned = remaining.some((item) => !initial.some((candidate) => candidate.pid === item.pid));
  const accessDenied = failures.some((item) => item.returnValue === 2 || item.returnValue === 3);
  const unknownError = failures.some((item) => item.returnValue !== 0 && item.returnValue !== 2 && item.returnValue !== 3);

  return {
    matched: initial,
    terminated,
    remaining,
    failureReason: remaining.length
      ? (accessDenied ? "AccessDenied" : (respawned ? "Respawned" : (unknownError ? "UnknownError" : "StillClosing")))
      : null,
    elapsedMs: Date.now() - startedAt
  };
}

export async function inspectProcesses(): Promise<ProcessMatch[]> {
  return listProcesses();
}
