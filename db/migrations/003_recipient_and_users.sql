-- 003: recipient organisations and application users.
-- recipient_org is created here (before app_user) so app_user can reference it directly,
-- instead of the PDF's "add the FK later with ALTER TABLE" step.
CREATE TABLE recipient_org (
  recipient_id        SERIAL PRIMARY KEY,
  zone_id             INT NOT NULL REFERENCES zone(zone_id),
  org_name            VARCHAR(150) NOT NULL UNIQUE,
  -- PDF text is clipped after 'COMPOST_UN'; COMPOST_UNIT is the documented completion.
  org_type            VARCHAR(40) CHECK (org_type IN
                        ('NGO','SHELTER','COMMUNITY_FRIDGE','ANIMAL_SHELTER','COMPOST_UNIT')),
  need_profile        TEXT NOT NULL,                 -- free text: what they need, when, capacity
  need_embedding      vector(384),                   -- pgvector: surplus<->need matching (filled in Part 2)
  daily_capacity_kg   NUMERIC(8,2) NOT NULL CHECK (daily_capacity_kg > 0),
  accepts_cooked      BOOLEAN NOT NULL DEFAULT TRUE,
  pickup_window_start TIME,
  pickup_window_end   TIME,
  contact_phone       VARCHAR(15),
  CONSTRAINT ck_pickup_window CHECK (pickup_window_end > pickup_window_start)
);

CREATE TABLE app_user (
  user_id          SERIAL PRIMARY KEY,
  establishment_id INT REFERENCES establishment(establishment_id) ON DELETE SET NULL,
  recipient_id     INT REFERENCES recipient_org(recipient_id) ON DELETE SET NULL,
  email            VARCHAR(150) NOT NULL UNIQUE,
  password_hash    VARCHAR(255) NOT NULL,            -- bcrypt hash only; never plaintext
  full_name        VARCHAR(120) NOT NULL,
  role             user_role NOT NULL,
  phone            VARCHAR(15) CHECK (phone ~ '^[0-9]{10}$'),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- role/tenant coherence is enforced in the database, not only in application code
  CONSTRAINT ck_user_scope CHECK (
       (role IN ('ESTAB_MANAGER','ESTAB_STAFF') AND establishment_id IS NOT NULL AND recipient_id IS NULL)
    OR (role = 'RECIPIENT_AGENT'                AND recipient_id IS NOT NULL     AND establishment_id IS NULL)
    OR (role IN ('ZONE_ADMIN','AUDITOR')        AND establishment_id IS NULL     AND recipient_id IS NULL)
  )
);
