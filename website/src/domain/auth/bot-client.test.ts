import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "~/lib/db";
import { BOT_MESSAGE_RATE_LIMIT_MAX } from "~/domain/bot/bot_send_limit";
import { sendOtpViaBot } from "./bot-client";

const fetchMock = vi.fn();

beforeEach(async () => {
  await sql`truncate table bot_messages_sent`;
  // Ambient in dev via .envrc, but not guaranteed under every test runner
  // invocation (e.g. plain `nix develop --command`) - set explicitly so
  // this test never depends on how it was launched.
  process.env.VANL_BOT_API_SHARED_SECRET = "test-secret";
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await sql.end();
});

describe("sendOtpViaBot - general per-recipient send limit", () => {
  it(`allows ${BOT_MESSAGE_RATE_LIMIT_MAX} sends to the same recipient, then rejects the next one without calling the bot`, async () => {
    const aci = crypto.randomUUID();

    for (let i = 0; i < BOT_MESSAGE_RATE_LIMIT_MAX; i++) {
      (await sendOtpViaBot(aci, "123456"))._unsafeUnwrap();
    }
    expect(fetchMock).toHaveBeenCalledTimes(BOT_MESSAGE_RATE_LIMIT_MAX);

    const result = await sendOtpViaBot(aci, "123456");

    expect(result._unsafeUnwrapErr()).toEqual({ kind: "rate_limited" });
    expect(fetchMock).toHaveBeenCalledTimes(BOT_MESSAGE_RATE_LIMIT_MAX);
  });

  it("does not record a send that the bot rejected, so it never counts against the limit", async () => {
    const aci = crypto.randomUUID();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 502 }));

    const failed = await sendOtpViaBot(aci, "123456");
    expect(failed._unsafeUnwrapErr()).toMatchObject({ kind: "send_failed" });

    for (let i = 0; i < BOT_MESSAGE_RATE_LIMIT_MAX; i++) {
      (await sendOtpViaBot(aci, "123456"))._unsafeUnwrap();
    }
    // The failed attempt above didn't consume a slot - exactly MAX successful
    // sends fit afterward, confirmed by the (MAX+1)th failing to send at all.
    const result = await sendOtpViaBot(aci, "123456");
    expect(result._unsafeUnwrapErr()).toEqual({ kind: "rate_limited" });
  });

  it("limits recipients independently", async () => {
    const aciA = crypto.randomUUID();
    const aciB = crypto.randomUUID();

    for (let i = 0; i < BOT_MESSAGE_RATE_LIMIT_MAX; i++) {
      (await sendOtpViaBot(aciA, "123456"))._unsafeUnwrap();
    }

    const stillOk = await sendOtpViaBot(aciB, "123456");

    expect(stillOk.isOk()).toBe(true);
  });
});
