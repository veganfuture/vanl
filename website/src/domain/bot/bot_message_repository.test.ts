import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "~/lib/db";
import { BotMessageRepository } from "./bot_message_repository";

const repository = new BotMessageRepository(sql);

beforeEach(async () => {
  await sql`truncate table bot_messages_sent`;
});

afterAll(async () => {
  await sql.end();
});

describe("bot message log", () => {
  it("counts messages recorded for a recipient since a given time", async () => {
    const aci = crypto.randomUUID();
    const before = new Date();
    (await repository.recordMessageSent(aci, "otp"))._unsafeUnwrap();
    (await repository.recordMessageSent(aci, "otp"))._unsafeUnwrap();

    expect((await repository.countMessagesSentToSince(aci, before))._unsafeUnwrap()).toBe(2);
    expect((await repository.countMessagesSentToSince(aci, new Date()))._unsafeUnwrap()).toBe(0);
  });

  it("counts messages per recipient independently, regardless of message type", async () => {
    const aciA = crypto.randomUUID();
    const aciB = crypto.randomUUID();
    const before = new Date();
    (await repository.recordMessageSent(aciA, "otp"))._unsafeUnwrap();
    (await repository.recordMessageSent(aciA, "signup_confirmation"))._unsafeUnwrap();
    (await repository.recordMessageSent(aciB, "otp"))._unsafeUnwrap();

    expect((await repository.countMessagesSentToSince(aciA, before))._unsafeUnwrap()).toBe(2);
    expect((await repository.countMessagesSentToSince(aciB, before))._unsafeUnwrap()).toBe(1);
  });
});
