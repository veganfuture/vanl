import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBotStatus } from "./bot_status_client";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getBotStatus", () => {
  it("reports signalConnected from a valid response", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: "ok", signalConnected: true }), { status: 200 }),
    );

    const result = await getBotStatus();

    expect(result._unsafeUnwrap()).toEqual({ signalConnected: true });
  });

  it("reports signalConnected: false when the bot says it's disconnected", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: "ok", signalConnected: false }), { status: 200 }),
    );

    const result = await getBotStatus();

    expect(result._unsafeUnwrap()).toEqual({ signalConnected: false });
  });

  it("errors when the bot is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("connection refused"));

    const result = await getBotStatus();

    expect(result.isErr()).toBe(true);
  });

  it("errors on a non-2xx response", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 502 }));

    const result = await getBotStatus();

    expect(result.isErr()).toBe(true);
  });

  it("errors on a response that doesn't match the expected shape", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
    );

    const result = await getBotStatus();

    expect(result.isErr()).toBe(true);
  });
});
