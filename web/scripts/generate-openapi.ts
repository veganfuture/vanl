import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extendZodWithOpenApi,
  OpenApiGeneratorV3,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi";
import prettier from "prettier";
import { z } from "zod";
import { EventRequestSchema } from "../src/routes/api/events/event.schema";
import {
  CreateEventResponseSchema,
  ListEventsResponseSchema,
} from "../src/routes/api/events/index.schema";
import { UpdateEventResponseSchema } from "../src/routes/api/events/[id].schema";
import { UploadFlyerResponseSchema } from "../src/routes/api/events/[id]/flyer.schema";
import { SearchPlacesResponseSchema } from "../src/routes/api/places/search.schema";

/**
 * Generates openapi.json from the Zod schemas the routes below already
 * validate against - this is documentation/codegen input derived from
 * existing validation, not a replacement for it. The route handlers
 * (index.ts, [id].ts, [id]/flyer.ts, mine.ts, places/search.ts) are
 * hand-written and stay exactly as they are; nothing here generates or
 * scaffolds them.
 *
 * Scope is deliberately narrow: only the five endpoints the Signal bot
 * calls as the signal-bot account (see AuthService.getBotUser), which is
 * also what src/bot/event_web_client.py's generated client is built from
 * (see bot/README.md's OpenAPI section). Not a full spec of the website's
 * API - extend this file's registerPath calls if the bot starts calling
 * more of it.
 *
 * `--check` regenerates in memory and diffs against the committed
 * openapi.json instead of writing, so drift between the Zod schemas and
 * the bot's generated client can be caught (e.g. in a precommit hook or
 * CI step) rather than silently accepted.
 */

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

const eventRequestBody = EventRequestSchema.openapi("EventRequest");
const createEventResponse = CreateEventResponseSchema.openapi("CreateEventResponse");
const updateEventResponse = UpdateEventResponseSchema.openapi("UpdateEventResponse");
const uploadFlyerResponse = UploadFlyerResponseSchema.openapi("UploadFlyerResponse");
const listEventsResponse = ListEventsResponseSchema.openapi("ListEventsResponse");
const searchPlacesResponse = SearchPlacesResponseSchema.openapi("SearchPlacesResponse");

const eventIdParam = registry.registerParameter(
  "EventId",
  z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
);

registry.registerPath({
  method: "post",
  path: "/api/events",
  summary:
    "Create an event, published as the caller (the signal-bot account, for bot-created drafts).",
  request: {
    body: { content: { "application/json": { schema: eventRequestBody } } },
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: createEventResponse } },
    },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/events/{id}",
  summary: "Update an event the caller may modify (site_admin, or the event's own publisher).",
  request: {
    params: z.object({ id: eventIdParam }),
    body: { content: { "application/json": { schema: eventRequestBody } } },
  },
  responses: {
    200: {
      description: "Updated",
      content: { "application/json": { schema: updateEventResponse } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/events/{id}/flyer",
  summary: "Replace an event's flyer image. Body is the raw image bytes (not JSON/multipart).",
  request: {
    params: z.object({ id: eventIdParam }),
    body: {
      content: { "application/octet-stream": { schema: z.string().openapi({ format: "binary" }) } },
    },
  },
  responses: {
    200: {
      description: "Updated",
      content: { "application/json": { schema: uploadFlyerResponse } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/events/mine",
  summary:
    "Every event published by the caller, any status - used for update-matching against the bot's own past drafts.",
  responses: {
    200: { description: "OK", content: { "application/json": { schema: listEventsResponse } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/events",
  summary:
    "Every visible event regardless of publisher - matching the bot's own drafts (mine) alone " +
    "isn't enough to avoid duplicates, since a human may already have manually published the " +
    "same event, or it may already exist via the ARC feed import.",
  responses: {
    200: { description: "OK", content: { "application/json": { schema: listEventsResponse } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/places/search",
  summary: "Resolve a free-text city name to a placeId.",
  request: {
    query: z.object({ q: z.string().min(2) }),
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: searchPlacesResponse } } },
  },
});

const generator = new OpenApiGeneratorV3(registry.definitions);
const document = generator.generateDocument({
  openapi: "3.0.0",
  info: {
    title: "veganactivists.nl API (bot-consumed subset)",
    version: "1.0.0",
    description:
      "Only the endpoints the Signal bot calls as the signal-bot account. See scripts/generate-openapi.ts.",
  },
});

const outPath = join(dirname(fileURLToPath(import.meta.url)), "..", "openapi.json");
// Formatted through prettier (not just JSON.stringify) so the committed
// file always matches what `bun run format:check` expects - otherwise
// every regeneration would need a manual `bun run format` pass after it.
const prettierConfig = await prettier.resolveConfig(outPath);
const rendered = await prettier.format(JSON.stringify(document), {
  ...prettierConfig,
  filepath: outPath,
  parser: "json",
});

if (process.argv.includes("--check")) {
  const current = existsSync(outPath) ? readFileSync(outPath, "utf-8") : null;
  if (current !== rendered) {
    console.error(
      `${outPath} is stale relative to the Zod schemas it's generated from. Run \`bun run generate-openapi\`.`,
    );
    process.exit(1);
  }
  console.log("openapi.json is up to date.");
} else {
  writeFileSync(outPath, rendered);
  console.log(`Wrote ${outPath}`);
}
