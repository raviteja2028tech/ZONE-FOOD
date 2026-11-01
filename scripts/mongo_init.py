"""Create the MongoDB collections, validators and indexes (idempotent).

    python scripts/mongo_init.py [--db NAME] [--drop]

Design reference: docs/DATA_MODEL.md (MongoDB section) and Master Plan s6.
`--drop` removes the five ZoneFood collections first (used by the reset-and-seed flow).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import CollectionInvalid

sys.path.insert(0, str(Path(__file__).resolve().parent))
from db_config import mongo_db_name, mongo_uri  # noqa: E402

COLLECTIONS = ["waste_submissions", "inspection_reports", "bin_readings", "establishment_meta", "activity_stream"]

ESTAB_KINDS = ["COMMERCIAL", "EDUCATIONAL", "ORGANIZATIONAL", "RESIDENTIAL",
               "RECREATIONAL", "RETAIL_FOOD", "HEALTHCARE"]
INT_TYPES = ["int", "long"]

# Only the fields every submission shares are validated; `payload` stays free-form because its
# shape depends on the establishment kind. That is the whole reason this lives in MongoDB.
WASTE_SUBMISSIONS_VALIDATOR = {"$jsonSchema": {
    "bsonType": "object",
    "required": ["establishment_id", "estab_kind", "service_date", "submitted_at", "payload", "sync_status"],
    "properties": {
        "establishment_id": {"bsonType": INT_TYPES},
        "estab_kind": {"enum": ESTAB_KINDS},
        "service_date": {"bsonType": "string", "pattern": r"^\d{4}-\d{2}-\d{2}$"},
        "submitted_at": {"bsonType": "date"},
        "sync_status": {"enum": ["PENDING", "SYNCED", "FAILED"]},
        "sql_waste_ids": {"bsonType": "array", "items": {"bsonType": INT_TYPES}},
        "payload": {"bsonType": "object"},
    },
}}

INSPECTION_VALIDATOR = {"$jsonSchema": {
    "bsonType": "object",
    "required": ["establishment_id", "inspected_at", "sections"],
    "properties": {
        "establishment_id": {"bsonType": INT_TYPES},
        "inspected_at": {"bsonType": "date"},
        "sections": {"bsonType": "array", "minItems": 1},
    },
}}


def create(db, name: str, **kwargs):
    try:
        return db.create_collection(name, **kwargs)
    except CollectionInvalid:
        # already exists: keep data, refresh validator if one was supplied
        if "validator" in kwargs:
            db.command("collMod", name, validator=kwargs["validator"], validationLevel="strict")
        return db[name]


def init(db_name: str, drop: bool) -> None:
    client = MongoClient(mongo_uri(), serverSelectionTimeoutMS=8000)
    client.admin.command("ping")
    db = client[db_name]
    if drop:
        for name in COLLECTIONS:
            db.drop_collection(name)

    ws = create(db, "waste_submissions", validator=WASTE_SUBMISSIONS_VALIDATOR, validationLevel="strict")
    ws.create_index([("establishment_id", ASCENDING), ("service_date", DESCENDING)], name="idx_estab_date")
    ws.create_index([("sync_status", ASCENDING), ("submitted_at", ASCENDING)], name="idx_etl_queue")
    ws.create_index([("payload.dish_waste.dish_name", ASCENDING)], name="idx_dish_name_multikey")
    ws.create_index([("payload.free_text", "text")], name="idx_free_text")

    ir = create(db, "inspection_reports", validator=INSPECTION_VALIDATOR, validationLevel="strict")
    ir.create_index([("establishment_id", ASCENDING), ("inspected_at", DESCENDING)], name="idx_estab_inspected")

    # Time-series collection (native bucketing); cannot be altered in place, so create only if absent.
    if "bin_readings" not in db.list_collection_names():
        db.create_collection("bin_readings", timeseries={"timeField": "ts", "metaField": "meta", "granularity": "minutes"})
    db["bin_readings"].create_index([("meta.bin_id", ASCENDING), ("ts", DESCENDING)], name="idx_bin_ts")

    em = create(db, "establishment_meta")
    em.create_index([("establishment_id", ASCENDING)], unique=True, name="uq_estab")

    # Capped, insert-only event log. (TTL indexes are not supported on capped collections; the
    # size cap itself bounds retention.)
    if "activity_stream" not in db.list_collection_names():
        db.create_collection("activity_stream", capped=True, size=5 * 1024 * 1024, max=5000)
    db["activity_stream"].create_index([("user_id", ASCENDING), ("ts", DESCENDING)], name="idx_user_ts")

    print(f"MongoDB '{db_name}' ready: " + ", ".join(sorted(db.list_collection_names())))
    client.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db", help="database name (default: MONGO_DB from .env)")
    parser.add_argument("--drop", action="store_true", help="drop the ZoneFood collections first")
    args = parser.parse_args()
    init(mongo_db_name(args.db), args.drop)


if __name__ == "__main__":
    main()
