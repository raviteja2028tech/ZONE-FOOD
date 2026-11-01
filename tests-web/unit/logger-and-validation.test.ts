import { describe, expect, it } from "vitest";
import { z } from "zod";
import { redact, scrub } from "@/lib/log/logger";
import { AppError } from "@/lib/http/errors";
import { parseJson, parseSearchParams, parseWith } from "@/lib/validation/parse";
import { toErrorResponse } from "@/lib/http/respond";

describe("log redaction", () => {
  it("scrubs credentials inside connection strings", () => {
    expect(scrub("failed mongodb://admin:hunter2@host:27017/db")).toBe("failed mongodb://[redacted]@host:27017/db");
  });
  it("redacts sensitive keys, including nested ones", () => {
    const out = redact({ user: "x", password: "p", nested: { token: "t", ok: 1 } }) as Record<string, unknown>;
    expect(out.password).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).token).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).ok).toBe(1);
  });
  it("flattens errors without stack traces", () => {
    expect(redact(new Error("boom"))).toEqual({ name: "Error", message: "boom" });
  });
});

describe("validation helpers", () => {
  const schema = z.object({ qty: z.coerce.number().positive("qty must be positive"), name: z.string().min(1, "name is required") });

  it("returns typed data when valid", () => {
    expect(parseWith(schema, { qty: "2.5", name: "rice" })).toEqual({ qty: 2.5, name: "rice" });
  });

  it("throws a 422 AppError with per-field messages", () => {
    try {
      parseWith(schema, { qty: -1, name: "" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const e = err as AppError;
      expect(e.status).toBe(422);
      expect(e.details).toEqual({ qty: "qty must be positive", name: "name is required" });
    }
  });

  it("validates search params", () => {
    const req = new Request("http://x.test/api?qty=3&name=a");
    expect(parseSearchParams(req, schema)).toEqual({ qty: 3, name: "a" });
  });

  it("maps malformed JSON to 400 and bad shapes to 422", async () => {
    const bad = new Request("http://x.test", { method: "POST", body: "{nope" });
    await expect(parseJson(bad, schema)).rejects.toMatchObject({ status: 400 });
    const wrong = new Request("http://x.test", { method: "POST", body: JSON.stringify({ qty: 0, name: "a" }) });
    await expect(parseJson(wrong, schema)).rejects.toMatchObject({ status: 422 });
  });
});

describe("error envelope", () => {
  it("returns AppError details with the request id", async () => {
    const res = toErrorResponse(new AppError(404, "NOT_FOUND", "Nope."), "req-1");
    expect(res.status).toBe(404);
    expect(res.headers.get("X-Request-Id")).toBe("req-1");
    expect(await res.json()).toEqual({ ok: false, error: { code: "NOT_FOUND", message: "Nope.", requestId: "req-1" } });
  });

  it("hides internals of unexpected errors", async () => {
    const res = toErrorResponse(new Error("password=hunter2 at /srv/secret.ts"), "req-2");
    expect(res.status).toBe(500);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain("hunter2");
    expect(body).toContain("INTERNAL_ERROR");
  });
});
