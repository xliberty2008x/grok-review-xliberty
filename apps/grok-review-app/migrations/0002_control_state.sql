CREATE TABLE IF NOT EXISTS control_state (
  state_key TEXT PRIMARY KEY NOT NULL CHECK (state_key = 'dispatch_gate'),
  paused INTEGER NOT NULL CHECK (paused IN (0, 1)),
  epoch INTEGER NOT NULL CHECK (epoch >= 1),
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO control_state (state_key, paused, epoch, updated_at)
VALUES ('dispatch_gate', 0, 1, '1970-01-01T00:00:00.000Z');
