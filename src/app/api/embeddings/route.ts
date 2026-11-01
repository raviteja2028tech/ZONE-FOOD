import { embeddingCoverage } from "@/lib/db/repositories/name-resolution";
import { api } from "@/lib/http/api";
import { json } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

export const GET = api("etl:read", async () => json(await embeddingCoverage()));
