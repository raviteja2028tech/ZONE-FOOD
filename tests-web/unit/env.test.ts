import { describe, expect, it } from "vitest";
import { ConfigError, parseEnv } from "@/lib/env/server";

const valid = {
  POSTGRES_USER: "u",
  POSTGRES_PASSWORD: "p",
  POSTGRES_DB: "d",
  MONGO_INITDB_ROOT_USERNAME: "mu",
  MONGO_INITDB_ROOT_PASSWORD: "mp",
  SESSION_SECRET: "0123456789abcdef0123456789abcdef",
};

describe("parseEnv", () => {
  it("applies non-secret defaults (loopback hosts, Part 1 ports)", () => {
    const env = parseEnv(valid);
    expect(env.POSTGRES_HOST).toBe("127.0.0.1");
    expect(env.POSTGRES_PORT).toBe(5433);
    expect(env.MONGO_PORT).toBe(27018);
    expect(env.MONGO_DB).toBe("zonefood");
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("coerces ports from strings", () => {
    expect(parseEnv({ ...valid, POSTGRES_PORT: "6000" }).POSTGRES_PORT).toBe(6000);
  });

  it("names every missing secret and never invents defaults for them", () => {
    try {
      parseEnv({});
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const msg = (err as ConfigError).message;
      for (const name of ["POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB", "MONGO_INITDB_ROOT_USERNAME", "MONGO_INITDB_ROOT_PASSWORD", "SESSION_SECRET"]) {
        expect(msg).toContain(name);
      }
      expect(msg).toContain(".env.example");
    }
  });

  it("treats an empty value like a missing one", () => {
    expect(() => parseEnv({ ...valid, POSTGRES_PASSWORD: "" })).toThrow(/POSTGRES_PASSWORD/);
  });

  it("rejects a short or placeholder session secret", () => {
    expect(() => parseEnv({ ...valid, SESSION_SECRET: "short" })).toThrow(/SESSION_SECRET/);
    expect(() =>
      parseEnv({ ...valid, SESSION_SECRET: "change_me_to_a_long_random_string_of_at_least_32_chars", NODE_ENV: "production" }),
    ).toThrow(/placeholder/);
  });

  it("rejects invalid ports", () => {
    expect(() => parseEnv({ ...valid, POSTGRES_PORT: "abc" })).toThrow(/POSTGRES_PORT/);
    expect(() => parseEnv({ ...valid, MONGO_PORT: "70000" })).toThrow(/MONGO_PORT/);
  });

  it("does not echo secret values in error messages", () => {
    try {
      parseEnv({ ...valid, POSTGRES_PASSWORD: "super-secret-value", POSTGRES_PORT: "bad" });
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).not.toContain("super-secret-value");
    }
  });
});
