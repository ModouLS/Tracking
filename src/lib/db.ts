import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

/**
 * SQLite database layer.
 *
 * Uses Node's built-in `node:sqlite` (no native compilation needed). The schema
 * mirrors the MVP design (§3.3): shipments, carrier_references, status_history, users.
 *
 * A single connection is reused across the app via a module-level singleton, which
 * survives Next.js dev hot-reloads through `globalThis`.
 */

// DATA_DIR can be overridden via env var so Railway can mount a persistent volume
// (e.g. DATA_DIR=/data). Falls back to <project>/data for local dev.
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "tracking.db");

declare global {
  // eslint-disable-next-line no-var
  var __kinsingDb: DatabaseSync | undefined;
}

function createConnection(): DatabaseSync {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  initSchema(db);
  return db;
}

export function getDb(): DatabaseSync {
  if (!globalThis.__kinsingDb) {
    globalThis.__kinsingDb = createConnection();
  }
  return globalThis.__kinsingDb;
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'admin',  -- 'admin' | 'readonly'
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shipments (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      kinsing_tracking TEXT NOT NULL UNIQUE,
      sender_name      TEXT NOT NULL,
      receiver_name    TEXT NOT NULL,
      origin_city      TEXT NOT NULL,
      origin_country   TEXT NOT NULL,
      destination_city TEXT NOT NULL,
      destination_country TEXT NOT NULL,
      weight_kg        REAL,
      pieces           INTEGER,
      route            TEXT NOT NULL,            -- 'DE_TO_GM' | 'GM_TO_DE'
      delivery_address TEXT,                     -- optional, street + town only (§3.1)
      notes            TEXT,                     -- internal, never shown publicly
      current_status   TEXT NOT NULL DEFAULT 'registered',
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      last_update      TEXT NOT NULL DEFAULT (datetime('now')),
      last_refreshed   TEXT                      -- last time carrier APIs were polled (cache TTL, §3.1)
    );

    CREATE TABLE IF NOT EXISTS carrier_references (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id            INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      carrier_name           TEXT NOT NULL,       -- 'DPD' | 'LUFTHANSA'
      carrier_tracking_number TEXT NOT NULL,      -- DPD parcel no. or LH AWB (never shown publicly)
      last_carrier_status    TEXT,
      last_carrier_timestamp TEXT
    );

    CREATE TABLE IF NOT EXISTS status_history (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id       INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      status_code       TEXT NOT NULL,            -- internal KINSING status key
      description       TEXT,                     -- customer-facing description
      event_time        TEXT NOT NULL DEFAULT (datetime('now')),
      carrier_event_code TEXT,                    -- optional raw carrier code (RCS, DEP, ...)
      carrier_name      TEXT,                     -- which carrier produced it (NULL = manual)
      source            TEXT NOT NULL DEFAULT 'carrier'  -- 'carrier' | 'manual'
    );

    CREATE INDEX IF NOT EXISTS idx_history_shipment ON status_history(shipment_id);
    CREATE INDEX IF NOT EXISTS idx_refs_shipment    ON carrier_references(shipment_id);
    CREATE INDEX IF NOT EXISTS idx_shipments_track  ON shipments(kinsing_tracking);

    CREATE TABLE IF NOT EXISTS audit_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT,
      action     TEXT NOT NULL,
      detail     TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export function logAudit(username: string | null, action: string, detail?: string): void {
  getDb()
    .prepare(`INSERT INTO audit_log (username, action, detail) VALUES (?, ?, ?)`)
    .run(username, action, detail ?? null);
}
