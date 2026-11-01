import { retryDocument } from "@/lib/db/repositories/etl";
import { api } from "@/lib/http/api";
import { json } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

/** POST /api/etl/retry/:id - re-processes one FAILED submission (the "retry" button). */
export const POST = api<{ id: string }>("etl:run", async ({ user, params }) => json(await retryDocument(params.id, user.userId)));
