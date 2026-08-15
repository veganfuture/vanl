import postgres from "postgres";
import { loadConfig } from "../src/lib/config";
import { SignalAci } from "../src/domain/auth/signal_aci";

/**
 * Dev-only convenience: upserts a "dev" user with the Signal ACI from
 * DEV_ACI (kept out of git via .envrc - see README) and grants it
 * site_admin. Errors if DEV_ACI isn't set - `bun run migrate` only invokes
 * this script when DEV_ACI is present (see package.json), so CI/prod never
 * reach here at all.
 */
async function main(): Promise<void> {
  const devAci = process.env.DEV_ACI;
  if (!devAci) {
    throw new Error('DEV_ACI is not set - see README.md, section "Environment Variables".');
  }

  const aciResult = SignalAci.from_string(devAci);
  if (aciResult.isErr()) {
    throw new Error(`DEV_ACI is not a valid Signal ACI: ${aciResult.error.message}`);
  }
  const aci = aciResult.value;

  const config = loadConfig();
  const sql = postgres({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    username: config.database.user,
    password: process.env.VANL_DATABASE_PASSWORD ?? "",
  });

  try {
    const [user] = await sql`
      insert into users (signal_aci, account_name, email, display_name)
      values (${aci.value}, 'dev', 'dev@localhost', 'Dev')
      on conflict (signal_aci) do update set account_name = excluded.account_name
      returning id
    `;

    await sql`
      insert into global_roles (user_id, role) values (${user.id}, 'site_admin')
      on conflict (user_id, role) do nothing
    `;

    console.log(`Seeded dev user "dev" (${aci.value}) as site_admin.`);
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
