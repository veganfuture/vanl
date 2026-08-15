import type { ZodType, z } from "zod";
import { apiUrl } from "./api-url";

const API_FETCH_ERROR = Symbol("apiFetchError");

/**
 * Anything that kept us from getting a response matching the expected
 * schema: a network failure, a non-JSON body, or a body that doesn't match
 * `request`/`response`. Tagged with a Symbol rather than a string field
 * because the success type comes straight from `response.json()` — real
 * parsed JSON can never contain a symbol-keyed property, so this can never
 * collide with a legitimate response shape.
 */
export type ApiFetchError = {
  readonly [API_FETCH_ERROR]: true;
  readonly cause: unknown;
  /** The response's HTTP status, when we got a response at all. */
  readonly status?: number;
};

export function isApiFetchError(value: unknown): value is ApiFetchError {
  return typeof value === "object" && value !== null && API_FETCH_ERROR in value;
}

function apiFetchError(cause: unknown, status?: number): ApiFetchError {
  return { [API_FETCH_ERROR]: true, cause, status };
}

type ApiFetchOptions<TReq extends ZodType | undefined, TRes extends ZodType | undefined> = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Validated with `request.safeParse(body)` before the request is sent. */
  request?: TReq;
  body?: TReq extends ZodType ? z.infer<TReq> : never;
  /** Validated with `response.safeParse(...)` against the parsed JSON body. */
  response?: TRes;
};

/**
 * Fetch one of our own API routes, safely: resolves the URL for SSR (see
 * apiUrl), optionally validates the outgoing body against `request`, and
 * validates the incoming body against `response` regardless of HTTP status
 * — our routes return typed `{ error: ... }` bodies on 4xx/5xx that are
 * still part of the `response` schema, not exceptional.
 *
 * Returns the parsed response data (or `undefined` if no `response` schema
 * was given, e.g. a 204), or an `ApiFetchError` for anything that isn't a
 * clean, schema-matching JSON body.
 */
export async function apiFetch<
  TReq extends ZodType | undefined = undefined,
  TRes extends ZodType | undefined = undefined,
>(
  path: string,
  options?: ApiFetchOptions<TReq, TRes>,
): Promise<(TRes extends ZodType ? z.infer<TRes> : undefined) | ApiFetchError> {
  const { request, body, response, method } = options ?? {};

  if (request && body !== undefined) {
    const parsedBody = request.safeParse(body);
    if (!parsedBody.success) {
      return apiFetchError(parsedBody.error);
    }
  }

  let httpResponse: Response;
  try {
    httpResponse = await fetch(apiUrl(path), {
      method: method ?? (body !== undefined ? "POST" : "GET"),
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    return apiFetchError(cause);
  }

  if (!response) {
    return undefined as TRes extends ZodType ? z.infer<TRes> : undefined;
  }

  let rawJson: unknown;
  try {
    rawJson = await httpResponse.json();
  } catch (cause) {
    return apiFetchError(cause, httpResponse.status);
  }

  const parsed = response.safeParse(rawJson);
  if (!parsed.success) {
    return apiFetchError(parsed.error, httpResponse.status);
  }
  return parsed.data as TRes extends ZodType ? z.infer<TRes> : undefined;
}
