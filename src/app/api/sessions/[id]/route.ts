import { getSession } from "@/lib/db/repositories/kitchen";
import { api, parseId } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { establishmentScope } from "@/lib/http/scope";

export const dynamic = "force-dynamic";

export const GET = api<{ id: string }>("service:read", async ({ user, params }) =>
  json(await getSession(parseId(params.id), establishmentScope(user))),
);
