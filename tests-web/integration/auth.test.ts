import { afterAll, describe, expect, it } from "vitest";
import { closePool, query, queryOne } from "@/lib/db/postgres";
import { closeMongo } from "@/lib/db/mongo";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { GET as meRoute } from "@/app/api/auth/me/route";
import { POST as regEstab } from "@/app/api/auth/register/establishment/route";
import { POST as regRecipient } from "@/app/api/auth/register/recipient/route";
import { GET as wasteGet, POST as wastePost } from "@/app/api/waste/route";
import { GET as estabsGet } from "@/app/api/establishments/route";
import { GET as estabGet, PATCH as estabPatch } from "@/app/api/establishments/[id]/route";
import { POST as procurementPost } from "@/app/api/procurement/route";
import { GET as feedGet } from "@/app/api/feed/route";
import { POST as etlSync } from "@/app/api/etl/sync/route";
import { call, demoPassword, login, sessionFor } from "./helpers";

afterAll(async () => {
  await closePool();
  await closeMongo();
});

describe("authentication", () => {
  it("logs in a seeded user and sets an httpOnly, SameSite=Lax session cookie", async () => {
    const admin = await sessionFor("ZONE_ADMIN");
    const { reply } = await login(admin.email);
    expect(reply.status).toBe(200);
    expect(reply.body.data.user.role).toBe("ZONE_ADMIN");
    const setCookie = reply.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/zf_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(JSON.stringify(reply.body)).not.toMatch(/password/i);
  });

  it("rejects a wrong password and an unknown e-mail with the SAME generic error", async () => {
    const admin = await sessionFor("ZONE_ADMIN");
    const wrong = await call(loginRoute, { method: "POST", body: { email: admin.email, password: "definitely-wrong-1" } });
    const unknown = await call(loginRoute, { method: "POST", body: { email: "nobody@zonefood.example", password: "definitely-wrong-1" } });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
    expect(wrong.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("stores only bcrypt hashes, never plaintext", async () => {
    const rows = await query<{ password_hash: string }>("SELECT DISTINCT password_hash FROM app_user");
    for (const r of rows) {
      expect(r.password_hash).toMatch(/^\$2[aby]\$12\$/);
      expect(r.password_hash).not.toContain(demoPassword());
    }
  });

  it("validates login input (422 with field errors)", async () => {
    const bad = await call(loginRoute, { method: "POST", body: { email: "not-an-email", password: "" } });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.error.details)).toEqual(expect.arrayContaining(["email", "password"]));
    const malformed = await loginRoute(new Request("http://localhost/api/auth/login", { method: "POST", body: "{nope" }), { params: Promise.resolve({}) });
    expect(malformed.status).toBe(400);
  });

  it("locks an address after repeated failures (429) without affecting other accounts", async () => {
    const email = "lockout.test@zonefood.example";
    for (let i = 0; i < 5; i++) expect((await call(loginRoute, { method: "POST", body: { email, password: "wrong-password-1" } })).status).toBe(401);
    const locked = await call(loginRoute, { method: "POST", body: { email, password: "wrong-password-1" } });
    expect(locked.status).toBe(429);
    const admin = await sessionFor("ZONE_ADMIN");
    expect((await login(admin.email)).reply.status).toBe(200);
  });

  it("returns 401 for protected routes without a session, with a tampered cookie, or after logout", async () => {
    expect((await call(wasteGet)).status).toBe(401);
    expect((await call(meRoute, { cookie: "zf_session=not.a.jwt" })).status).toBe(401);
    const { cookie } = await sessionFor("AUDITOR");
    expect((await call(meRoute, { cookie })).status).toBe(200);
    // flip a character in the signature
    const tampered = cookie.slice(0, -2) + (cookie.endsWith("A") ? "B" : "A") + cookie.slice(-1);
    expect((await call(meRoute, { cookie: tampered })).status).toBe(401);
    const out = await call(logoutRoute, { method: "POST", cookie });
    expect(out.headers.get("set-cookie")).toMatch(/Max-Age=0/);
  });

  it("rejects cross-site state-changing requests (Origin check)", async () => {
    const { cookie } = await sessionFor("ESTAB_STAFF");
    const res = await call(wastePost, { method: "POST", cookie, headers: { origin: "https://evil.example", host: "localhost" }, body: {} });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("BAD_ORIGIN");
  });

  it("ends a session immediately when the user is deactivated", async () => {
    const { cookie, userId } = await sessionFor("ESTAB_STAFF");
    expect((await call(meRoute, { cookie })).status).toBe(200);
    await query("UPDATE app_user SET is_active = FALSE WHERE user_id = $1", [userId]);
    expect((await call(meRoute, { cookie })).status).toBe(401);
    await query("UPDATE app_user SET is_active = TRUE WHERE user_id = $1", [userId]);
  });
});

describe("registration", () => {
  it("registers an establishment + manager atomically, hashes the password and signs the user in", async () => {
    const zone = await queryOne<{ zone_id: number }>("SELECT zone_id FROM zone WHERE zone_level = 3 ORDER BY zone_id LIMIT 1");
    const cat = await queryOne<{ category_id: number }>("SELECT category_id FROM establishment_category WHERE kind = 'COMMERCIAL' ORDER BY category_id LIMIT 1");
    const body = {
      email: "owner@newcafe.example",
      password: "Sup3rSecret-pass",
      fullName: "New Cafe Owner",
      establishment: { name: "Test Cafe Registered", categoryId: cat!.category_id, zoneId: zone!.zone_id, capacity: 40, operationalSince: "2024-01-01" },
      profile: { cuisineType: "Cafe", hasBuffet: false },
    };
    const res = await call(regEstab, { method: "POST", body });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe("ESTAB_MANAGER");
    expect(res.headers.get("set-cookie")).toMatch(/zf_session=/);
    const row = await queryOne<{ password_hash: string; establishment_id: number }>("SELECT password_hash, establishment_id FROM app_user WHERE email = $1", [body.email]);
    expect(row!.password_hash).toMatch(/^\$2[aby]\$/);
    expect(row!.password_hash).not.toContain(body.password);
    const profile = await queryOne("SELECT 1 FROM commercial_profile WHERE establishment_id = $1", [row!.establishment_id]);
    expect(profile).toBeTruthy();

    const dup = await call(regEstab, { method: "POST", body });
    expect(dup.status).toBe(409);
  });

  it("rolls back the whole registration when the account step fails (no orphan establishment)", async () => {
    const zone = await queryOne<{ zone_id: number }>("SELECT zone_id FROM zone WHERE zone_level = 3 ORDER BY zone_id LIMIT 1");
    const cat = await queryOne<{ category_id: number }>("SELECT category_id FROM establishment_category WHERE kind = 'COMMERCIAL' LIMIT 1");
    const before = Number((await queryOne<{ n: string }>("SELECT count(*) AS n FROM establishment"))!.n);
    const res = await call(regEstab, {
      method: "POST",
      body: {
        email: "owner@newcafe.example", // already taken by the previous test -> account INSERT fails after the establishment INSERT
        password: "Sup3rSecret-pass",
        fullName: "Dup",
        establishment: { name: "Orphan Check Cafe", categoryId: cat!.category_id, zoneId: zone!.zone_id, capacity: 10, operationalSince: "2024-01-01" },
        profile: {},
      },
    });
    expect(res.status).toBe(409);
    const after = Number((await queryOne<{ n: string }>("SELECT count(*) AS n FROM establishment"))!.n);
    expect(after).toBe(before);
  });

  it("rejects weak passwords and invalid input with field-level errors", async () => {
    const res = await call(regEstab, { method: "POST", body: { email: "x@y.example", password: "short", fullName: "", establishment: { name: "" }, profile: {} } });
    expect(res.status).toBe(422);
    expect(res.body.error.details.password).toMatch(/at least 10/);
  });

  it("registers a recipient organisation and its agent", async () => {
    const zone = await queryOne<{ zone_id: number }>("SELECT zone_id FROM zone WHERE zone_level = 3 ORDER BY zone_id LIMIT 1");
    const res = await call(regRecipient, {
      method: "POST",
      body: {
        email: "agent@newshelter.example",
        password: "Sup3rSecret-pass",
        fullName: "Shelter Agent",
        org: { zoneId: zone!.zone_id, orgName: "Test Night Shelter", orgType: "SHELTER", needProfile: "Night shelter feeding sixty people, accepts cooked vegetarian meals.", dailyCapacityKg: 50, acceptsCooked: true, pickupWindowStart: "18:00", pickupWindowEnd: "21:00" },
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe("RECIPIENT_AGENT");
    const emb = await queryOne<{ has: boolean }>("SELECT need_embedding IS NOT NULL AS has FROM recipient_org WHERE org_name = 'Test Night Shelter'");
    expect(emb!.has).toBe(true); // need profile embedded at registration
  });
});

describe("role-based access control (server side)", () => {
  it("auditor is read-only: can read waste, cannot write", async () => {
    const { cookie } = await sessionFor("AUDITOR");
    expect((await call(wasteGet, { cookie })).status).toBe(200);
    expect((await call(wastePost, { method: "POST", cookie, body: {} })).status).toBe(403);
    expect((await call(procurementPost, { method: "POST", cookie, body: {} })).status).toBe(403);
  });

  it("recipients cannot reach establishment operations; establishment users cannot reach the feed or the ETL", async () => {
    const rec = await sessionFor("RECIPIENT_AGENT");
    expect((await call(wasteGet, { cookie: rec.cookie })).status).toBe(403);
    expect((await call(procurementPost, { method: "POST", cookie: rec.cookie, body: {} })).status).toBe(403);
    const staff = await sessionFor("ESTAB_STAFF");
    expect((await call(feedGet, { cookie: staff.cookie })).status).toBe(403);
    expect((await call(etlSync, { method: "POST", cookie: staff.cookie, body: {} })).status).toBe(403);
    expect((await call(estabsGet, { cookie: staff.cookie })).status).toBe(403);
  });

  it("establishment users only ever see their own establishment's waste, even when asking for another", async () => {
    const staff = await sessionFor("ESTAB_STAFF");
    const other = await queryOne<{ establishment_id: number }>("SELECT establishment_id FROM establishment WHERE establishment_id <> $1 ORDER BY establishment_id LIMIT 1", [staff.establishmentId]);
    const res = await call(wasteGet, { cookie: staff.cookie, url: `/api/waste?establishmentId=${other!.establishment_id}` });
    expect(res.status).toBe(200);
    expect(res.body.data.rows.length).toBeGreaterThan(0);
    for (const r of res.body.data.rows) expect(r.establishment_id).toBe(staff.establishmentId);
  });

  it("an establishment user cannot read or edit another establishment; staff cannot edit their own", async () => {
    const mgr = await sessionFor("ESTAB_MANAGER");
    const other = await queryOne<{ establishment_id: number }>("SELECT establishment_id FROM establishment WHERE establishment_id <> $1 ORDER BY establishment_id LIMIT 1", [mgr.establishmentId]);
    const otherParams = { id: String(other!.establishment_id) };
    expect((await call(estabGet, { cookie: mgr.cookie, params: otherParams })).status).toBe(403);
    expect((await call(estabPatch, { method: "PATCH", cookie: mgr.cookie, params: otherParams, body: { name: "Hijacked" } })).status).toBe(403);
    const own = { id: String(mgr.establishmentId) };
    const edit = await call(estabPatch, { method: "PATCH", cookie: mgr.cookie, params: own, body: { capacity: 77, isActive: false } });
    expect(edit.status).toBe(200);
    expect(edit.body.data.capacity).toBe(77);
    expect(edit.body.data.is_active).toBe(true); // isActive is admin-only: silently ignored for managers
    const staff = await sessionFor("ESTAB_STAFF", "establishment_id = $2", [mgr.establishmentId]);
    expect((await call(estabPatch, { method: "PATCH", cookie: staff.cookie, params: own, body: { capacity: 5 } })).status).toBe(403);
  });

  it("a zone admin can deactivate an establishment, which immediately locks out its users", async () => {
    const admin = await sessionFor("ZONE_ADMIN");
    const staff = await sessionFor("ESTAB_STAFF");
    const params = { id: String(staff.establishmentId) };
    expect((await call(meRoute, { cookie: staff.cookie })).status).toBe(200);
    const off = await call(estabPatch, { method: "PATCH", cookie: admin.cookie, params, body: { isActive: false } });
    expect(off.status).toBe(200);
    expect((await call(meRoute, { cookie: staff.cookie })).status).toBe(401);
    await call(estabPatch, { method: "PATCH", cookie: admin.cookie, params, body: { isActive: true } });
    expect((await call(meRoute, { cookie: staff.cookie })).status).toBe(200);
  });
});
