-- PantryShop schema. Safe to run more than once on a fresh database.
-- The Worker also applies these changes on its own the first time it runs,
-- so an existing database picks up new columns without a manual step.

CREATE TABLE IF NOT EXISTS households (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT 'Home',
  created_at INTEGER NOT NULL
);

-- A household can keep more than one list: Grocery, Costco, Hardware.
CREATE TABLE IF NOT EXISTS lists (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🛒',
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS lists_household ON lists(household_id, sort);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  list_id TEXT,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  aisle TEXT NOT NULL DEFAULT 'Other',
  qty TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  checked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS items_household ON items(household_id, checked, aisle);
CREATE INDEX IF NOT EXISTS items_list ON items(list_id, checked);

-- One row per distinct item name a household has ever added.
-- Drives suggestions and buy-again, remembers the aisle, holds the favorite and weekly flags.
CREATE TABLE IF NOT EXISTS memory (
  household_id TEXT NOT NULL REFERENCES households(id),
  name_key TEXT NOT NULL,
  name TEXT NOT NULL,
  aisle TEXT NOT NULL DEFAULT 'Other',
  qty TEXT NOT NULL DEFAULT '',
  favorite INTEGER NOT NULL DEFAULT 0,
  weekly INTEGER NOT NULL DEFAULT 0,
  times_added INTEGER NOT NULL DEFAULT 1,
  last_added INTEGER NOT NULL,
  PRIMARY KEY (household_id, name_key)
);
