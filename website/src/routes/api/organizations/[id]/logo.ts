import type { APIEvent } from "@solidjs/start/server";
import { imageService } from "~/domain/images/image_service";
import { OrganizationId } from "~/domain/organizations/organization_id";
import { resolveActingUser } from "~/lib/acting-user";
import { toOrganizationJson } from "../organization.schema";
import type { UploadLogoResponse } from "./logo.schema";

const ERROR_STATUS: Record<string, number> = {
  unauthorized: 401,
  not_found: 404,
  forbidden: 403,
  validation: 400,
  internal_error: 500,
};

/** Matches image_processing.ts's own cap - checked here too so an oversized body never even reaches it. */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export async function POST(event: APIEvent): Promise<Response> {
  const actingUser = await resolveActingUser(event.request.headers.get("cookie"));
  if (!actingUser) {
    return Response.json({ error: "unauthorized" } satisfies UploadLogoResponse, {
      status: ERROR_STATUS.unauthorized,
    });
  }

  const orgIdResult = OrganizationId.from_string(event.params.id);
  if (orgIdResult.isErr()) {
    return Response.json({ error: "not_found" } satisfies UploadLogoResponse, {
      status: ERROR_STATUS.not_found,
    });
  }

  const declaredLength = Number(event.request.headers.get("content-length") ?? "0");
  if (!declaredLength || declaredLength > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "validation" } satisfies UploadLogoResponse, {
      status: ERROR_STATUS.validation,
    });
  }

  const bytes = Buffer.from(await event.request.arrayBuffer());
  if (bytes.length > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "validation" } satisfies UploadLogoResponse, {
      status: ERROR_STATUS.validation,
    });
  }

  const result = await imageService.replaceOrganizationLogo(actingUser, orgIdResult.value, bytes);
  return result.match(
    (updated) => Response.json(toOrganizationJson(updated) satisfies UploadLogoResponse),
    (error) =>
      Response.json({ error } satisfies UploadLogoResponse, { status: ERROR_STATUS[error] }),
  );
}
