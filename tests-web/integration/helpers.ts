import { query, queryOne } from "@/lib/db/postgres";
import { POST as loginRoute } from "@/app/api/auth/login/route";

type Handler = (request: Request, context: any) => Promise<Response> | Response;

export interface Reply {
  status: number;
  body: any
  headers: Headers;
}

/** Invokes a route handler exactly as Next.js would, with an optional session cookie and path params. */
export async function call(
  handler: Handler,
  opts: { method?: string; url?: string; body?: unknown; cookie?: string; params?: Record<string, string>; headers?: Record<string, string> } = {},
): Promise<Reply> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const req = new Request(`http://localhost${opts.url ?? "/"}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
}

export const demoPassword = () => process.env.DEMO_USER_PASSWORD as string;

/** Real login through the real route; returns the Cookie header to send on later requests. */
export async function login(email: string, password = demoPassword()): Promise<{ cookie: string; reply: Reply }> {
  const reply = await call(loginRoute, { method: "POST", url: "/api/auth/login", body: { email, password } });
  const setCookie = reply.headers.get("set-cookie") ?? "";
  return { cookie: setCookie.split(";")[0] ?? "", reply };
}

export async function emailOf(role: string, where = "TRUE", args: unknown[] = []): Promise<string> {
  const row = await queryOne<{ email: string }>(`SELECT email FROM app_user WHERE role = $1::user_role AND is_active AND ${where} ORDER BY user_id LIMIT 1`, [role, ...args]);
  if (!row) throw new Error(`no seeded ${role} user`);
  return row.email;
}

export async function sessionFor(role: string, where = "TRUE", args: unknown[] = []) {
  const email = await emailOf(role, where, args);
  const { cookie } = await login(email);
  const user = await queryOne<{ user_id: number; establishment_id: number | null; recipient_id: number | null }>(
    "SELECT user_id, establishment_id, recipient_id FROM app_user WHERE email = $1",
    [email],
  );
  return { cookie, email, userId: user!.user_id, establishmentId: user!.establishment_id, recipientId: user!.recipient_id };
}

export const count = async (sql: string, args: unknown[] = []) => Number((await query<{ n: string }>(sql, args))[0]?.n ?? 0);
