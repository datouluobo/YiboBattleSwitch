import { AccountListItem, AccountRecord } from "./types/app.js";

type AccountLike = Pick<AccountListItem, "id" | "battleTag" | "email" | "phone"> | Pick<AccountRecord, "id" | "battleTag" | "email" | "phone">;

export function getAccountDisplayName(account: AccountLike): string {
  return account.battleTag || account.email || account.phone || account.id;
}
