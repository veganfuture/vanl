import { errAsync, okAsync, ResultAsync } from "neverthrow";
import type { ZodType, z } from "zod";
import { apiUrl } from "./api-url";

/**
 * Anything that kept us from getting a response matching the expected
 * schema: a network failure, a non-JSON body, or a body that doesn't match
 * `request`/`response`. Only ever appears on the Err side of the
 * ResultAsync apiFetch returns, so unlike the response data (arbitrary
 * parsed JSON) it needs no runtime tag to stay distinguishable.
 */
export type ApiFetchError = {
  readonly cause: unknown;
  /** The response's HTTP status, when we got a response at all. */
  readonly status?: number;
};

function apiFetchError(cause: unknown, status?: number): ApiFetchError {
  return { cause, status };
}

/** The success-only variant of a `SuccessShape | { error: ... }` response type. */
export type OkResponse<TResponse> = Exclude<TResponse, { error: string }>;

/** The `{ error: ... }` variant of a `SuccessShape | { error: ... }` response type. */
export type ErrorResponse<TResponse> = Extract<TResponse, { error: string }>;

function isErrorResponse(value: unknown): value is { error: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string"
  );
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
 * Resolves Ok with the success-only response data (or `undefined` if no
 * `response` schema was given, e.g. a 204). Everything else goes to Err:
 * a known `{ error: ... }` body, or an ApiFetchError for anything that
 * isn't a clean, schema-matching JSON body at all.
 */
export function apiFetch<
  TReq extends ZodType | undefined = undefined,
  TRes extends ZodType | undefined = undefined,
>(
  path: string,
  options?: ApiFetchOptions<TReq, TRes>,
): ResultAsync<
  TRes extends ZodType ? OkResponse<z.infer<TRes>> : undefined,
  ApiFetchError | (TRes extends ZodType ? ErrorResponse<z.infer<TRes>> : never)
> {
  const { request, body, response, method } = options ?? {};

  if (request && body !== undefined) {
    const parsedBody = request.safeParse(body);
    if (!parsedBody.success) {
      return errAsync(apiFetchError(parsedBody.error));
    }
  }

  return ResultAsync.fromPromise(
    fetch(apiUrl(path), {
      method: method ?? (body !== undefined ? "POST" : "GET"),
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
    (cause) => apiFetchError(cause),
  ).andThen((httpResponse) => {
    if (!response) {
      return okAsync(undefined as TRes extends ZodType ? OkResponse<z.infer<TRes>> : undefined);
    }
    return ResultAsync.fromPromise(httpResponse.json(), (cause) =>
      apiFetchError(cause, httpResponse.status),
    ).andThen((rawJson) => {
      const parsed = response.safeParse(rawJson);
      if (!parsed.success) {
        return errAsync(apiFetchError(parsed.error, httpResponse.status));
      }
      if (isErrorResponse(parsed.data)) {
        return errAsync(parsed.data as TRes extends ZodType ? ErrorResponse<z.infer<TRes>> : never);
      }
      return okAsync(parsed.data as TRes extends ZodType ? OkResponse<z.infer<TRes>> : undefined);
    });
  });
}

export type ApiErrorMessage = {
  readonly message: string;
  /** true: console.warn (expected, user-caused). false: console.error (a bug). */
  readonly isWarn: boolean;
};

/** Extracts the `error` union out of a `SuccessShape | { error: ... }` response type. */
export type ApiErrorOf<TResponse> = Extract<TResponse, { error: string }>["error"];

/** The `messages` shape `describeApiError` needs for a given response type. */
export type ErrorMessagesFor<TResponse> = Record<ApiErrorOf<TResponse>, ApiErrorMessage>;

/**
 * Turn an already-known-to-be-an-error apiFetch outcome into a message to
 * show the user, logging it along the way (console.error for ApiFetchError
 * and any message marked `isWarn: false`, console.warn otherwise).
 *
 * `messages` must cover every value of `TError` — inferred from `result` —
 * so adding a new error code to a response schema without adding its
 * message here is a compile error, not a silent generic fallback at
 * runtime.
 */
export function describeApiError<TError extends string>(
  result: ApiFetchError | { error: TError },
  messages: Record<TError, ApiErrorMessage>,
): string {
  if ("error" in result) {
    const entry = messages[result.error];
    if (entry.isWarn) {
      console.warn("API returned error:", result.error);
    } else {
      console.error("API returned error:", result.error);
    }
    return entry.message;
  }
  console.error("API request failed:", result.cause, result.status);
  return "Something went wrong. Please try again.";
}
