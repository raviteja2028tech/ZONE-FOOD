import "server-only";
import { z } from "zod";

/**
 * Server-side environment, validated once. Nothing here has a default for a secret:
 * a missing or invalid variable raises ConfigError naming the variable (never its value).
 * The variables are the same ones Part 1's Docker/Python tooling reads from `.env`.
 */
const nonEmpty = (name: string) => z.string({ error: `${name} is required` }).trim().min(1, `${name} is required`);
const port = (name: string) =>
  z.coerce
    .number({ error: `${name} must be a number` })
    .int(`${name} must be an integer`)
    .min(1, `${name} must be 1-65535`)
    .max(65535, `${name} must be 1-65535`);

const schema = z.object({
  POSTGRES_HOST: z.string().trim().min(1).default("127.0.0.1"),
  POSTGRES_PORT: port("POSTGRES_PORT").default(5433),
  POSTGRES_USER: nonEmpty("POSTGRES_USER"),
  POSTGRES_PASSWORD: nonEmpty("POSTGRES_PASSWORD"),
  POSTGRES_DB: nonEmpty("POSTGRES_DB"),

  MONGO_HOST: z.string().trim().min(1).default("127.0.0.1"),
  MONGO_PORT: port("MONGO_PORT").default(27018),
  MONGO_INITDB_ROOT_USERNAME: nonEmpty("MONGO_INITDB_ROOT_USERNAME"),
  MONGO_INITDB_ROOT_PASSWORD: nonEmpty("MONGO_INITDB_ROOT_PASSWORD"),
  MONGO_DB: z.string().trim().min(1).default("zonefood"),

  SESSION_SECRET: z
    .string({ error: "SESSION_SECRET is required" })
    .min(32, "SESSION_SECRET must be at least 32 characters"),
  DEMO_LOGIN_HINTS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type ServerEnv = z.infer<typeof schema>;

export class ConfigError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`Invalid server configuration: ${issues.join("; ")}. Copy .env.example to .env and set these values.`);
    this.name = "ConfigError";
    this.issues = issues;
  }
}

/** Pure parser (exported for unit tests). */
export function parseEnv(source: Record<string, string | undefined>): ServerEnv {
  // Treat empty strings as "unset" so `FOO=` in .env behaves like a missing value.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ""));
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((i) => i.message));
  }
  if (source.NODE_ENV === "production" && result.data.SESSION_SECRET.startsWith("change_me")) {
    throw new ConfigError(["SESSION_SECRET is still the .env.example placeholder"]);
  }
  return result.data;
}

let cached: ServerEnv | undefined;
export function getEnv(): ServerEnv {
  cached ??= parseEnv(process.env);
  return cached;
}
