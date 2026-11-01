"""Deterministic synthetic seed data for ZoneFood (PostgreSQL + MongoDB).

    python scripts/seed.py [--days 150] [--end-date YYYY-MM-DD] [--rng-seed 42]
                           [--db NAME] [--mongo-db NAME] [--skip-mongo]

ALL DATA IS SYNTHETIC. Names, people and numbers are invented; nothing here describes a real
business, institution, NGO, locality or food-safety record.

Repeatable: the script first empties every demo table (reference/lookup rows from migration 010
are kept) and rebuilds the MongoDB collections, so it can be re-run at any time. Random choices
come from one seeded generator, so the same --rng-seed and --end-date give the same data.
(Default end date is yesterday, so "last 30/90 days" queries always have data; pass --end-date
for a fully reproducible dataset. A few "live" marketplace listings are anchored to the current
time on purpose.)

Planted, discoverable signals (so analytics have a story to tell):
  * Greenfield Academy Canteen over-prepares by ~38% (chronic low utilisation).
  * Supplier "Greenacre Farms (produce)" has ~3x the spoilage rate of other produce suppliers.
  * Produce spoilage is ~1.8x higher in the monsoon months (Jun-Sep).
  * Weekly seasonality (college mess drops on Sunday, offices closed at weekends, restaurants peak Fri/Sat).
  * Events: exam periods raise institutional attendance and plate waste; vacations collapse it.
  * ~2% of sessions have an anomalous turnout (large unexplained waste spike).
"""
from __future__ import annotations

import argparse
import math
import random
import re
import struct
import sys
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

import bcrypt
import psycopg
from bson import ObjectId
from pymongo import MongoClient

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mongo_init  # noqa: E402
import seed_catalog as cat  # noqa: E402
from db_config import env, mongo_db_name, mongo_uri, pg_dsn  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))
SLOT_TIME = {"BREAKFAST": time(7, 30), "LUNCH": time(12, 30), "SNACKS": time(16, 30),
             "DINNER": time(19, 30), "ALL_DAY": time(9, 0)}
KG_PER_DINER = {"BREAKFAST": 0.25, "LUNCH": 0.42, "SNACKS": 0.15, "DINNER": 0.42, "ALL_DAY": 0.30}

# per establishment category: diners per capacity-unit for each slot, avg plate-waste share, over-preparation factor
CAT_CFG = {
    "Fine Dining":         {"slots": {"LUNCH": .70, "DINNER": 1.10}, "plate": .07, "overprep": 1.12},
    "Casual Dining":       {"slots": {"LUNCH": 1.20, "DINNER": 1.50}, "plate": .06, "overprep": 1.15},
    "Cafe & Bakery":       {"slots": {"BREAKFAST": 1.00, "SNACKS": 1.20}, "plate": .04, "overprep": 1.20},
    "Quick Service":       {"slots": {"LUNCH": 1.80, "DINNER": 1.80}, "plate": .04, "overprep": 1.12},
    "College Mess":        {"slots": {"BREAKFAST": .45, "LUNCH": .80, "DINNER": .75}, "plate": .07, "overprep": 1.08},
    "School Canteen":      {"slots": {"LUNCH": .55}, "plate": .08, "overprep": 1.10},
    "Hostel Mess":         {"slots": {"BREAKFAST": .85, "LUNCH": .90, "DINNER": .95}, "plate": .06, "overprep": 1.07},
    "Corporate Cafeteria": {"slots": {"LUNCH": .60, "SNACKS": .30}, "plate": .05, "overprep": 1.10},
    "Hospital Kitchen":    {"slots": {"BREAKFAST": 2.1, "LUNCH": 2.1, "DINNER": 2.1}, "plate": .09, "overprep": 1.06},
    "Supermarket":         {"slots": {"ALL_DAY": .06}, "plate": .01, "overprep": 1.20},
    "Club House":          {"slots": {"LUNCH": .30, "DINNER": .25}, "plate": .06, "overprep": 1.18},
}
EDU = {"College Mess", "School Canteen", "Hostel Mess"}
RESTAURANT = {"Fine Dining", "Casual Dining", "Cafe & Bakery", "Quick Service"}

SPOIL_BASE = {"Vegetables": .10, "Fruits": .10, "Dairy": .08, "Meat & Poultry": .06, "Fish & Seafood": .07,
              "Eggs": .03, "Breads & Bakery": .08}
PRODUCE = {"Vegetables", "Fruits"}


def rnd(x: float, n: int = 3) -> float:
    return round(x, n)


def uniform(rng, a, b):
    return rng.uniform(a, b)


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", ".", text.lower()).strip(".")[:34].strip(".")


def at(d: date, t: time) -> datetime:
    return datetime.combine(d, t, tzinfo=IST)


class Counter:
    def __init__(self, start: int = 1):
        self.n = start - 1

    def next(self) -> int:
        self.n += 1
        return self.n


def eligible(slot: str, dish: str) -> bool:
    if slot == "BREAKFAST":
        return dish in cat.BREAKFAST_DISHES
    if slot == "SNACKS":
        return dish in cat.SNACK_DISHES
    if slot == "ALL_DAY":
        return True
    return dish not in cat.MAIN_EXCLUDED


def slot_active(category: str, slot: str, dow: int) -> bool:
    if category in ("School Canteen", "Corporate Cafeteria") and dow >= 5:
        return False
    if category == "Club House" and slot == "LUNCH" and dow < 5:
        return False
    return True


def dow_factor(category: str, slot: str, dow: int) -> float:
    if category in RESTAURANT:
        return {0: .85, 4: 1.2, 5: 1.4, 6: 1.15}.get(dow, 1.0)
    if category == "College Mess":
        return {5: .75, 6: .40}.get(dow, 1.0)
    if category == "Supermarket":
        return {5: 1.25, 6: 1.30}.get(dow, 1.0)
    if category == "Club House":
        return 2.2 if dow >= 5 else 1.0
    return 1.0


def event_effect(category: str, kind: str, active: list[tuple[str, tuple]], block: int) -> tuple[float, float]:
    """Return (demand multiplier, plate-waste multiplier); demand 0 means the venue is closed."""
    demand, plate = 1.0, 1.0
    for etype, blocks in active:
        if blocks and block not in blocks:
            continue
        if etype == "EXAM_PERIOD" and category in EDU:
            demand *= 1.12
            plate *= 1.35
        elif etype == "PUBLIC_HOLIDAY":
            if category in ("School Canteen", "Corporate Cafeteria"):
                demand = 0
            elif category == "College Mess":
                demand *= .3
            elif kind == "COMMERCIAL":
                demand *= 1.2
        elif etype == "FESTIVAL":
            if kind in ("COMMERCIAL", "RECREATIONAL"):
                demand *= 1.4
            elif category in EDU:
                demand *= .7
            elif kind == "ORGANIZATIONAL":
                demand *= .8
        elif etype == "VACATION":
            if category in ("School Canteen", "College Mess"):
                demand *= .15
            elif category == "Hostel Mess":
                demand *= .25
        elif etype == "LOCAL_EVENT" and kind in ("COMMERCIAL", "RECREATIONAL"):
            demand *= 1.3
    return demand, plate


def copy_rows(cur, table: str, columns: str, rows: list[tuple]) -> None:
    with cur.copy(f"COPY {table} ({columns}) FROM STDIN") as cp:
        for row in rows:
            cp.write_row(row)
    print(f"  {table:<22} {len(rows):>7} rows")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--days", type=int, default=150, help="history length in days (default 150)")
    ap.add_argument("--end-date", help="last simulated day, YYYY-MM-DD (default: yesterday)")
    ap.add_argument("--rng-seed", type=int, default=42)
    ap.add_argument("--db", help="PostgreSQL database (default: POSTGRES_DB)")
    ap.add_argument("--mongo-db", help="MongoDB database (default: MONGO_DB)")
    ap.add_argument("--skip-mongo", action="store_true")
    args = ap.parse_args()

    demo_pw = env("DEMO_USER_PASSWORD")
    rng = random.Random(args.rng_seed)
    now = datetime.now(timezone.utc)

    with psycopg.connect(pg_dsn(args.db)) as conn:
        # The database's own CURRENT_DATE is the reference: ck_waste_not_future compares against it.
        today = conn.execute("SELECT CURRENT_DATE").fetchone()[0]
        end = date.fromisoformat(args.end_date) if args.end_date else today - timedelta(days=1)
        if end >= today:
            sys.exit("--end-date must be before today (waste_event rejects future dates).")
        start = end - timedelta(days=args.days - 1)
        build_and_load(conn, rng, start, end, today, now, demo_pw, args)

    print("Seed complete.")


def build_and_load(conn, rng, start, end, today, now, demo_pw, args) -> None:
    # ---------------------------------------------------------------- reference lookups
    ok = conn.execute("SELECT count(*) FROM schema_migrations WHERE version = '011'").fetchone()[0]
    if not ok:
        sys.exit("Migrations not applied. Run: python scripts/migrate.py up")

    def lookup(sql_text: str) -> dict:
        return dict(conn.execute(sql_text).fetchall())

    estab_cat_id = lookup("SELECT category_name, category_id FROM establishment_category")
    estab_cat_kind = lookup("SELECT category_name, kind::text FROM establishment_category")
    food_cat_id = lookup("SELECT category_name, food_category_id FROM food_category")
    reason = lookup("SELECT reason_code, reason_id FROM waste_reason")
    route = lookup("SELECT route_name, route_id FROM disposal_route")
    shelf_hours = lookup("SELECT category_name, default_shelf_life_hours FROM food_category")

    # ---------------------------------------------------------------- zones
    zones, street_zone_ids, street_block = [], [], {}
    sector_id = 1
    zones.append((sector_id, None, "Demo Sector 7", 1, "999000", 12.9000, 77.5000))
    zid = Counter(2)
    block_ids = []
    for b in range(6):
        bid = zid.next()
        block_ids.append(bid)
        zones.append((bid, sector_id, f"Block {'ABCDEF'[b]}", 2, f"99{b + 1}000", rnd(12.9 + b * .004, 6), rnd(77.5 + (b % 3) * .004, 6)))
        for s in range(4):
            sid = zid.next()
            street_zone_ids.append(sid)
            street_block[sid] = b
            zones.append((sid, bid, f"{'ABCDEF'[b]}{s + 1} Street", 3, f"99{b + 1}{s + 1:03d}",
                          rnd(12.9 + b * .004 + s * .001, 6), rnd(77.5 + (b % 3) * .004 + s * .001, 6)))
    zone_centroid = {z[0]: (z[5], z[6]) for z in zones}
    zone_name = {z[0]: z[2] for z in zones}

    # ---------------------------------------------------------------- establishments
    estabs, commercial, institutional, residential = [], [], [], []
    estab_info = {}  # id -> dict
    eid = Counter()

    def add_estab(name, category, capacity, extra):
        i = eid.next()
        z = rng.choice(street_zone_ids)
        lat, lng = zone_centroid[z]
        kind = estab_cat_kind[category]
        estabs.append((i, z, estab_cat_id[category], name, f"{rng.randint(1, 120)} {zone_name[z]}, Demo Sector 7",
                       rnd(lat + rng.uniform(-.0004, .0004), 6), rnd(lng + rng.uniform(-.0004, .0004), 6),
                       capacity, start - timedelta(days=rng.randint(200, 3000)), True))
        estab_info[i] = {"name": name, "category": category, "kind": kind, "capacity": capacity, "zone": z,
                         "block": street_block[z], "extra": extra}
        return i

    for name, category, capacity, extra in cat.ESTABLISHMENTS:
        i = add_estab(name, category, capacity, extra)
        kind = estab_info[i]["kind"]
        if kind in ("COMMERCIAL", "RETAIL_FOOD", "RECREATIONAL"):
            commercial.append((i, extra.get("cuisine"), capacity if kind == "COMMERCIAL" else None,
                               int(capacity * CAT_CFG[category]["slots"].get("DINNER", .6) * 1.2) if kind == "COMMERCIAL" else None,
                               bool(extra.get("buffet")), f"FSSAI-DEMO-{i:06d}"))
        else:
            meals = {"College Mess": 3, "School Canteen": 1, "Hostel Mess": 3, "Corporate Cafeteria": 2, "Hospital Kitchen": 3}[category]
            institutional.append((i, capacity, extra.get("mess"), meals, extra.get("cal")))
    non_res_ids = list(estab_info)

    for k, name in enumerate(cat.RESIDENTIAL_NAMES + cat.HOUSE_CLUSTER_NAMES):
        is_apt = k < len(cat.RESIDENTIAL_NAMES)
        households = rng.randint(20, 120) if is_apt else rng.randint(8, 25)
        occupants = int(households * rng.uniform(2.6, 3.6 if is_apt else 4.4))
        i = add_estab(name, "Apartment Block" if is_apt else "Independent Houses", occupants, {})
        estab_info[i]["segregated"] = rng.random() < .6
        estab_info[i]["occupants"] = occupants
        residential.append((i, households, occupants, is_apt and rng.random() < .1, estab_info[i]["segregated"]))
    res_ids = [i for i in estab_info if i not in non_res_ids]

    # ---------------------------------------------------------------- suppliers, recipients
    suppliers = [(n + 1, s[0], rng.choice(block_ids), f"90000{n + 1:05d}", s[1]) for n, s in enumerate(cat.SUPPLIERS)]
    sup_by_group = defaultdict(list)
    for n, s in enumerate(cat.SUPPLIERS):
        sup_by_group[s[2]].append(n + 1)
    greenacre_id = 1

    recipients = []
    for n, (name, otype, cooked, cap, ws, we, need) in enumerate(cat.RECIPIENTS, start=1):
        recipients.append((n, rng.choice(street_zone_ids), name, otype, need, float(cap), cooked,
                           time.fromisoformat(ws), time.fromisoformat(we), f"91000{n:05d}"))
    cooked_recipients = [r[0] for r in recipients if r[6] and r[3] != "COMPOST_UNIT"]

    # ---------------------------------------------------------------- users
    pw_hash = bcrypt.hashpw(demo_pw.encode(), bcrypt.gensalt(rounds=12)).decode()
    users, uid = [], Counter()
    staff_of, manager_of = {}, {}

    def add_user(email, name, role, estab=None, recip=None):
        i = uid.next()
        users.append((i, estab, recip, email, pw_hash, name, role, f"98{i:08d}", True))
        return i

    add_user("admin@zonefood.example", "Zone Administrator (demo)", "ZONE_ADMIN")
    add_user("auditor@zonefood.example", "Zone Auditor (demo)", "AUDITOR")
    for i in non_res_ids:
        s = slugify(estab_info[i]["name"])
        manager_of[i] = add_user(f"manager.{s}@zonefood.example", f"Manager, {estab_info[i]['name']}", "ESTAB_MANAGER", estab=i)
        staff_of[i] = add_user(f"staff.{s}@zonefood.example", f"Kitchen Staff, {estab_info[i]['name']}", "ESTAB_STAFF", estab=i)
    for i in res_ids[:6]:
        add_user(f"resident.{slugify(estab_info[i]['name'])}@zonefood.example", f"Association Secretary, {estab_info[i]['name']}",
                 "ESTAB_MANAGER", estab=i)
    for r in recipients:
        add_user(f"agent.{slugify(r[2])}@zonefood.example", f"Coordinator, {r[2]}", "RECIPIENT_AGENT", recip=r[0])

    # ---------------------------------------------------------------- food items, dishes
    foods, food_id, food_cat_of, food_cost = [], {}, {}, {}
    for n, (name, c, unit, cost, edible, desc) in enumerate(cat.RAW_FOODS, start=1):
        foods.append((n, food_cat_id[c], name, desc, unit, float(cost), edible))
        food_id[name], food_cat_of[n], food_cost[n] = n, c, float(cost)
    for name, (c, veg, portion, cost, _) in cat.DISHES.items():
        n = len(foods) + 1
        foods.append((n, food_cat_id[c], name, "Cooked dish (synthetic demo catalogue)", "kg", float(cost), True))
        food_id[name], food_cat_of[n], food_cost[n] = n, c, float(cost)

    dishes, dish_ingredients, dish_of = [], [], {}  # dish_of: estab -> {dish_name: dish_id}
    did = Counter()
    for i in non_res_ids:
        info = estab_info[i]
        pool = cat.DISH_POOLS[info["category"]]
        slots = list(CAT_CFG[info["category"]]["slots"])
        for _ in range(60):
            chosen = rng.sample(pool, min(len(pool), rng.randint(7, 10)))
            if all(sum(eligible(s, d) for d in chosen) >= 2 for s in slots):
                break
        dish_of[i] = {}
        for dname in chosen:
            _, veg, portion, _, ingredients = cat.DISHES[dname]
            d = did.next()
            dish_of[i][dname] = d
            dishes.append((d, i, dname, float(portion), veg))
            for raw, q in ingredients:
                dish_ingredients.append((d, food_id[raw], float(q)))
    dish_ing_map = defaultdict(list)
    for d, f, q in dish_ingredients:
        dish_ing_map[d].append((f, q))
    dish_meta = {d[0]: d for d in dishes}

    # ---------------------------------------------------------------- locality events
    events, zone_events, day_events = [], [], defaultdict(list)
    for n, (name, etype, off, length, impact, scope) in enumerate(cat.EVENTS, start=1):
        s_d = start + timedelta(days=off)
        e_d = min(s_d + timedelta(days=length - 1), end)
        if s_d > end:
            continue
        events.append((n, name, etype, s_d, e_d, impact))
        blocks = None
        if scope == "SECTOR":
            zone_events.append((sector_id, n))
        else:
            blocks = tuple(scope)
            zone_events.extend((block_ids[b], n) for b in scope)
        d = s_d
        while d <= e_d:
            day_events[d].append((etype, blocks))
            d += timedelta(days=1)

    # ---------------------------------------------------------------- id counters and row buckets
    sessions, batches, consumptions = [], [], []
    waste, listings, claims = [], [], []
    session_id, batch_id, waste_id, listing_id, claim_id = Counter(), Counter(), Counter(), Counter(), Counter()
    demand = defaultdict(lambda: defaultdict(float))  # (estab, food) -> day -> kg/unit needed

    def add_waste(estab, food, sess, lot, reason_code, route_name, stage, qty, edible, occurred, notes=None, doc=None, recorded=None):
        w = waste_id.next()
        waste.append((w, estab, food, sess, lot, reason[reason_code], route[route_name], stage, rnd(qty), edible,
                      None, None, notes, occurred, recorded or at(occurred, time(23, 0)), doc))
        return w

    def note_for(code, prob):
        return rng.choice(cat.NOTE_TEMPLATES[code]) if code in cat.NOTE_TEMPLATES and rng.random() < prob else None

    def pick_route(options):
        r, acc = rng.random(), 0.0
        for name, p in options:
            acc += p
            if r <= acc:
                return name
        return options[-1][0]

    # ---------------------------------------------------------------- service simulation
    def schedule_claims(lst_id, estab, sess, food, offered, created, expires, outcome_rng_value):
        """Pick a historical outcome for a listing; returns (status, claimed_qty) and appends claims/waste."""
        v = outcome_rng_value
        recips = rng.sample(cooked_recipients, 2)

        def claim(rid, qty, status):
            c = claim_id.next()
            req = created + timedelta(minutes=rng.randint(5, 45))
            col = req + timedelta(minutes=rng.randint(30, 120)) if status == "COLLECTED" else None
            claims.append((c, lst_id, rid, rnd(qty), None, status, req, col))
            if status == "COLLECTED":
                add_waste(estab, food, sess, None, "REDISTRIBUTED", "DONATION", "POST_CONSUMER_SERVICE", qty, True,
                          col.astimezone(IST).date(), recorded=col)
            return qty

        claimed, status = 0.0, "EXPIRED"
        if v < .30:
            claimed, status = claim(recips[0], offered, "COLLECTED"), "FULLY_CLAIMED"
        elif v < .34:
            claim(recips[0], offered, "NO_SHOW")
        elif v < .48:
            claimed = claim(recips[0], offered * rng.uniform(.35, .7), "COLLECTED")
        elif v < .76:
            if rng.random() < .1:
                claim(recips[0], offered, "REJECTED")
        elif v < .80:
            status = "CANCELLED"
        else:
            q1 = rnd(offered * rng.uniform(.3, .6))
            claimed = claim(recips[0], q1, "COLLECTED") + claim(recips[1], rnd(offered - q1), "COLLECTED")
            status = "FULLY_CLAIMED"
        claimed = rnd(claimed)
        if status == "FULLY_CLAIMED":
            claimed = rnd(offered)
        leftover = offered - claimed
        if leftover > 0.05 and expires.astimezone(IST).date() <= end:
            add_waste(estab, food, sess, None, "OVER_PREPARATION", pick_route([("COMPOST", .5), ("LANDFILL", .35), ("BIOGAS", .15)]),
                      "POST_CONSUMER_SERVICE", leftover, True, expires.astimezone(IST).date(),
                      notes="Surplus listing expired without being collected.", recorded=expires)
        return status, claimed

    for ei in non_res_ids:
        info = estab_info[ei]
        c = info["category"]
        cfg = CAT_CFG[c]
        overprep = info["extra"].get("overprep", cfg["overprep"])
        d = start
        while d <= end:
            dow = d.weekday()
            for slot, per_unit in cfg["slots"].items():
                if not slot_active(c, slot, dow):
                    continue
                mult, plate_mult = event_effect(c, info["kind"], day_events.get(d, []), info["block"])
                if mult == 0:
                    continue
                expected = max(1, int(info["capacity"] * per_unit * dow_factor(c, slot, dow) * mult))
                ratio = max(.5, min(1.5, rng.gauss(1, .15)))
                if rng.random() < .02:
                    ratio = rng.uniform(.25, .5)  # planted anomaly: much lower turnout than expected
                actual = max(0, int(expected * ratio))
                kg_pd = KG_PER_DINER[slot]
                prepared_total = max(0.4, expected * kg_pd * overprep * max(.8, rng.gauss(1, .06)))
                actual_kg = actual * kg_pd
                elig = [n for n in dish_of[ei] if eligible(slot, n)]
                picked = rng.sample(elig, min(len(elig), rng.choice([2, 2, 3])))
                weights = [rng.uniform(.6, 1.4) for _ in picked]
                wsum = sum(weights)

                sid = session_id.next()
                slot_dt = at(d, SLOT_TIME[slot])
                closed_at = slot_dt + timedelta(hours=3)
                sessions.append((sid, ei, d, slot, expected, actual, True, closed_at))
                for dname, wt in zip(picked, weights):
                    share = wt / wsum
                    dish = dish_of[ei][dname]
                    _, _, portion_g, _, _ = cat.DISHES[dname]
                    prepared = rnd(max(.2, prepared_total * share))
                    served = rnd(min(prepared, actual_kg * share))
                    leftover = rnd(prepared - served)
                    plate = rnd(served * cfg["plate"] * rng.uniform(.7, 1.3) * plate_mult)
                    plate = min(plate, served)
                    portions = max(1, round(prepared * 1000 / portion_g))
                    cost = rnd(sum(q * portions * food_cost[f] for f, q in dish_ing_map[dish]), 2)
                    bid = batch_id.next()
                    batches.append((bid, sid, dish, prepared, portions, cost, slot_dt - timedelta(hours=3)))
                    consumptions.append((bid, served, leftover, plate, closed_at - timedelta(minutes=10), staff_of[ei]))
                    for f, q in dish_ing_map[dish]:
                        demand[(ei, f)][d] += q * portions
                    dish_food = food_id[dname]

                    if plate > 0.02:
                        add_waste(ei, dish_food, sid, None, "PLATE_LEFTOVER",
                                  pick_route([("COMPOST", .6), ("LANDFILL", .25), ("ANIMAL_FEED", .15)]),
                                  "POST_CONSUMER_PLATE", plate, False, d, recorded=closed_at)
                    remainder = leftover
                    if leftover >= 3.0 and c != "Hospital Kitchen" and rng.random() < .5:
                        offered = rnd(leftover * .85)
                        remainder = rnd(leftover - offered)
                        lid = listing_id.next()
                        _, veg, _, _, _ = cat.DISHES[dname]
                        ready = closed_at.astimezone(IST).strftime("%I:%M %p").lstrip("0")
                        desc = (f"{offered} kg cooked {dname}, {'vegetarian' if veg else 'non-vegetarian'}, "
                                f"freshly prepared and unserved, ready by {ready}, collect within 4 hours.")
                        created, expires = closed_at, closed_at + timedelta(hours=4)
                        status, claimed = schedule_claims(lid, ei, sid, dish_food, offered, created, expires, rng.random())
                        listings.append((lid, ei, dish_food, sid, desc, offered, claimed, True, veg, created, expires, status, created))
                    if remainder > 0.05:
                        code = "LOW_TURNOUT" if actual < expected * .85 else "OVER_PREPARATION"
                        add_waste(ei, dish_food, sid, None, code,
                                  pick_route([("COMPOST", .45), ("LANDFILL", .35), ("BIOGAS", .2)]),
                                  "POST_CONSUMER_SERVICE", remainder, True, d, notes=note_for(code, .3), recorded=closed_at)
                # preparation trimmings (pre-consumer, unavoidable)
                if rng.random() < .35:
                    veg_foods = [f for dn in picked for f, _ in dish_ing_map[dish_of[ei][dn]] if food_cat_of[f] == "Vegetables"]
                    if veg_foods:
                        add_waste(ei, rng.choice(veg_foods), sid, None, "TRIMMINGS_PEELS", "COMPOST", "PRE_CONSUMER_PREP",
                                  max(.1, prepared_total * rng.uniform(.03, .07)), False, d, recorded=slot_dt)
            d += timedelta(days=1)

    # open sessions "today" so Part 2 can demonstrate the open -> close workflow
    open_sessions = 0
    if end + timedelta(days=1) <= today:
        for ei in non_res_ids[:40]:
            info = estab_info[ei]
            if info["category"] not in ("Casual Dining", "College Mess", "Corporate Cafeteria", "Hostel Mess"):
                continue
            slot = "LUNCH" if "LUNCH" in CAT_CFG[info["category"]]["slots"] else "ALL_DAY"
            dow = (end + timedelta(days=1)).weekday()
            if not slot_active(info["category"], slot, dow):
                continue
            expected = max(1, int(info["capacity"] * CAT_CFG[info["category"]]["slots"][slot]))
            sid = session_id.next()
            sessions.append((sid, ei, end + timedelta(days=1), slot, expected, None, False, None))
            dname = rng.choice([n for n in dish_of[ei] if eligible(slot, n)])
            prepared = rnd(expected * KG_PER_DINER[slot] * .5)
            portions = max(1, round(prepared * 1000 / cat.DISHES[dname][2]))
            batches.append((batch_id.next(), sid, dish_of[ei][dname], prepared, portions, None, at(end + timedelta(days=1), time(10, 30))))
            open_sessions += 1

    # ---------------------------------------------------------------- procurement, lots, spoilage
    procurements, proc_lines, lots = [], [], []
    proc_id, line_id, lot_id = Counter(), Counter(), Counter()
    cycle_len = [3, 4]
    for ei in non_res_ids:
        foods_here = sorted({f for (e, f) in demand if e == ei})
        avg_daily = {f: sum(demand[(ei, f)].values()) / args.days for f in foods_here}
        # each establishment orders on its own rhythm: a short first cycle, then alternating 3/4-day cycles
        d, k = start, rng.randint(0, 1)
        first_cycle = rng.randint(1, 4)
        while d <= end:
            length = first_cycle if d == start else cycle_len[k % 2]
            k += 1
            by_supplier = defaultdict(list)
            for f in foods_here:
                need = sum(demand[(ei, f)].get(d + timedelta(days=j), avg_daily[f] if d + timedelta(days=j) > end else 0.0)
                           for j in range(length))
                if need * 1.08 <= 0.01:
                    continue
                grp = cat.CATEGORY_SUPPLIER_GROUP[food_cat_of[f]]
                by_supplier[rng.choice(sup_by_group[grp])].append((f, rnd(need * 1.08)))
            for sup, items in sorted(by_supplier.items()):
                pid = proc_id.next()
                received = at(d, time(6, 30)) + timedelta(minutes=rng.randint(0, 60))
                total = 0.0
                for f, qty in items:
                    unit_cost = rnd(food_cost[f] * rng.uniform(.9, 1.1), 2)
                    total += qty * unit_cost
                    lid_line = line_id.next()
                    life_h = shelf_hours[food_cat_of[f]]
                    expires = received + timedelta(hours=life_h)
                    proc_lines.append((lid_line, pid, f, qty, unit_cost, expires.date()))
                    age_days = (end - d).days + 1
                    remaining = qty * max(0.0, 1 - age_days / length)
                    cat_name = food_cat_of[f]
                    p = SPOIL_BASE.get(cat_name, .015)
                    if sup == greenacre_id and cat_name in PRODUCE:
                        p *= 3  # planted signal
                    if cat_name in PRODUCE and d.month in (6, 7, 8, 9):
                        p *= 1.8  # monsoon effect
                    lot = lot_id.next()
                    if rng.random() < p:
                        w_date = d + timedelta(days=rng.randint(1, 4))
                        w_qty = rnd(qty * rng.uniform(.06, .30))
                        if w_date <= end and w_qty > 0:
                            stage = "PRE_CONSUMER_SPOILAGE" if cat_name in (PRODUCE | {"Meat & Poultry", "Fish & Seafood", "Eggs"}) else "PRE_CONSUMER_EXPIRY"
                            code = "SPOILAGE" if stage == "PRE_CONSUMER_SPOILAGE" else "EXPIRED_UNUSED"
                            add_waste(ei, f, None, lot, code,
                                      "COMPOST" if cat_name in PRODUCE else pick_route([("LANDFILL", .6), ("BIOGAS", .4)]),
                                      stage, w_qty, False if stage == "PRE_CONSUMER_SPOILAGE" else True, w_date,
                                      notes=note_for(code, .8), recorded=at(w_date, time(9, 0)))
                            remaining = max(0.0, remaining - w_qty)
                    lots.append((lot, ei, f, lid_line, qty, rnd(min(remaining, qty)), unit_cost, received, expires))
                procurements.append((pid, ei, sup, f"INV-{ei}-{sup}-{pid}", received, rnd(total, 2), staff_of[ei]))
            d += timedelta(days=length)

    # ---------------------------------------------------------------- residential waste (direct logging)
    veg_rice, packaged = food_id["Steamed Rice"], food_id["Packaged Biscuits"]
    for ri in res_ids:
        info = estab_info[ri]
        occ, seg = info["occupants"], info["segregated"]
        d = start
        while d <= end:
            if rng.random() < .45:
                wk = 1.25 if d.weekday() >= 5 else 1.0
                for kind_, per, code, stage, edible, fid in (
                        ("peels", .06, "TRIMMINGS_PEELS", "PRE_CONSUMER_PREP", False, None),
                        ("cooked", .05, "OVER_PREPARATION", "POST_CONSUMER_SERVICE", True, veg_rice),
                        ("packaged", .01, "EXPIRED_UNUSED", "PRE_CONSUMER_EXPIRY", True, packaged)):
                    if kind_ != "peels" and rng.random() < .5:
                        continue
                    qty = max(.1, occ * per * wk * rng.uniform(.6, 1.4))
                    r_name = ("COMPOST" if seg or rng.random() < .15 else "LANDFILL") if kind_ != "packaged" else "LANDFILL"
                    add_waste(ri, fid, None, None, code, r_name, stage, qty, edible, d, notes=note_for(code, .1),
                              recorded=at(d, time(20, 0)))
            d += timedelta(days=1)

    # ---------------------------------------------------------------- live marketplace listings (anchored to "now")
    live_ests = [i for i in non_res_ids if estab_info[i]["category"] in ("Casual Dining", "Fine Dining", "Corporate Cafeteria", "Club House", "Hostel Mess", "College Mess")]
    live_n = 14
    for n in range(live_n):
        ei = rng.choice(live_ests)
        dname = rng.choice(list(dish_of[ei]))
        veg = cat.DISHES[dname][1]
        offered = rnd(rng.uniform(4, 25))
        created = now - timedelta(minutes=rng.randint(10, 90))
        expires = now + timedelta(minutes=rng.randint(90, 240))
        lid = listing_id.next()
        desc = (f"{offered} kg cooked {dname}, {'vegetarian' if veg else 'non-vegetarian'}, freshly prepared and unserved, "
                f"collect before {expires.astimezone(IST).strftime('%I:%M %p').lstrip('0')}.")
        claimed, status = 0.0, "OPEN"
        if n >= 9:  # three partially claimed, two fully claimed
            qty = offered if n >= 12 else rnd(offered * rng.uniform(.3, .6))
            status = "FULLY_CLAIMED" if n >= 12 else "PARTIALLY_CLAIMED"
            claimed = rnd(qty)
            c = claim_id.next()
            req = created + timedelta(minutes=rng.randint(5, 20))
            claims.append((c, lid, rng.choice(cooked_recipients), claimed, None, "APPROVED", req, None))
            add_waste(ei, food_id[dname], None, None, "REDISTRIBUTED", "DONATION", "POST_CONSUMER_SERVICE", claimed, True,
                      min(today, req.astimezone(IST).date()), recorded=req)
        elif n % 3 == 0:  # an unapproved request that does not hold stock
            c = claim_id.next()
            claims.append((c, lid, rng.choice(cooked_recipients), rnd(min(offered, 5.0)), None, "REQUESTED",
                           created + timedelta(minutes=rng.randint(5, 20)), None))
        listings.append((lid, ei, food_id[dname], None, desc, offered, claimed, True, veg, created, expires, status, created))

    # ---------------------------------------------------------------- MongoDB documents (+ SYNCED SQL rows)
    mongo_docs = build_mongo(rng, end, estab_info, non_res_ids, res_ids, dish_of, staff_of, food_id, add_waste)

    # ---------------------------------------------------------------- load PostgreSQL
    print("Loading PostgreSQL ...")
    cur = conn.cursor()
    cur.execute("""TRUNCATE zone, establishment, commercial_profile, institutional_profile, residential_profile,
                   recipient_org, app_user, supplier, food_item, dish, dish_ingredient, service_session,
                   preparation_batch, consumption_record, procurement, procurement_line, inventory_lot,
                   waste_event, surplus_listing, redistribution_claim, locality_event, zone_event, audit_log
                   RESTART IDENTITY CASCADE""")
    # Bulk-load switch: triggers T3 (stock ledger) and T4 (audit) must not re-apply the already-final history.
    cur.execute("SET LOCAL zonefood.bulk_load = 'on'")
    copy_rows(cur, "zone", "zone_id,parent_zone_id,zone_name,zone_level,pincode,centroid_lat,centroid_lng", zones)
    copy_rows(cur, "establishment", "establishment_id,zone_id,category_id,name,address_line,lat,lng,capacity,operational_since,is_active", estabs)
    copy_rows(cur, "commercial_profile", "establishment_id,cuisine_type,seating_capacity,avg_daily_covers,has_buffet,fssai_license", commercial)
    copy_rows(cur, "institutional_profile", "establishment_id,enrolled_strength,mess_type,serves_meals_per_day,academic_calendar_ref", institutional)
    copy_rows(cur, "residential_profile", "establishment_id,household_count,total_occupants,has_common_kitchen,segregation_compliant", residential)
    copy_rows(cur, "recipient_org", "recipient_id,zone_id,org_name,org_type,need_profile,daily_capacity_kg,accepts_cooked,pickup_window_start,pickup_window_end,contact_phone", recipients)
    copy_rows(cur, "app_user", "user_id,establishment_id,recipient_id,email,password_hash,full_name,role,phone,is_active", users)
    copy_rows(cur, "supplier", "supplier_id,name,zone_id,contact_phone,supplier_type", suppliers)
    copy_rows(cur, "food_item", "food_id,food_category_id,canonical_name,description,base_unit,avg_cost_per_unit,is_edible_as_is", foods)
    copy_rows(cur, "dish", "dish_id,establishment_id,dish_name,standard_portion_g,is_vegetarian", dishes)
    copy_rows(cur, "dish_ingredient", "dish_id,food_id,qty_per_portion", dish_ingredients)
    copy_rows(cur, "locality_event", "event_id,event_name,event_type,start_date,end_date,expected_impact", events)
    copy_rows(cur, "zone_event", "zone_id,event_id", zone_events)
    copy_rows(cur, "service_session", "session_id,establishment_id,service_date,slot,expected_headcount,actual_headcount,is_closed,closed_at", sessions)
    copy_rows(cur, "preparation_batch", "batch_id,session_id,dish_id,prepared_qty_kg,prepared_portions,prep_cost,prepared_at", batches)
    copy_rows(cur, "consumption_record", "batch_id,served_qty_kg,leftover_qty_kg,plate_waste_kg,recorded_at,recorded_by", consumptions)
    copy_rows(cur, "procurement", "procurement_id,establishment_id,supplier_id,invoice_no,received_at,total_cost,recorded_by", procurements)
    copy_rows(cur, "procurement_line", "line_id,procurement_id,food_id,quantity,unit_cost,expiry_date", proc_lines)
    copy_rows(cur, "inventory_lot", "lot_id,establishment_id,food_id,source_line_id,received_qty,remaining_qty,unit_cost,received_at,expires_at", lots)
    copy_rows(cur, "surplus_listing", "listing_id,establishment_id,food_id,session_id,description,offered_qty_kg,claimed_qty_kg,is_cooked,is_vegetarian,available_from,expires_at,status,created_at", listings)
    copy_rows(cur, "redistribution_claim", "claim_id,listing_id,recipient_id,claimed_qty_kg,match_score,status,requested_at,collected_at", claims)
    copy_rows(cur, "waste_event", "waste_id,establishment_id,food_id,session_id,lot_id,reason_id,route_id,stage,quantity_kg,was_edible,cost_estimate,co2e_estimate,notes,occurred_on,recorded_at,source_doc_id", waste)

    for table, col in [("zone", "zone_id"), ("establishment", "establishment_id"), ("recipient_org", "recipient_id"),
                       ("app_user", "user_id"), ("supplier", "supplier_id"), ("food_item", "food_id"), ("dish", "dish_id"),
                       ("locality_event", "event_id"), ("service_session", "session_id"), ("preparation_batch", "batch_id"),
                       ("procurement", "procurement_id"), ("procurement_line", "line_id"), ("inventory_lot", "lot_id"),
                       ("surplus_listing", "listing_id"), ("redistribution_claim", "claim_id"), ("waste_event", "waste_id")]:
        cur.execute(f"SELECT setval(pg_get_serial_sequence('{table}', '{col}'), (SELECT max({col}) FROM {table}))")
    conn.commit()
    cur.execute("REFRESH MATERIALIZED VIEW mv_zone_monthly")   # materialised in migration 015; rebuilt after the bulk load
    conn.commit()
    cur.execute("ANALYZE")
    conn.commit()
    print(f"  (open sessions created for the next day: {open_sessions})")

    # ---------------------------------------------------------------- load MongoDB
    if args.skip_mongo:
        return
    print("Loading MongoDB ...")
    db_name = mongo_db_name(args.mongo_db)
    mongo_init.init(db_name, drop=True)
    client = MongoClient(mongo_uri(), serverSelectionTimeoutMS=8000)
    mdb = client[db_name]
    # activity_stream needs real user ids
    mongo_docs["activity_stream"] = build_activity(rng, now, users)
    for name, docs in mongo_docs.items():
        if docs:
            mdb[name].insert_many(docs)
        print(f"  mongo {name:<20} {len(docs):>6} docs")
    client.close()


# ====================================================================== MongoDB document builders
def oid(ts: datetime, n: int) -> ObjectId:
    """Deterministic ObjectId: 4-byte timestamp + 8-byte counter."""
    return ObjectId(struct.pack(">I", int(ts.timestamp())) + n.to_bytes(8, "big"))


def build_mongo(rng, end, estab_info, non_res_ids, res_ids, dish_of, staff_of, food_id, add_waste):
    docs = {"waste_submissions": [], "inspection_reports": [], "bin_readings": [],
            "establishment_meta": [], "activity_stream": []}
    ctr = Counter()
    window = [end - timedelta(days=k) for k in range(20, -1, -1)]  # last 21 days

    def messy(name):
        return rng.choice(cat.MESSY_NAME_VARIANTS[name]) if name in cat.MESSY_NAME_VARIANTS and rng.random() < .75 else name

    def status_for(d, kind):
        age = (end - d).days
        if rng.random() < .05:
            return "FAILED"
        if age > 5 and kind in ("COMMERCIAL", "RESIDENTIAL") and rng.random() < .6:
            return "SYNCED"
        return "PENDING"

    def finish(doc, ei, d, kind, payload, submitted_by=None):
        submitted = at(d, time(22, 0)).astimezone(timezone.utc)
        status = status_for(d, kind)
        doc.update({"_id": oid(submitted, ctr.next()), "establishment_id": ei, "estab_kind": kind,
                    "service_date": d.isoformat(), "submitted_at": submitted, "sync_status": status, "payload": payload})
        if submitted_by:
            doc["submitted_by"] = submitted_by
        if status == "FAILED":
            doc["sync_error"] = rng.choice(["Unresolved food name: no match above similarity threshold",
                                            "Quantity is not a positive number", "Unknown dish in establishment menu"])
            doc["sync_attempts"] = rng.randint(1, 3)
        docs["waste_submissions"].append(doc)
        return doc

    for d in window:
        for ei in non_res_ids:
            info = estab_info[ei]
            kind, c = info["kind"], info["category"]
            if rng.random() > (.6 if kind == "COMMERCIAL" else .45):
                continue
            if kind == "COMMERCIAL":
                items = []
                for dn in rng.sample(list(dish_of[ei]), min(len(dish_of[ei]), rng.randint(2, 4))):
                    prepared = rng.randint(20, 90)
                    sold = int(prepared * rng.uniform(.6, .98))
                    item = {"dish_name": messy(dn), "portions_prepared": prepared, "portions_sold": sold,
                            "returned_plates": rng.randint(0, max(1, sold // 6)), "avg_plate_leftover_g": rng.randint(20, 120)}
                    if rng.random() < .3:
                        item["reason_text"] = rng.choice(["party cancelled at 8pm", "rain in the evening", "chef made extra batch"])
                    item["_canonical"] = dn
                    items.append(item)
                payload = {"slot": rng.choice(["LUNCH", "DINNER"]), "covers_served": rng.randint(40, 220),
                           "dish_waste": [{k: v for k, v in it.items() if k != "_canonical"} for it in items]}
                if info["extra"].get("buffet"):
                    payload["buffet_counter_leftovers_kg"] = rnd(rng.uniform(1.5, 9), 1)
                if rng.random() < .25:
                    payload["raw_spoilage"] = [{"item": rng.choice(["tomatoes", "spinach", "paneer"]),
                                                "kg": rnd(rng.uniform(.5, 4), 1), "cause": rng.choice(["fungal, monsoon humidity", "fridge fault"])}]
                doc = finish({}, ei, d, kind, payload, staff_of[ei])
                if doc["sync_status"] == "SYNCED":
                    ids = []
                    for it in items:
                        ids.append(add_waste(ei, food_id[it["_canonical"]], None, None, "PLATE_LEFTOVER", "COMPOST",
                                             "POST_CONSUMER_PLATE", max(.05, it["returned_plates"] * it["avg_plate_leftover_g"] / 1000),
                                             False, d, doc=str(doc["_id"]), recorded=doc["submitted_at"] + timedelta(minutes=10)))
                    doc["sql_waste_ids"] = ids
                    doc["synced_at"] = doc["submitted_at"] + timedelta(minutes=10)
            elif c in ("College Mess", "School Canteen", "Hostel Mess"):
                payload = {"meal_slot": rng.choice(["LUNCH", "DINNER"]),
                           "headcount": {"present": int(info["capacity"] * rng.uniform(.5, .9)), "guests": rng.randint(0, 20)},
                           "counters": [{"counter": f"Counter {n + 1}", "plates_served": rng.randint(150, 700),
                                         "leftover_kg": rnd(rng.uniform(1, 12), 1)} for n in range(rng.randint(2, 4))]}
                if rng.random() < .3:
                    payload["exam_day"] = True
                finish({}, ei, d, kind, payload, staff_of[ei])
            elif kind == "RETAIL_FOOD":
                payload = {"skus": [{"barcode": f"89{rng.randint(10**10, 10**11 - 1)}", "sku_name": rng.choice(["Sandwich 2-pack", "Fresh Salad Bowl", "Curd 400g", "Bread Loaf"]),
                                     "markdown_pct": rng.choice([0, 20, 30, 50]), "units_expiring": rng.randint(1, 15),
                                     "units_discarded": rng.randint(0, 6)} for _ in range(rng.randint(2, 5))]}
                if rng.random() < .5:
                    payload["chiller_temp_c"] = rnd(rng.uniform(2, 8), 1)
                finish({}, ei, d, kind, payload, staff_of[ei])
            elif kind == "ORGANIZATIONAL":
                finish({}, ei, d, kind, {"coupons_redeemed": rng.randint(200, 900), "tray_returns_kg": rnd(rng.uniform(5, 40), 1),
                                         "feedback_note": rng.choice(["salads untouched", "queue too long, people left", "good turnout"])},
                       staff_of[ei])
            elif kind == "HEALTHCARE":
                finish({}, ei, d, kind, {"ward_meals": [{"ward": w, "meals_sent": rng.randint(15, 40), "meals_returned": rng.randint(0, 8)}
                                                         for w in rng.sample(["General", "ICU", "Maternity", "Paediatrics", "Surgical"], 3)],
                                         "diet_types": {"normal": rng.randint(50, 120), "diabetic": rng.randint(5, 30), "liquid": rng.randint(0, 12)}},
                       staff_of[ei])
            else:  # RECREATIONAL
                finish({}, ei, d, kind, {"event_name": rng.choice(["Members dinner", "Anniversary buffet", "Weekend brunch"]),
                                         "buffet_leftover_kg": rnd(rng.uniform(2, 15), 1),
                                         "guests": rng.randint(40, 250)}, staff_of[ei])
        for ri in res_ids:
            if rng.random() > .55:
                continue
            occ = estab_info[ri]["occupants"]
            bins = {"vegetable_peels_kg": rnd(occ * .06 * rng.uniform(.6, 1.4), 1)}
            if rng.random() < .7:
                bins["cooked_leftovers_kg"] = rnd(occ * .05 * rng.uniform(.4, 1.4), 1)
            if rng.random() < .35:
                bins["expired_packaged_kg"] = rnd(occ * .01 * rng.uniform(.5, 2), 1)
            payload = {"bins": bins, "segregated": estab_info[ri]["segregated"], "occupants_present": rng.randint(max(1, occ // 2), occ)}
            if rng.random() < .3:
                payload["photo_url"] = f"synthetic://bin-photos/{ri}-{d.isoformat()}.jpg"
            if rng.random() < .4:
                payload["free_text"] = rng.choice(["cooked extra rice for guests who didn't come", "festival leftovers", "fridge cleanout",
                                                   "sambar went sour in the heat", "bought too many vegetables"])
            doc = finish({}, ri, d, "RESIDENTIAL", payload)
            if doc["sync_status"] == "SYNCED":
                ids, rec = [], doc["submitted_at"] + timedelta(minutes=10)
                seg = payload["segregated"]
                for key, code, stage, edible, fid in (("vegetable_peels_kg", "TRIMMINGS_PEELS", "PRE_CONSUMER_PREP", False, None),
                                                      ("cooked_leftovers_kg", "OVER_PREPARATION", "POST_CONSUMER_SERVICE", True, food_id["Steamed Rice"]),
                                                      ("expired_packaged_kg", "EXPIRED_UNUSED", "PRE_CONSUMER_EXPIRY", True, food_id["Packaged Biscuits"])):
                    if bins.get(key, 0) > 0:
                        ids.append(add_waste(ri, fid, None, None, code, "COMPOST" if seg and key != "expired_packaged_kg" else "LANDFILL",
                                             stage, bins[key], edible, d, doc=str(doc["_id"]), recorded=rec))
                if ids:
                    doc["sql_waste_ids"], doc["synced_at"] = ids, rec
                else:
                    doc["sync_status"] = "PENDING"

    # inspection reports: two checklist templates (the structure changes between audit rounds)
    for ei in rng.sample(non_res_ids, 20):
        for rnd_no in range(rng.randint(1, 2)):
            when = datetime.combine(end - timedelta(days=rng.randint(5, 120)), time(11, 0), tzinfo=IST).astimezone(timezone.utc)
            sections = [{"name": "Kitchen hygiene", "items": [{"item": i, "status": rng.choice(["PASS", "PASS", "PASS", "FAIL"])}
                                                              for i in ("Handwash station stocked", "Surfaces sanitised", "Pest control record")]},
                        {"name": "Storage", "items": [{"item": "FIFO rotation followed", "status": rng.choice(["PASS", "FAIL"]),
                                                       "note": "older stock found behind new" if rng.random() < .3 else None}]}]
            if rnd_no == 1 or rng.random() < .5:  # later template adds sections
                sections.append({"name": "Waste segregation", "items": [{"item": "Separate wet/dry bins", "status": rng.choice(["PASS", "FAIL", "NA"])}]})
                sections.append({"name": "Cold chain", "items": [{"item": "Fridge temperature logged", "status": rng.choice(["PASS", "FAIL"]),
                                                                  "reading_c": rnd(rng.uniform(1, 9), 1)}]})
            doc = {"_id": oid(when, ctr.next()), "establishment_id": ei, "inspected_at": when,
                   "template_version": "v2" if len(sections) > 2 else "v1", "sections": sections,
                   "inspector_notes": rng.choice(["Generally well kept.", "Needs better segregation of food waste.", "Cold storage log incomplete."])}
            if rng.random() < .4:
                doc["photos"] = [f"synthetic://inspections/{ei}-{n}.jpg" for n in range(rng.randint(1, 3))]
            docs["inspection_reports"].append(doc)

    # smart-bin time series (hourly for 7 days, 3 establishments x 2 bins)
    base = datetime.combine(end - timedelta(days=6), time(0, 0), tzinfo=IST).astimezone(timezone.utc)
    for ei in non_res_ids[16:19]:
        for b in (1, 2):
            level = 0.0
            for h in range(7 * 24):
                level = level + rng.uniform(.4, 2.2) if level < 40 else rng.uniform(0, 3)  # emptied when full
                docs["bin_readings"].append({"ts": base + timedelta(hours=h),
                                             "meta": {"bin_id": f"BIN-{ei}-{b}", "establishment_id": ei, "stream": "wet-waste"},
                                             "weight_kg": rnd(level, 2), "fill_pct": rnd(min(100, level / 45 * 100), 1)})

    # flexible establishment metadata: attributes differ by kind
    for ei, info in estab_info.items():
        meta = {"establishment_id": ei, "tags": [], "updated_at": datetime(end.year, end.month, end.day, tzinfo=timezone.utc)}
        kind = info["kind"]
        if kind in ("COMMERCIAL", "RECREATIONAL", "RETAIL_FOOD"):
            meta["operating_hours"] = {day: {"open": "09:00", "close": rng.choice(["22:00", "23:00", "23:30"])}
                                       for day in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")}
            meta["tags"] = rng.sample(["buffet", "takeaway", "delivery", "late-night", "family", "pure-veg"], 3)
            if rng.random() < .3:
                meta["seasonal_notes"] = "Busier in festival weeks; reduced stock in monsoon."
        elif kind == "RESIDENTIAL":
            meta.update({"garbage_pickup_days": rng.sample(["mon", "tue", "wed", "thu", "fri", "sat"], 2),
                         "composting_facility": info["segregated"], "committee_contact": "synthetic-contact"})
        else:
            meta.update({"academic_terms": ["Term 1", "Term 2"] if info["category"] in EDU else None,
                         "shift_pattern": rng.choice(["single", "double"]), "tags": ["institutional"]})
            meta = {k: v for k, v in meta.items() if v is not None}
        docs["establishment_meta"].append(meta)
    return docs


def build_activity(rng, now, users):
    ev, docs = ["LOGIN", "VIEW_DASHBOARD", "LOG_WASTE", "CREATE_LISTING", "CLAIM_LISTING", "EXPORT_REPORT"], []
    staff = [u[0] for u in users]
    for n in range(300):
        e = rng.choice(ev)
        doc = {"user_id": rng.choice(staff), "ts": now - timedelta(minutes=n * 7 + rng.randint(0, 6)), "event": e}
        if e == "LOG_WASTE":
            doc["details"] = {"quantity_kg": rnd(rng.uniform(.2, 12), 1), "source": "form"}
        elif e == "CLAIM_LISTING":
            doc["details"] = {"listing_id": rng.randint(1, 500), "qty_kg": rnd(rng.uniform(2, 15), 1)}
        elif e == "EXPORT_REPORT":
            doc["details"] = {"format": rng.choice(["csv", "pdf"]), "range_days": rng.choice([7, 30, 90])}
        docs.append(doc)
    return docs


if __name__ == "__main__":
    main()
