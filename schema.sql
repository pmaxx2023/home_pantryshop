-- PantryShop schema. Safe to run more than once.

CREATE TABLE IF NOT EXISTS households (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT 'Home',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  aisle TEXT NOT NULL DEFAULT 'Other',
  qty TEXT NOT NULL DEFAULT '',
  checked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS items_household ON items(household_id, checked, aisle);

-- One row per distinct item name a household has ever added.
-- Drives suggestions, remembers the aisle, and holds the favorite flag.
CREATE TABLE IF NOT EXISTS memory (
  household_id TEXT NOT NULL REFERENCES households(id),
  name_key TEXT NOT NULL,
  name TEXT NOT NULL,
  aisle TEXT NOT NULL DEFAULT 'Other',
  qty TEXT NOT NULL DEFAULT '',
  favorite INTEGER NOT NULL DEFAULT 0,
  times_added INTEGER NOT NULL DEFAULT 1,
  last_added INTEGER NOT NULL,
  PRIMARY KEY (household_id, name_key)
);
