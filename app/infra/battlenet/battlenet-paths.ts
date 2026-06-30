import path from "node:path";
import { fileExists } from "../system/fs.js";
import { getSettings } from "../storage/app-config.js";
import { execPowerShell } from "./command.js";

const COMMON_LAUNCHER_PATHS = [
  "C:\\Program Files (x86)\\Battle.net\\Battle.net Launcher.exe",
  "C:\\Program Files (x86)\\Battle.net\\Battle.net.exe",
  "C:\\Program Files\\Battle.net\\Battle.net Launcher.exe",
  "C:\\Program Files\\Battle.net\\Battle.net.exe"
];

const WOW_VARIANT_ROOTS = [
  "C:\\Program Files (x86)\\World of Warcraft\\_retail_",
  "C:\\Program Files (x86)\\World of Warcraft\\_classic_",
  "C:\\Program Files (x86)\\World of Warcraft\\_classic_era_",
  "C:\\Program Files (x86)\\World of Warcraft\\_classic_titan_"
];

const WOW_EXECUTABLE_CANDIDATES = [
  ["_retail_", "Wow.exe"],
  ["_classic_", "WowClassic.exe"],
  ["_classic_era_", "WowClassic.exe"],
  ["_classic_titan_", "WowClassic.exe"]
] as const;

export function normalizeInstallDirectory(input: string): string {
  const raw = input.trim();
  if (!raw) {
    return "";
  }

  const parsed = path.normalize(raw);
  const lower = parsed.toLowerCase();

  if (lower.endsWith("battle.net launcher.exe") || lower.endsWith("battle.net.exe")) {
    return path.dirname(parsed);
  }

  const variantNames = new Set(WOW_VARIANT_ROOTS.map((item) => path.basename(item).toLowerCase()));
  if (variantNames.has(path.basename(parsed).toLowerCase()) && path.basename(path.dirname(parsed)).toLowerCase() === "world of warcraft") {
    return path.dirname(parsed);
  }

  return parsed;
}

export async function detectBattleNetLauncherPath(): Promise<string> {
  const settings = await getSettings();
  if (settings.battleNetLauncherPath && await fileExists(settings.battleNetLauncherPath)) {
    return settings.battleNetLauncherPath;
  }

  for (const candidate of COMMON_LAUNCHER_PATHS) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  try {
    const { stdout } = await execPowerShell("(Get-ItemProperty 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Battle.net' -ErrorAction Stop).InstallLocation");
    const installLocation = stdout.trim();
    if (!installLocation) {
      return "";
    }
    const fullPath = path.join(installLocation, "Battle.net Launcher.exe");
    if (await fileExists(fullPath)) {
      return fullPath;
    }
  } catch {
    return "";
  }

  return "";
}

export async function detectDefaultGameDirectory(): Promise<string> {
  for (const candidate of WOW_VARIANT_ROOTS) {
    if (await fileExists(candidate)) {
      return normalizeInstallDirectory(candidate);
    }
  }

  for (const uninstallKey of [
    "HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\World of Warcraft",
    "HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Cataclysm Classic",
    "HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\World of Warcraft Classic Era",
    "HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\World of Warcraft Classic Titan"
  ]) {
    try {
      const { stdout } = await execPowerShell(`(Get-ItemProperty '${uninstallKey}' -ErrorAction Stop).InstallLocation`);
      const installLocation = stdout.trim();
      if (installLocation && await fileExists(installLocation)) {
        return normalizeInstallDirectory(installLocation);
      }
    } catch {
      // Ignore missing uninstall keys.
    }
  }

  const launcherPath = await detectBattleNetLauncherPath();
  if (launcherPath) {
    return path.dirname(launcherPath);
  }

  return "";
}

export async function resolveWowExecutablePath(gameDirectory: string): Promise<string> {
  const normalized = normalizeInstallDirectory(gameDirectory);
  if (!normalized) {
    return "";
  }

  for (const [variantDir, exeName] of WOW_EXECUTABLE_CANDIDATES) {
    const candidate = path.join(normalized, variantDir, exeName);
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  const directCandidates = [
    path.join(normalized, "Wow.exe"),
    path.join(normalized, "WowClassic.exe")
  ];

  for (const candidate of directCandidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return "";
}
