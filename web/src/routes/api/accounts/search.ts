import type { APIEvent } from "@solidjs/start/server";
import { resolveActingUser } from "~/domain/auth/acting_user";
import { authService } from "~/domain/auth/auth_service";
import type { SearchAccountsResponse } from "./search.schema";

export async function GET(event: APIEvent): Promise<Response> {
  const actingUser = await resolveActingUser(event.request);
  if (!actingUser) {
    return Response.json({ accounts: [] } satisfies SearchAccountsResponse);
  }

  const query = new URL(event.request.url).searchParams.get("q")?.trim() ?? "";
  const result = await authService.searchAccounts(query);
  const users = result.match(
    (v) => v,
    () => [],
  );
  return Response.json({
    accounts: users.map((user) => ({
      accountName: user.accountName.value,
      displayName: user.displayName,
    })),
  } satisfies SearchAccountsResponse);
}
