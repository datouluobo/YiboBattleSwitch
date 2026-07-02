export type IpcActionPayload =
  | { battleTag: string; email: string; phone: string; description: string }
  | { accountId: string }
  | { id: string }
  | { path: string }
  | { label: string }
  | Record<string, unknown>;
