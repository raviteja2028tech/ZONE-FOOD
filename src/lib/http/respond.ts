import "server-only";
import { randomUUID } from "node:crypto";
import { MongoServerSelectionError } from "mongodb";
import { AppError } from "./errors";
import { ConfigError } from "@/lib/env/server";
import { mapPgError } from "@/lib/db/errors";
import { log } from "@/lib/log/logger";

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}
export interface ApiFailure {
  ok: false;
  error: { code: string; message: string; details?: unknown; requestId: string };
}

type Handler<C> = (request: Request, context: C) => Promise<Response> | Response;

export function json<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ ok: true, data } satisfies ApiSuccess<T>, {
    ...init,
    headers: { "Cache-Control": "no-store", ...init?.headers },
  });
}

/** Maps any thrown value to a safe response. Internals are logged, never returned. */
export function toErrorResponse(err: unknown, requestId: string): Response {
  let status = 500;
  let code = "INTERNAL_ERROR";
  let message = "Something went wrong on our side.";
  let details: unknown;

  const mapped = mapPgError(err);
  if (err instanceof AppError || mapped) {
    ({ status, code, message, details } = (err instanceof AppError ? err : mapped) as AppError);
  } else if (err instanceof ConfigError) {
    status = 503;
    code = "CONFIG_ERROR";
    message = err.message; // names missing variables only, never values
  } else if (err instanceof MongoServerSelectionError) {
    status = 503;
    code = "DATABASE_UNAVAILABLE";
    message = "MongoDB is not reachable.";
  }

  if (status >= 500) log.error("request failed", { requestId, code, err });
  else log.warn("request rejected", { requestId, code, status });

  const body: ApiFailure = {
    ok: false,
    error: { code, message, ...(details !== undefined && { details }), requestId },
  };
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

/** Wraps a route handler with request IDs and consistent error handling. */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (request, context) => {
    const requestId = request.headers.get("x-request-id") ?? randomUUID();
    try {
      const response = await handler(request, context);
      response.headers.set("X-Request-Id", requestId);
      return response;
    } catch (err) {
      return toErrorResponse(err, requestId);
    }
  };
}
