export type IpcActionPayload =
  | { accountName: string; description: string }
  | { accountId: string }
  | { id: string }
  | { path: string }
  | { label: string }
  | Record<string, unknown>;
