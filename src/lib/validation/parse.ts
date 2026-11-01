import { z } from "zod";
import { badRequest, validationFailed } from "@/lib/http/errors";

/** Flattens Zod issues into `{ field: message }` for API clients. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    out[key] ??= issue.message;
  }
  return out;
}

export function parseWith<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw validationFailed(fieldErrors(result.error));
  return result.data;
}

/** Validates `?query=string` parameters. Repeated keys collapse to the last value. */
export function parseSearchParams<S extends z.ZodType>(request: Request, schema: S): z.infer<S> {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  return parseWith(schema, params);
}

/** Validates a JSON request body; malformed JSON is a 400, schema failures are a 422. */
export async function parseJson<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
  return parseWith(schema, body);
}
