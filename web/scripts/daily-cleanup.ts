import postgres from "postgres";
import { loadConfig } from "../src/lib/config";
import { AuthRepository } from "../src/domain/auth/auth_repository";
import { OTP_SEND_RATE_LIMIT_WINDOW_SECONDS } from "../src/domain/auth/otp";

/**
 * Runs every registered daily cleanup task in turn. Add a new entry to
 * CLEANUP_TASKS below whenever some other table accumulates rows nothing
 * else ever prunes - each task runs independently and reports its own
 * count/failure, so one broken task never blocks the rest. Scheduled daily
 * via systemd timer (see web/flake.nix's vanl-web-daily-cleanup), not part
 * of `bun run migrate`.
 */

interface CleanupContext {
  authRepository: AuthRepository;
}

interface CleanupTask {
  name: string;
  run: (ctx: CleanupContext) => Promise<number>;
}

// A wide margin past OTP_SEND_RATE_LIMIT_WINDOW_SECONDS (12h) -
// countLoginChallengesForUserSince/countLoginChallengesForIpSince (the
// per-account/per-IP OTP send rate limit) need every row inside that window
// to still exist, or the rate limit they enforce silently weakens.
const LOGIN_CHALLENGES_RETENTION_SECONDS = OTP_SEND_RATE_LIMIT_WINDOW_SECONDS * 2;

const CLEANUP_TASKS: CleanupTask[] = [
  {
    // Nothing else prunes login_challenges - a successful login only ever
    // deletes its own row (see auth_repository.ts's deleteLoginChallenge),
    // so left alone it grows forever.
    name: "login_challenges",
    run: async ({ authRepository }) => {
      const cutoff = new Date(Date.now() - LOGIN_CHALLENGES_RETENTION_SECONDS * 1000);
      const result = await authRepository.pruneLoginChallengesCreatedBefore(cutoff);
      if (result.isErr()) {
        throw new Error(result.error.message, { cause: result.error.cause });
      }
      return result.value;
    },
  },
];

async function main(): Promise<void> {
  const config = loadConfig();
  const sql = postgres({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    username: config.database.user,
    password: process.env.VANL_DATABASE_PASSWORD ?? "",
  });

  try {
    const ctx: CleanupContext = { authRepository: new AuthRepository(sql) };
    let anyFailed = false;
    for (const task of CLEANUP_TASKS) {
      try {
        const count = await task.run(ctx);
        console.log(`[${task.name}] pruned ${count} row(s).`);
      } catch (error) {
        anyFailed = true;
        console.error(`[${task.name}] failed:`, error);
      }
    }
    if (anyFailed) {
      process.exitCode = 1;
    }
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
