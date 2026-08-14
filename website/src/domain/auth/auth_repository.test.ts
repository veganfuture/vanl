import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "~/lib/db";
import { AccountName } from "./account_name";
import { AuthRepository } from "./auth_repository";
import { SignalAci } from "./signal_aci";
import type { User } from "./user";

const repository = new AuthRepository(sql);

function aci(value: string): SignalAci {
  return SignalAci.from_string(value)._unsafeUnwrap();
}

function accountName(value: string): AccountName {
  return AccountName.from_string(value)._unsafeUnwrap();
}

async function makeUser(
  overrides: Partial<{ aci: string; accountName: string }> = {},
): Promise<User> {
  const result = (
    await repository.createUserFromSignup(
      {
        signalAci: aci(overrides.aci ?? crypto.randomUUID()),
        accountName: accountName(
          overrides.accountName ?? `user${Math.random().toString(36).slice(2, 8)}`,
        ),
        email: "person@example.com",
        displayName: "Test Person",
        affiliationsNote: null,
      },
      crypto.randomUUID(),
    )
  )._unsafeUnwrap();
  if (result === "nonce_already_used") {
    throw new Error("unexpected nonce collision in test");
  }
  return result;
}

beforeEach(async () => {
  await sql`truncate table signup_nonces, login_challenges, sessions, global_roles, users cascade`;
});

afterAll(async () => {
  await sql.end();
});

describe("createUserFromSignup", () => {
  it("creates a user and consumes the nonce", async () => {
    const signalAci = aci(crypto.randomUUID());
    const nonce = crypto.randomUUID();

    const result = (
      await repository.createUserFromSignup(
        {
          signalAci,
          accountName: accountName("alice"),
          email: "alice@example.com",
          displayName: "Alice",
          affiliationsNote: "runs the events group",
        },
        nonce,
      )
    )._unsafeUnwrap();

    if (result === "nonce_already_used") {
      throw new Error("expected a fresh user, got nonce_already_used");
    }
    expect(result.accountName.value).toBe("alice");
    expect(result.signalAci.value).toBe(signalAci.value);
    expect((await repository.isSignupNonceUsed(nonce))._unsafeUnwrap()).toBe(true);
  });

  it("refuses to create a second account from the same nonce", async () => {
    const nonce = crypto.randomUUID();
    const first = (
      await repository.createUserFromSignup(
        {
          signalAci: aci(crypto.randomUUID()),
          accountName: accountName("bob"),
          email: "bob@example.com",
          displayName: "Bob",
          affiliationsNote: null,
        },
        nonce,
      )
    )._unsafeUnwrap();
    expect(first).not.toBe("nonce_already_used");

    const second = (
      await repository.createUserFromSignup(
        {
          signalAci: aci(crypto.randomUUID()),
          accountName: accountName("bob-again"),
          email: "bob2@example.com",
          displayName: "Bob Again",
          affiliationsNote: null,
        },
        nonce,
      )
    )._unsafeUnwrap();

    expect(second).toBe("nonce_already_used");
  });

  it("enforces one account per Signal ACI at the database layer", async () => {
    const signalAci = aci(crypto.randomUUID());
    (
      await repository.createUserFromSignup(
        {
          signalAci,
          accountName: accountName("carol"),
          email: "carol@example.com",
          displayName: "Carol",
          affiliationsNote: null,
        },
        crypto.randomUUID(),
      )
    )._unsafeUnwrap();

    const result = await repository.createUserFromSignup(
      {
        signalAci,
        accountName: accountName("carol-two"),
        email: "carol2@example.com",
        displayName: "Carol Two",
        affiliationsNote: null,
      },
      crypto.randomUUID(),
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().cause).toMatchObject({ code: "23505" });
  });
});

describe("user lookups", () => {
  it("finds a user by account name, id, and Signal ACI", async () => {
    const user = await makeUser({ accountName: "dana" });

    expect((await repository.findUserByAccountName("dana"))._unsafeUnwrap()?.id.value).toBe(
      user.id.value,
    );
    expect((await repository.findUserById(user.id))._unsafeUnwrap()?.accountName.value).toBe(
      "dana",
    );
    expect((await repository.findUserBySignalAci(user.signalAci))._unsafeUnwrap()?.id.value).toBe(
      user.id.value,
    );
  });

  it("returns null for an account name that does not exist", async () => {
    expect(
      (await repository.findUserByAccountName("nobody-with-this-name"))._unsafeUnwrap(),
    ).toBeNull();
  });
});

describe("global roles", () => {
  it("is idempotent and reflects in isSiteAdmin", async () => {
    const user = await makeUser();
    expect((await repository.isSiteAdmin(user.id))._unsafeUnwrap()).toBe(false);

    (await repository.ensureGlobalRole(user.id, "site_admin"))._unsafeUnwrap();
    (await repository.ensureGlobalRole(user.id, "site_admin"))._unsafeUnwrap(); // must not error on repeat

    expect((await repository.isSiteAdmin(user.id))._unsafeUnwrap()).toBe(true);
  });
});

describe("sessions", () => {
  it("is only active before expiry and while unrevoked", async () => {
    const user = await makeUser();
    const tokenHash = "hash-1";
    (
      await repository.insertSession({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
      })
    )._unsafeUnwrap();

    expect(
      (await repository.findActiveSessionByTokenHash(tokenHash))._unsafeUnwrap()?.userId.value,
    ).toBe(user.id.value);

    (await repository.revokeSessionByTokenHash(tokenHash))._unsafeUnwrap();

    expect((await repository.findActiveSessionByTokenHash(tokenHash))._unsafeUnwrap()).toBeNull();
  });

  it("treats an expired session as inactive", async () => {
    const user = await makeUser();
    const tokenHash = "hash-expired";
    (
      await repository.insertSession({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() - 1_000),
      })
    )._unsafeUnwrap();

    expect((await repository.findActiveSessionByTokenHash(tokenHash))._unsafeUnwrap()).toBeNull();
  });
});

describe("login challenges", () => {
  it("decrements attempts and expires after the configured attempt count", async () => {
    const user = await makeUser();
    const id = (
      await repository.insertLoginChallenge({
        userId: user.id,
        codeHash: "code-hash",
        expiresAt: new Date(Date.now() + 60_000),
      })
    )._unsafeUnwrap();

    expect(
      (await repository.findLatestActiveLoginChallenge(user.id))._unsafeUnwrap()?.attemptsRemaining,
    ).toBe(3);

    expect((await repository.decrementLoginChallengeAttempts(id))._unsafeUnwrap()).toBe(2);
    expect((await repository.decrementLoginChallengeAttempts(id))._unsafeUnwrap()).toBe(1);
    expect((await repository.decrementLoginChallengeAttempts(id))._unsafeUnwrap()).toBe(0);

    // 0 attempts remaining -> no longer "active"
    expect((await repository.findLatestActiveLoginChallenge(user.id))._unsafeUnwrap()).toBeNull();
  });

  it("returns the most recently created challenge when several exist", async () => {
    const user = await makeUser();
    (
      await repository.insertLoginChallenge({
        userId: user.id,
        codeHash: "old",
        expiresAt: new Date(Date.now() + 60_000),
      })
    )._unsafeUnwrap();
    await new Promise((resolve) => setTimeout(resolve, 10));
    (
      await repository.insertLoginChallenge({
        userId: user.id,
        codeHash: "new",
        expiresAt: new Date(Date.now() + 60_000),
      })
    )._unsafeUnwrap();

    expect(
      (await repository.findLatestActiveLoginChallenge(user.id))._unsafeUnwrap()?.codeHash,
    ).toBe("new");
  });
});
