export interface AccountListItem {
  id: string;
  email: string;
  maskedEmail: string;
  description: string;
  lastSaved: string;
  importedFrom?: string;
  sortOrder?: number;
}

export interface AccountRecord {
  id: string;
  email: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  importedFrom?: string;
  snapshotVersion: number;
  sortOrder?: number;
}

export interface AccountCompatibilityRecord {
  savedAccountName: string;
  wowGameAccounts: string[];
  wowSelectedAccount: string;
  wowCaptureSource: string;
  wowSourceVariant: string;
  wowLocalAccountName: string;
  wowLocalAccountCandidates: string[];
  wowAccountsByVariant: Record<string, string[]>;
}

export type BattleNetSwitchProfile = "N" | "D" | "W";

export interface AppSettings {
  gameDirectory: string;
  battleNetLauncherPath: string;
  wowDirectory: string;
  battleNetSwitchProfile: BattleNetSwitchProfile;
  minimizeToTrayOnClose: boolean;
  launchAtLogin: boolean;
  minimizeOnLaunch: boolean;
  skipSwitchConfirm: boolean;
  revealedAccountIds?: string[];
  lastSelectedAccountId: string;
  windowBounds?: {
    width: number;
    height: number;
  };
}

export interface AppStateDto {
  appName: string;
  version: string;
  gameDirectory: string;
  libraryDirectory: string;
  dataDirectory: string;
  currentLoginName: string;
  currentSavedAccountName: string;
  currentSavedAccountCandidates: string[];
  currentGameAccount: string;
  wowAccounts: string[];
  accountCount: number;
  importableCount: number;
  permissionLabel: string;
  accounts: AccountListItem[];
  logs: string[];
}

export interface ReorderAccountsResult extends OperationResult {
  orderedIds: string[];
}

export interface BattleNetSnapshot {
  capturedAt: string;
  configPath: string;
  configRaw: string;
  configJson: unknown | null;
  fileBlobs: Record<string, string>;
  gameAccount: string;
  savedAccountNames: string[];
  registry: BattleNetRegistrySnapshot;
  registryExports: RegistryExport[];
  localFiles: Record<string, string>;
}

export interface RegistryExport {
  key: string;
  path: string;
  exists: boolean;
}

export interface RegistryValuePayload {
  type: string;
  value: string;
}

export interface BattleNetRegistrySnapshot {
  wow: Record<string, RegistryValuePayload>;
  wtcg: Record<string, RegistryValuePayload>;
  encryption: Record<string, RegistryValuePayload>;
  unifiedAuth: Record<string, RegistryValuePayload>;
}

export interface ProcessMatch {
  pid: number;
  imageName: string;
  sessionName: string;
  sessionNumber: number;
  memUsage: string;
}

export interface ProcessStopResult {
  matched: ProcessMatch[];
  terminated: ProcessMatch[];
  remaining: ProcessMatch[];
  failureReason: "AccessDenied" | "Respawned" | "StillClosing" | "UnknownOwner" | "UnknownError" | null;
  elapsedMs: number;
}

export interface OperationResult {
  ok: boolean;
  message: string;
}

export interface SwitchAccountResult extends OperationResult {
  rollbackTriggered?: boolean;
  failureReason?: ProcessStopResult["failureReason"];
}

export interface DiagnosticSnapshot {
  id: string;
  label: string;
  createdAt: string;
  snapshot: BattleNetSnapshot;
}
