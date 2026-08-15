import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { okAsync } from "neverthrow";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "~/lib/config";
import { sql } from "~/lib/db";
import { AuthRepository } from "./auth_repository";

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const BOT_PYTHON = join(REPO_ROOT, "bot", ".venv", "bin", "python");
// The dev-only keypair committed in configs/{dev,test}.toml — see the comment
// there. Reused here so the service layer can be tested against a real
// signature without mutating the process-wide cached config mid-suite.
const DEV_PRIVATE_KEY_SEED = "Psjl9VLCqVz3Hhw6zS-wfsLt6phUctNibo_bkT9ycV8";

function signWithDevKey(aci: string): string {
  const script = `
from bot.signup_token import build_signup_token, load_private_key
private_key = load_private_key("${DEV_PRIVATE_KEY_SEED}")
print(build_signup_token(private_key, "${aci}"))
`;
  return execFileSync(BOT_PYTHON, ["-c", script], {
    cwd: join(REPO_ROOT, "bot"),
    env: { ...process.env, PYTHONPATH: join(REPO_ROOT, "bot", "src") },
  })
    .toString("utf-8")
    .trim();
}

vi.mock("./bot-client", () => ({
  sendOtpViaBot: vi.fn(() => okAsync(undefined)),
}));

const { sendOtpViaBot } = await import("./bot-client");
const { AuthService } = await import("./auth_service");
import { SESSION_COOKIE_NAME } from "./cookies";

const repository = new AuthRepository(sql);
const service = new AuthService(repository, loadConfig().auth);

beforeEach(async () => {
  await sql`truncate table signup_nonces, login_challenges, sessions, global_roles, users cascade`;
  vi.mocked(sendOtpViaBot).mockClear();
});

afterAll(async () => {
  await sql.end();
});

function extractCookieValue(setCookieHeader: string, name: string): string {
  const match = new RegExp(`${name}=([^;]+)`).exec(setCookieHeader);
  if (!match) throw new Error(`Cookie ${name} not found in ${setCookieHeader}`);
  return decodeURIComponent(match[1]);
}

describe("inspectSignupToken", () => {
  it("returns the aci for a fresh, valid token", async () => {
    const aci = "22222222-2222-2222-2222-222222222222";
    const token = signWithDevKey(aci);

    const result = await service.inspectSignupToken(token);

    expect(result._unsafeUnwrap().value).toBe(aci);
  });

  it("rejects a malformed token", async () => {
    const result = await service.inspectSignupToken("garbage");
    expect(result._unsafeUnwrapErr()).toBe("invalid");
  });
});

describe("completeSignup", () => {
  it("creates a user, starts a session, and sets a cookie", async () => {
    const aci = "33333333-3333-3333-3333-333333333333";
    const token = signWithDevKey(aci);

    const result = await service.completeSignup({
      token,
      accountName: "erin",
      email: "erin@example.com",
      displayName: "Erin",
      affiliationsNote: null,
    });

    const { user, setCookieHeaders } = result._unsafeUnwrap();
    expect(user.accountName.value).toBe("erin");
    const cookieToken = extractCookieValue(setCookieHeaders[0], SESSION_COOKIE_NAME);
    const sessionUser = await service.getSessionUser(`${SESSION_COOKIE_NAME}=${cookieToken}`);
    expect(sessionUser._unsafeUnwrap()?.accountName.value).toBe("erin");
  });

  it("grants site_admin to the first user who signs up", async () => {
    const first = await service.completeSignup({
      token: signWithDevKey("44444444-4444-4444-4444-444444444444"),
      accountName: "dev-admin",
      email: "admin@example.com",
      displayName: "Dev Admin",
      affiliationsNote: null,
    });
    const { user: firstUser } = first._unsafeUnwrap();
    expect((await repository.isSiteAdmin(firstUser.id))._unsafeUnwrap()).toBe(true);

    const second = await service.completeSignup({
      token: signWithDevKey("44444444-4444-4444-4444-444444444401"),
      accountName: "not-admin",
      email: "not-admin@example.com",
      displayName: "Not Admin",
      affiliationsNote: null,
    });
    const { user: secondUser } = second._unsafeUnwrap();
    expect((await repository.isSiteAdmin(secondUser.id))._unsafeUnwrap()).toBe(false);
  });

  it("rejects reusing the same signup link twice", async () => {
    const token = signWithDevKey("55555555-5555-5555-5555-555555555555");
    (
      await service.completeSignup({
        token,
        accountName: "frank",
        email: "frank@example.com",
        displayName: "Frank",
        affiliationsNote: null,
      })
    )._unsafeUnwrap();

    const second = await service.completeSignup({
      token,
      accountName: "frank-two",
      email: "frank2@example.com",
      displayName: "Frank Two",
      affiliationsNote: null,
    });

    expect(second._unsafeUnwrapErr()).toBe("already_used");
  });

  it("rejects a taken account name", async () => {
    (
      await service.completeSignup({
        token: signWithDevKey("66666666-6666-6666-6666-666666666666"),
        accountName: "grace",
        email: "grace@example.com",
        displayName: "Grace",
        affiliationsNote: null,
      })
    )._unsafeUnwrap();

    const result = await service.completeSignup({
      token: signWithDevKey("77777777-7777-7777-7777-777777777777"),
      accountName: "grace",
      email: "grace2@example.com",
      displayName: "Grace Two",
      affiliationsNote: null,
    });

    expect(result._unsafeUnwrapErr()).toBe("account_name_taken");
  });

  it("rejects a reserved account name", async () => {
    const result = await service.completeSignup({
      token: signWithDevKey("77777777-7777-7777-7777-777777777701"),
      accountName: "arc-import",
      email: "someone@example.com",
      displayName: "Someone",
      affiliationsNote: null,
    });

    expect(result._unsafeUnwrapErr()).toBe("account_name_taken");
  });
});

describe("login", () => {
  it("sends an OTP, then verifies it and starts a session", async () => {
    const token = signWithDevKey("88888888-8888-8888-8888-888888888888");
    (
      await service.completeSignup({
        token,
        accountName: "heidi",
        email: "heidi@example.com",
        displayName: "Heidi",
        affiliationsNote: null,
      })
    )._unsafeUnwrap();

    (await service.startLogin("heidi"))._unsafeUnwrap();
    const sentCode = vi.mocked(sendOtpViaBot).mock.calls[0][1];

    const result = await service.verifyLogin("heidi", sentCode);

    expect(result._unsafeUnwrap().user.accountName.value).toBe("heidi");
  });

  it("rejects an unknown account", async () => {
    const result = await service.startLogin("nobody");
    expect(result._unsafeUnwrapErr()).toBe("account_not_found");
  });

  it("exhausts attempts after three wrong codes", async () => {
    const token = signWithDevKey("99999999-9999-9999-9999-999999999999");
    (
      await service.completeSignup({
        token,
        accountName: "ivan",
        email: "ivan@example.com",
        displayName: "Ivan",
        affiliationsNote: null,
      })
    )._unsafeUnwrap();
    (await service.startLogin("ivan"))._unsafeUnwrap();

    expect((await service.verifyLogin("ivan", "0000"))._unsafeUnwrapErr()).toBe("wrong_code");
    expect((await service.verifyLogin("ivan", "0000"))._unsafeUnwrapErr()).toBe("wrong_code");
    expect((await service.verifyLogin("ivan", "0000"))._unsafeUnwrapErr()).toBe(
      "attempts_exhausted",
    );
  });
});

describe("session lifecycle", () => {
  it("logout revokes the session so it can no longer be used", async () => {
    const token = signWithDevKey("10101010-1010-1010-1010-101010101010");
    const signupResult = await service.completeSignup({
      token,
      accountName: "judy",
      email: "judy@example.com",
      displayName: "Judy",
      affiliationsNote: null,
    });
    const { setCookieHeaders } = signupResult._unsafeUnwrap();
    const cookieHeader = `${SESSION_COOKIE_NAME}=${extractCookieValue(setCookieHeaders[0], SESSION_COOKIE_NAME)}`;

    expect((await service.getSessionUser(cookieHeader))._unsafeUnwrap()).not.toBeNull();
    (await service.logout(cookieHeader))._unsafeUnwrap();
    expect((await service.getSessionUser(cookieHeader))._unsafeUnwrap()).toBeNull();
  });

  it("getSessionUser returns null with no cookie", async () => {
    expect((await service.getSessionUser(null))._unsafeUnwrap()).toBeNull();
  });
});
