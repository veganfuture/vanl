import type { AccountName } from "./account_name";
import type { SignalAci } from "./signal_aci";
import type { UserId } from "./user_id";

export type User = {
  id: UserId;
  signalAci: SignalAci;
  accountName: AccountName;
  email: string;
  displayName: string;
  affiliationsNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};
