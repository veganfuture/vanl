import { logger } from "./logger";

/** Returns undefined on any parse failure rather than throwing — callers validate with zod anyway. */
export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (cause) {
    logger.warn({ err: cause }, "request body was not valid JSON");
    return undefined;
  }
}
