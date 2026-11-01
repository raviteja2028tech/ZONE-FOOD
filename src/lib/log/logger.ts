import "server-only";

type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE = /pass(word)?|secret|token|authorization|cookie|uri|dsn|connection/i;

/** Strips credentials embedded in connection strings, e.g. mongodb://user:pass@host. */
export function scrub(text: string): string {
  return text.replace(/(\w+:\/\/)[^\s/@]+:[^\s/@]+@/g, "$1[redacted]@");
}

/** Redacts values of sensitive-looking keys and flattens Errors so logs never leak secrets. */
export function redact(value: unknown, depth = 0): unknown {
  if (value instanceof Error) return { name: value.name, message: scrub(value.message) };
  if (typeof value === "string") return scrub(value);
  if (value === null || typeof value !== "object" || depth > 4) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, SENSITIVE.test(k) ? "[redacted]" : redact(v, depth + 1)]),
  );
}

function threshold(): number {
  const raw = (process.env.LOG_LEVEL ?? "info") as Level;
  return order[raw] ?? order.info;
}

function emit(level: Level, message: string, context?: Record<string, unknown>) {
  if (order[level] < threshold()) return;
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    message: scrub(message),
    ...(redact(context) as object),
  });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

export const log = {
  debug: (m: string, c?: Record<string, unknown>) => emit("debug", m, c),
  info: (m: string, c?: Record<string, unknown>) => emit("info", m, c),
  warn: (m: string, c?: Record<string, unknown>) => emit("warn", m, c),
  error: (m: string, c?: Record<string, unknown>) => emit("error", m, c),
};
