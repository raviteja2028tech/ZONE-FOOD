-- 010: lookup / reference rows the schema needs in order to function (idempotent).
-- Emission factors are ILLUSTRATIVE SYNTHETIC values for demonstration, not authoritative LCA figures.

INSERT INTO establishment_category (kind, category_name, capacity_metric) VALUES
  ('COMMERCIAL',     'Fine Dining',          'seats'),
  ('COMMERCIAL',     'Casual Dining',        'seats'),
  ('COMMERCIAL',     'Cafe & Bakery',        'seats'),
  ('COMMERCIAL',     'Quick Service',        'seats'),
  ('EDUCATIONAL',    'College Mess',         'students'),
  ('EDUCATIONAL',    'School Canteen',       'students'),
  ('EDUCATIONAL',    'Hostel Mess',          'students'),
  ('ORGANIZATIONAL', 'Corporate Cafeteria',  'employees'),
  ('RESIDENTIAL',    'Apartment Block',      'residents'),
  ('RESIDENTIAL',    'Independent Houses',   'residents'),
  ('RECREATIONAL',   'Club House',           'members'),
  ('RETAIL_FOOD',    'Supermarket',          'daily customers'),
  ('HEALTHCARE',     'Hospital Kitchen',     'beds')
ON CONFLICT (category_name) DO NOTHING;

INSERT INTO food_category (category_name, is_perishable, default_shelf_life_hours) VALUES
  ('Cereals & Grains',         FALSE, 4320),
  ('Pulses & Legumes',         FALSE, 4320),
  ('Cooked Rice Dishes',       TRUE,  6),
  ('Cooked Curries & Gravies', TRUE,  8),
  ('Breads & Bakery',          TRUE,  48),
  ('Dairy',                    TRUE,  96),
  ('Vegetables',               TRUE,  120),
  ('Fruits',                   TRUE,  120),
  ('Meat & Poultry',           TRUE,  48),
  ('Fish & Seafood',           TRUE,  36),
  ('Eggs',                     TRUE,  336),
  ('Packaged & Processed',     FALSE, 2160),
  ('Beverages',                TRUE,  720),
  ('Oils & Condiments',        FALSE, 4320),
  ('Snacks & Sweets',          TRUE,  72)
ON CONFLICT (category_name) DO NOTHING;

INSERT INTO emission_factor (food_category_id, kg_co2e_per_kg, litres_water_per_kg, source_citation)
SELECT fc.food_category_id, v.co2e, v.water, 'Illustrative synthetic value (demo data, not an authoritative LCA figure)'
FROM (VALUES
  ('Cereals & Grains',         1.40,  1600.00),
  ('Pulses & Legumes',         0.90,  4000.00),
  ('Cooked Rice Dishes',       2.20,  1800.00),
  ('Cooked Curries & Gravies', 2.60,  1500.00),
  ('Breads & Bakery',          1.30,  1300.00),
  ('Dairy',                    3.20,  1000.00),
  ('Vegetables',               0.50,   300.00),
  ('Fruits',                   0.70,   900.00),
  ('Meat & Poultry',           9.50,  4300.00),
  ('Fish & Seafood',           5.10,  2000.00),
  ('Eggs',                     4.50,  3300.00),
  ('Packaged & Processed',     2.80,  1200.00),
  ('Beverages',                1.10,   500.00),
  ('Oils & Condiments',        3.00,  2500.00),
  ('Snacks & Sweets',          2.40,  1400.00)
) AS v(cat, co2e, water)
JOIN food_category fc ON fc.category_name = v.cat
ON CONFLICT (food_category_id) DO NOTHING;

INSERT INTO waste_reason (reason_code, description, is_preventable) VALUES
  ('OVER_PREPARATION',  'More food prepared than was needed for the session',        TRUE),
  ('LOW_TURNOUT',       'Fewer diners than expected',                                TRUE),
  ('SPOILAGE',          'Food went bad in storage before use',                       TRUE),
  ('EXPIRED_UNUSED',    'Stock passed its expiry date unused',                       TRUE),
  ('PLATE_LEFTOVER',    'Food left on diners'' plates',                              TRUE),
  ('PREPARATION_ERROR', 'Dish spoiled or discarded due to a cooking error',          TRUE),
  ('QUALITY_REJECTION', 'Rejected on receipt or before service for quality',         TRUE),
  ('STORAGE_FAILURE',   'Refrigeration or storage fault',                            TRUE),
  ('TRIMMINGS_PEELS',   'Peels, bones and trimmings that are unavoidable',           FALSE),
  ('REDISTRIBUTED',     'Edible surplus handed over for redistribution',             FALSE)
ON CONFLICT (reason_code) DO NOTHING;

INSERT INTO disposal_route (route_name, is_diversion, cost_per_kg) VALUES
  ('LANDFILL',    FALSE, 3.50),
  ('COMPOST',     TRUE,  0.50),
  ('BIOGAS',      TRUE,  0.80),
  ('ANIMAL_FEED', TRUE,  0.00),
  ('DONATION',    TRUE,  0.00)
ON CONFLICT (route_name) DO NOTHING;
