-- 002: locality hierarchy, establishments and their disjoint subtype profiles.
CREATE TABLE zone (
  zone_id        SERIAL PRIMARY KEY,
  parent_zone_id INT REFERENCES zone(zone_id) ON DELETE RESTRICT,
  zone_name      VARCHAR(120) NOT NULL,
  zone_level     SMALLINT NOT NULL CHECK (zone_level BETWEEN 1 AND 4),  -- 1=sector 4=street
  pincode        CHAR(6),
  centroid_lat   NUMERIC(9,6),
  centroid_lng   NUMERIC(9,6),
  CONSTRAINT uq_zone_name_parent UNIQUE (zone_name, parent_zone_id),
  CONSTRAINT ck_zone_not_self    CHECK (zone_id <> parent_zone_id)
);
-- UNIQUE(zone_name, parent_zone_id) does not stop duplicate roots (NULL parents are distinct).
CREATE UNIQUE INDEX uq_zone_root_name ON zone (zone_name) WHERE parent_zone_id IS NULL;

CREATE TABLE establishment_category (
  category_id     SERIAL PRIMARY KEY,
  kind            establishment_kind NOT NULL,
  category_name   VARCHAR(80) NOT NULL UNIQUE,
  capacity_metric VARCHAR(30) NOT NULL       -- 'seats' | 'students' | 'residents' ...
);

CREATE TABLE establishment (
  establishment_id  SERIAL PRIMARY KEY,
  zone_id           INT NOT NULL REFERENCES zone(zone_id) ON DELETE RESTRICT,
  category_id       INT NOT NULL REFERENCES establishment_category(category_id),
  name              VARCHAR(150) NOT NULL,
  address_line      VARCHAR(255),
  lat               NUMERIC(9,6),
  lng               NUMERIC(9,6),
  capacity          INT NOT NULL CHECK (capacity > 0),
  operational_since DATE NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_estab_name_zone UNIQUE (name, zone_id),
  CONSTRAINT ck_estab_since     CHECK (operational_since <= CURRENT_DATE)
);

-- Disjoint specialisation: the subtype PK is also the FK to the supertype.
CREATE TABLE commercial_profile (
  establishment_id INT PRIMARY KEY REFERENCES establishment(establishment_id) ON DELETE CASCADE,
  cuisine_type     VARCHAR(60),
  seating_capacity INT CHECK (seating_capacity >= 0),
  avg_daily_covers INT CHECK (avg_daily_covers >= 0),
  has_buffet       BOOLEAN NOT NULL DEFAULT FALSE,
  fssai_license    VARCHAR(20) UNIQUE
);

CREATE TABLE institutional_profile (
  establishment_id      INT PRIMARY KEY REFERENCES establishment(establishment_id) ON DELETE CASCADE,
  enrolled_strength     INT NOT NULL CHECK (enrolled_strength > 0),
  mess_type             VARCHAR(30) CHECK (mess_type IN ('VEG','NON_VEG','MIXED')),
  serves_meals_per_day  SMALLINT NOT NULL CHECK (serves_meals_per_day BETWEEN 1 AND 5),
  academic_calendar_ref VARCHAR(60)
);

CREATE TABLE residential_profile (
  establishment_id      INT PRIMARY KEY REFERENCES establishment(establishment_id) ON DELETE CASCADE,
  household_count       INT NOT NULL CHECK (household_count > 0),
  total_occupants       INT NOT NULL CHECK (total_occupants > 0),
  has_common_kitchen    BOOLEAN NOT NULL DEFAULT FALSE,
  segregation_compliant BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT ck_occupants_ge_households CHECK (total_occupants >= household_count)
);
