# MongoDB design

_Generated 2026-11-01 17:24 from the live database `zonefood` (MongoDB 7.0.45) - the example documents below are real rows, not invented samples._

## Why MongoDB here, and why not for everything

PostgreSQL is the **system of record** for everything relational: establishments, stock lots, waste events, claims. MongoDB holds the data whose *shape varies by who produced it* or that is an append-only log. If every document had the same fields, MongoDB would add nothing - so the collections below are deliberately heterogeneous.

| Collection | Kind | Documents | Why it is a document, not a table |
|---|---|---|---|
| `waste_submissions` | ordinary + $jsonSchema validator | 658 | A restaurant reports dishes and plates, a household reports bins, a hospital reports wards, a retailer reports SKUs. One relational table would need dozens of sparse columns; documents keep each natu… |
| `inspection_reports` | ordinary + validator | 28 | Checklist sections and items change between audit rounds (template v1 vs v2) and may carry readings, notes or photos. |
| `bin_readings` | time-series | 1008 | High-frequency sensor-style readings; native time-series storage and compression. |
| `establishment_meta` | ordinary, unique index | 56 | Arbitrary per-kind attributes that do not deserve columns. |
| `activity_stream` | capped (5 MB / 5000 docs) | 342 | Append-only application events (login, claim, listing...); the capped collection discards the oldest automatically. |

## Source of truth and synchronisation

| Data | Source of truth | Flow |
|---|---|---|
| Field-log submission | MongoDB while `sync_status = PENDING/FAILED` | ETL (`/etl` page, `POST /api/etl/sync`) validates, resolves food names, writes `waste_event` rows in ONE PostgreSQL transaction, then marks the document `SYNCED` with `sql_waste_ids` |
| Imported waste rows | PostgreSQL | rows carry `source_doc_id` (the Mongo `_id`) = lineage + idempotency key |
| Inspection reports, activity stream | MongoDB | read directly by the app |

**Failure and retry:** a bad document becomes `FAILED` with a safe `sync_error` and `sync_attempts`; it can be retried singly or in bulk (max 5). A crash between the PostgreSQL COMMIT and the Mongo update is repaired on the next run, because the ETL first looks for rows with that `source_doc_id` and then only completes the bookkeeping - no duplicates. Overlapping runs cannot process the same document (atomic `findOneAndUpdate` lease in `sync_lock`).

## Real example documents - different shapes in the SAME collection

### `waste_submissions` - COMMERCIAL

```json
{
  "_id": "6ae718433e976d3428dc6ae1",
  "establishment_id": 1,
  "estab_kind": "COMMERCIAL",
  "service_date": "2026-11-01",
  "submitted_at": "2026-11-01 10:45:23.871000",
  "sync_status": "PENDING",
  "payload": {
    "slot": "LUNCH",
    "dish_waste": [
      {
        "dish_name": "Panner Butter Masala",
        "returned_plates": 8,
        "avg_plate_leftover_g": 90
      },
      {
        "dish_name": "VEG. BIRYANI",
        "returned_plates": 4,
        "avg_plate_leftover_g": 110
      }
    ]
  }
}
```

### `waste_submissions` - EDUCATIONAL

```json
{
  "_id": "6ae4c608000000000000027a",
  "establishment_id": 18,
  "estab_kind": "EDUCATIONAL",
  "service_date": "2026-10-30",
  "submitted_at": "2026-10-30 16:30:00",
  "sync_status": "SYNCED",
  "payload": {
    "meal_slot": "DINNER",
    "headcount": {
      "present": 1033,
      "guests": 14
    },
    "counters": [
      {
        "counter": "Counter 1",
        "plates_served": 552,
        "leftover_kg": 10.0
      },
      {
        "counter": "Counter 2",
        "plates_served": 235,
        "leftover_kg": 7.4
      }
    ]
  }
}
```

### `waste_submissions` - RETAIL_FOOD

```json
{
  "_id": "6ae4c6080000000000000281",
  "establishment_id": 29,
  "estab_kind": "RETAIL_FOOD",
  "service_date": "2026-10-30",
  "submitted_at": "2026-10-30 16:30:00",
  "sync_status": "PENDING",
  "payload": {
    "skus": [
      {
        "barcode": "8942316114112",
        "sku_name": "Bread Loaf",
        "markdown_pct": 20,
        "units_expiring": 8,
        "units_discarded": 3
      },
      {
        "barcode": "8996823752288",
        "sku_name": "Bread Loaf",
        "markdown_pct": 30,
        "units_expiring": 3,
        "units_discarded": 6
      }
    ]
  }
}
```

### `waste_submissions` - RESIDENTIAL

```json
{
  "_id": "6ae4c6080000000000000283",
  "establishment_id": 34,
  "estab_kind": "RESIDENTIAL",
  "service_date": "2026-10-30",
  "submitted_at": "2026-10-30 16:30:00",
  "sync_status": "PENDING",
  "payload": {
    "bins": {
      "vegetable_peels_kg": 12.4,
      "expired_packaged_kg": 1.0
    },
    "segregated": false,
    "occupants_present": 148,
    "photo_url": "synthetic://bin-photos/34-2026-10-30.jpg"
  }
}
```

### `waste_submissions` - HEALTHCARE

```json
{
  "_id": "6ae374880000000000000261",
  "establishment_id": 28,
  "estab_kind": "HEALTHCARE",
  "service_date": "2026-10-29",
  "submitted_at": "2026-10-29 16:30:00",
  "sync_status": "SYNCED",
  "payload": {
    "ward_meals": [
      {
        "ward": "Paediatrics",
        "meals_sent": 17,
        "meals_returned": 4
      },
      {
        "ward": "General",
        "meals_sent": 15,
        "meals_returned": 0
      },
      {
        "ward": "Surgical",
        "meals_sent": 17,
        "meals_returned": 8
      }
    ],
    "diet_types": {
      "normal": 116,
      "diabetic": 6,
      "liquid": 4
    }
  }
}
```

### `inspection_reports`

```json
{
  "_id": "6adaf0d800000000000002a4",
  "establishment_id": 18,
  "inspected_at": "2026-10-23 05:30:00",
  "template_version": "v2",
  "sections": [
    {
      "name": "Kitchen hygiene",
      "items": [
        {
          "item": "Handwash station stocked",
          "status": "PASS"
        },
        {
          "item": "Surfaces sanitised",
          "status": "PASS"
        },
        {
          "item": "Pest control record",
          "status": "PASS"
        }
      ]
    },
    {
      "name": "Storage",
      "items": [
        {
          "item": "FIFO rotation followed",
          "status": "PASS",
          "note": "older stock found behind new"
        }
      ]
    },
    {
      "name": "Waste segregation",
      "items": [
        {
          "item": "Separate wet/dry bins",
          "status": "FAIL"
        }
      ]
    },
    {
      "name": "Cold chain",
      "items": [
        {
          "item": "Fridge temperature logged",
          "status": "PASS",
          "reading_c": 8.2
        }
      ]
    }
  ],
  "inspector_notes": "Cold storage log incomplete.",
  "photos": [
    "synthetic://inspections/18-0.jpg",
    "synthetic://inspections/18-1.jpg"
  ]
}
```

### `activity_stream`

```json
{
  "_id": "6ae7253f7cf1186617ae04e8",
  "user_id": 1,
  "ts": "2026-11-01 11:40:47.662000",
  "event": "LOGIN",
  "details": {}
}
```

## Validation (`$jsonSchema`)

### `waste_submissions`

```json
{
  "$jsonSchema": {
    "bsonType": "object",
    "required": [
      "establishment_id",
      "estab_kind",
      "service_date",
      "submitted_at",
      "payload",
      "sync_status"
    ],
    "properties": {
      "establishment_id": {
        "bsonType": [
          "int",
          "long"
        ]
      },
      "estab_kind": {
        "enum": [
          "COMMERCIAL",
          "EDUCATIONAL",
          "ORGANIZATIONAL",
          "RESIDENTIAL",
          "RECREATIONAL",
          "RETAIL_FOOD",
          "HEALTHCARE"
        ]
      },
      "service_date": {
        "bsonType": "string",
        "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
      },
      "submitted_at": {
        "bsonType": "date"
      },
      "sync_status": {
        "enum": [
          "PENDING",
          "SYNCED",
          "FAILED"
        ]
      },
      "sql_waste_ids": {
        "bsonType": "array",
        "items": {
          "bsonType": [
            "int",
            "long"
          ]
        }
      },
      "payload": {
        "bsonType": "object"
      }
    }
  }
}
```

Only the fields every document shares are validated; `payload` stays free-form - that is the point.

### `inspection_reports`

```json
{
  "$jsonSchema": {
    "bsonType": "object",
    "required": [
      "establishment_id",
      "inspected_at",
      "sections"
    ],
    "properties": {
      "establishment_id": {
        "bsonType": [
          "int",
          "long"
        ]
      },
      "inspected_at": {
        "bsonType": "date"
      },
      "sections": {
        "bsonType": "array",
        "minItems": 1
      }
    }
  }
}
```

Only the fields every document shares are validated; `payload` stays free-form - that is the point.

## Indexes

**waste_submissions**: `_id_` [('_id', 1)], `idx_estab_date` [('establishment_id', 1), ('service_date', -1)], `idx_etl_queue` [('sync_status', 1), ('submitted_at', 1)], `idx_dish_name_multikey` [('payload.dish_waste.dish_name', 1)], `idx_free_text` [('_fts', 'text'), ('_ftsx', 1)]

**inspection_reports**: `_id_` [('_id', 1)], `idx_estab_inspected` [('establishment_id', 1), ('inspected_at', -1)]

**bin_readings**: `meta_1_ts_1` [('meta', 1), ('ts', 1)], `idx_bin_ts` [('meta.bin_id', 1), ('ts', -1)]

**establishment_meta**: `_id_` [('_id', 1)], `uq_estab` [('establishment_id', 1)]

**activity_stream**: `_id_` [('_id', 1)], `idx_user_ts` [('user_id', 1), ('ts', -1)]

The ETL queue index `(sync_status, submitted_at)` serves `find({sync_status:'PENDING'}).sort({submitted_at:1})` without a collection scan (verified with `explain()` in `tests/test_part1.py`).

## Aggregation pipeline (`$facet`: one round trip powers a whole status panel)

```js
db.waste_submissions.aggregate([
  {
    "$facet": {
      "by_status": [
        {
          "$group": {
            "_id": "$sync_status",
            "n": {
              "$sum": 1
            }
          }
        },
        {
          "$sort": {
            "_id": 1
          }
        }
      ],
      "by_kind": [
        {
          "$group": {
            "_id": "$estab_kind",
            "submissions": {
              "$sum": 1
            }
          }
        },
        {
          "$sort": {
            "submissions": -1
          }
        }
      ],
      "household_bins": [
        {
          "$match": {
            "estab_kind": "RESIDENTIAL"
          }
        },
        {
          "$group": {
            "_id": null,
            "peels_kg": {
              "$sum": "$payload.bins.vegetable_peels_kg"
            },
            "cooked_kg": {
              "$sum": "$payload.bins.cooked_leftovers_kg"
            },
            "packaged_kg": {
              "$sum": "$payload.bins.expired_packaged_kg"
            }
          }
        }
      ]
    }
  }
])
```

Result on the live database:

```json
{
  "by_status": [
    {
      "_id": "FAILED",
      "n": 34
    },
    {
      "_id": "PENDING",
      "n": 23
    },
    {
      "_id": "SYNCED",
      "n": 601
    }
  ],
  "by_kind": [
    {
      "_id": "RESIDENTIAL",
      "submissions": 269
    },
    {
      "_id": "COMMERCIAL",
      "submissions": 227
    },
    {
      "_id": "EDUCATIONAL",
      "submissions": 68
    },
    {
      "_id": "ORGANIZATIONAL",
      "submissions": 31
    },
    {
      "_id": "RETAIL_FOOD",
      "submissions": 23
    },
    {
      "_id": "HEALTHCARE",
      "submissions": 20
    },
    {
      "_id": "RECREATIONAL",
      "submissions": 20
    }
  ],
  "household_bins": [
    {
      "_id": null,
      "peels_kg": 2440.9,
      "cooked_kg": 1211.5,
      "packaged_kg": 164.7
    }
  ]
}
```
