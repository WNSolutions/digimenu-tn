-- Spike #5 database: one fictional demo café with a 150-line menu (D-022: no real data).
-- Applied by the deploy repository's spike workflow with `wrangler d1 migrations apply`.

CREATE TABLE spike_cafes (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE spike_menu_items (
  id INTEGER PRIMARY KEY,
  cafe TEXT NOT NULL REFERENCES spike_cafes (slug),
  category TEXT NOT NULL,
  category_position INTEGER NOT NULL,
  position INTEGER NOT NULL,
  name_fr TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  desc_fr TEXT NOT NULL,
  desc_ar TEXT NOT NULL,
  desc_en TEXT NOT NULL,
  price_millimes INTEGER NOT NULL CHECK (price_millimes >= 0)
);

CREATE INDEX spike_menu_items_by_cafe ON spike_menu_items (cafe, category_position, position);

-- One row per POST /api/spike/db (D1 write test).
CREATE TABLE spike_hits (
  id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL
);

INSERT INTO spike_cafes (slug, name) VALUES ('demo', 'Café Démo');

-- 150 items in 8 categories, with French, Arabic and English text of realistic length.
INSERT INTO spike_menu_items (
  id, cafe, category, category_position, position,
  name_fr, name_ar, name_en, desc_fr, desc_ar, desc_en, price_millimes
)
WITH RECURSIVE n (i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 150)
SELECT
  i,
  'demo',
  CASE (i - 1) / 19
    WHEN 0 THEN 'cafes'
    WHEN 1 THEN 'thes'
    WHEN 2 THEN 'jus'
    WHEN 3 THEN 'viennoiseries'
    WHEN 4 THEN 'petit-dejeuner'
    WHEN 5 THEN 'sandwichs'
    WHEN 6 THEN 'plats'
    ELSE 'desserts'
  END,
  (i - 1) / 19,
  i,
  'Spécialité maison n° ' || i,
  'طبق البيت رقم ' || i,
  'House special no. ' || i,
  'Préparée chaque jour avec des produits frais du marché, servie avec le sourire.',
  'يُحضَّر يوميًا بمكونات طازجة من السوق ويُقدَّم بابتسامة.',
  'Made fresh every day with produce from the market, served with a smile.',
  1500 + ((i * 250) % 20000)
FROM n;
