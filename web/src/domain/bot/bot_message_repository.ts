import { ResultAsync } from "neverthrow";
import type postgres from "postgres";

export type DbError = { readonly message: string; readonly cause: unknown };

/**
 * Log of every message the website has asked the bot to send, keyed by
 * recipient rather than by feature - backs the general per-recipient send
 * cap in bot_send_limit.ts. Deliberately separate from AuthRepository's
 * login_challenges (that table is OTP-specific and rows get deleted on
 * success; this one is a plain append-only log of confirmed sends, for any
 * message type).
 */
export class BotMessageRepository {
  constructor(private readonly sql: postgres.Sql) {}

  /** How many messages (of any type) this Signal person has been sent since `since`. */
  countMessagesSentToSince(aci: string, since: Date): ResultAsync<number, DbError> {
    return ResultAsync.fromPromise(
      this.sql`
        select count(*)::int as count from bot_messages_sent
        where recipient_aci = ${aci} and created_at > ${since}
      `,
      (cause): DbError => ({ message: "Failed to count bot messages sent", cause }),
    ).map((rows) => rows[0].count as number);
  }

  /** Records a confirmed send - call only after the bot has actually accepted the message. */
  recordMessageSent(aci: string, messageType: string): ResultAsync<void, DbError> {
    return ResultAsync.fromPromise(
      this.sql`
        insert into bot_messages_sent (recipient_aci, message_type)
        values (${aci}, ${messageType})
      `,
      (cause): DbError => ({ message: "Failed to record bot message sent", cause }),
    ).map(() => undefined);
  }
}
