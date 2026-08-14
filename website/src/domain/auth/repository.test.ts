import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "~/lib/db";
import {
  createUserFromSignup,
  decrementLoginChallengeAttempts,
  ensureGlobalRole,
  findActiveSessionByTokenHash,
  findLatestActiveLoginChallenge,
  findUserByAccountName,
  findUserById,
  findUserBySignalAci,
  insertLoginChallenge,
  insertSession,
  isSignupNonceUsed,
  isSiteAdmin,
  revokeSessionByTokenHash,
} from "./repository";
import { parseAccountName, parseSignalAci, type User } from "./types";

async function makeUser(
  overrides: Partial<{ aci: string; accountName: string }> = {},
): Promise<User> {
  const aci = parseSignalAci(overrides.aci ?? crypto.randomUUID());
  const accountName = parseAccountName(
    overrides.accountName ?? `user${Math.random().toString(36).slice(2, 8)}`,
  );
  const result = await createUserFromSignup(
    {
      signalAci: aci,
      accountName,
      email: "person@example.com",
      displayName: "Test Person",
      affiliationsNote: null,
    },
    crypto.randomUUID(),
  );
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
    const aci = parseSignalAci(crypto.randomUUID());
    const nonce = crypto.randomUUID();

    const result = await createUserFromSignup(
      {
        signalAci: aci,
        accountName: parseAccountName("alice"),
        email: "alice@example.com",
        displayName: "Alice",
        affiliationsNote: "runs the events group",
      },
      nonce,
    );

    if (result === "nonce_already_used") {
      throw new Error("expected a fresh user, got nonce_already_used");
    }
    expect(result.accountName).toBe("alice");
    expect(result.signalAci).toBe(aci);
    expect(await isSignupNonceUsed(nonce)).toBe(true);
  });

  it("refuses to create a second account from the same nonce", async () => {
    const nonce = crypto.randomUUID();
    const first = await createUserFromSignup(
      {
        signalAci: parseSignalAci(crypto.randomUUID()),
        accountName: parseAccountName("bob"),
        email: "bob@example.com",
        displayName: "Bob",
        affiliationsNote: null,
      },
      nonce,
    );
    expect(first).not.toBe("nonce_already_used");

    const second = await createUserFromSignup(
      {
        signalAci: parseSignalAci(crypto.randomUUID()),
        accountName: parseAccountName("bob-again"),
        email: "bob2@example.com",
        displayName: "Bob Again",
        affiliationsNote: null,
      },
      nonce,
    );

    expect(second).toBe("nonce_already_used");
  });

  it("enforces one account per Signal ACI at the database layer", async () => {
    const aci = parseSignalAci(crypto.randomUUID());
    await createUserFromSignup(
      {
        signalAci: aci,
        accountName: parseAccountName("carol"),
        email: "carol@example.com",
        displayName: "Carol",
        affiliationsNote: null,
      },
      crypto.randomUUID(),
    );

    await expect(
      createUserFromSignup(
        {
          signalAci: aci,
          accountName: parseAccountName("carol-two"),
          email: "carol2@example.com",
          displayName: "Carol Two",
          affiliationsNote: null,
        },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });
});

describe("user lookups", () => {
  it("finds a user by account name, id, and Signal ACI", async () => {
    const user = await makeUser({ accountName: "dana" });

    expect((await findUserByAccountName("dana"))?.id).toBe(user.id);
    expect((await findUserById(user.id))?.accountName).toBe("dana");
    expect((await findUserBySignalAci(user.signalAci))?.id).toBe(user.id);
  });

  it("returns null for an account name that does not exist", async () => {
    expect(await findUserByAccountName("nobody-with-this-name")).toBeNull();
  });
});

describe("global roles", () => {
  it("is idempotent and reflects in isSiteAdmin", async () => {
    const user = await makeUser();
    expect(await isSiteAdmin(user.id)).toBe(false);

    await ensureGlobalRole(user.id, "site_admin");
    await ensureGlobalRole(user.id, "site_admin"); // must not throw on repeat

    expect(await isSiteAdmin(user.id)).toBe(true);
  });
});

describe("sessions", () => {
  it("is only active before expiry and while unrevoked", async () => {
    const user = await makeUser();
    const tokenHash = "hash-1";
    await insertSession({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect((await findActiveSessionByTokenHash(tokenHash))?.userId).toBe(user.id);

    await revokeSessionByTokenHash(tokenHash);

    expect(await findActiveSessionByTokenHash(tokenHash)).toBeNull();
  });

  it("treats an expired session as inactive", async () => {
    const user = await makeUser();
    const tokenHash = "hash-expired";
    await insertSession({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() - 1_000),
    });

    expect(await findActiveSessionByTokenHash(tokenHash)).toBeNull();
  });
});

describe("login challenges", () => {
  it("decrements attempts and expires after the configured attempt count", async () => {
    const user = await makeUser();
    const id = await insertLoginChallenge({
      userId: user.id,
      codeHash: "code-hash",
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect((await findLatestActiveLoginChallenge(user.id))?.attemptsRemaining).toBe(3);

    expect(await decrementLoginChallengeAttempts(id)).toBe(2);
    expect(await decrementLoginChallengeAttempts(id)).toBe(1);
    expect(await decrementLoginChallengeAttempts(id)).toBe(0);

    // 0 attempts remaining -> no longer "active"
    expect(await findLatestActiveLoginChallenge(user.id)).toBeNull();
  });

  it("returns the most recently created challenge when several exist", async () => {
    const user = await makeUser();
    await insertLoginChallenge({
      userId: user.id,
      codeHash: "old",
      expiresAt: new Date(Date.now() + 60_000),
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await insertLoginChallenge({
      userId: user.id,
      codeHash: "new",
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect((await findLatestActiveLoginChallenge(user.id))?.codeHash).toBe("new");
  });
});
