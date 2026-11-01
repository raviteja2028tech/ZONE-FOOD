import { renameZone } from "@/lib/db/repositories/zones";
import { api, parseId } from "@/lib/http/api";
import { json } from "@/lib/http/respond";
import { parseJson } from "@/lib/validation/parse";
import { zoneRenameSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

export const PATCH = api<{ id: string }>("zone:manage", async ({ request, params }) => {
  const { zoneName } = await parseJson(request, zoneRenameSchema);
  return json({ zoneId: await renameZone(parseId(params.id), zoneName) });
});
