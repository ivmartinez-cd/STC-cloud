import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { DATA_DIR } from '../core/config';
import type { DeviceReading, PollMethod } from '../snmp/scanner';

const MAX_RETENTION_DAYS = 7;
const BACKPRESSURE_LIMIT = 10_000;

let db: Database.Database;

export function openQueue(): void {
  if (db) db.close();
  const currentDir = process.env.AGENT_DATA_DIR ?? DATA_DIR;
  const dbPath = path.join(currentDir, 'local.db');
  fs.mkdirSync(currentDir, { recursive: true });

  // Truco para pkg: buscar la libreria nativa fuera del .exe si es necesario
  let options = {};
  const exeDir = path.dirname(process.execPath);
  const nativePath = path.join(exeDir, 'better_sqlite3.node');
  
  if (fs.existsSync(nativePath)) {
    // @ts-ignore - nativeBinding existe en versiones modernas de better-sqlite3
    options = { nativeBinding: nativePath };
  }

  db = new Database(dbPath, options);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS readings_queue (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id     TEXT    NOT NULL,
      ip            TEXT,
      brand         TEXT,
      model         TEXT,
      time          TEXT    NOT NULL,
      total_pages   INTEGER,
      mono_pages    INTEGER,
      color_pages   INTEGER,
      toner_black   INTEGER,
      toner_cyan    INTEGER,
      toner_magenta INTEGER,
      toner_yellow  INTEGER,
      cartridge_code_black       TEXT,
      cartridge_code_cyan        TEXT,
      cartridge_code_magenta     TEXT,
      cartridge_code_yellow      TEXT,
      cartridge_serial_black     TEXT,
      cartridge_serial_cyan      TEXT,
      cartridge_serial_magenta   TEXT,
      cartridge_serial_yellow    TEXT,
      cartridge_capacity_black   INTEGER,
      cartridge_capacity_cyan    INTEGER,
      cartridge_capacity_magenta INTEGER,
      cartridge_capacity_yellow  INTEGER,
      cartridge_printed_black    INTEGER,
      cartridge_printed_cyan     INTEGER,
      cartridge_printed_magenta  INTEGER,
      cartridge_printed_yellow   INTEGER,
      cartridge_estimated_black  INTEGER,
      cartridge_estimated_cyan   INTEGER,
      cartridge_estimated_magenta INTEGER,
      cartridge_estimated_yellow  INTEGER,
      poll_method   TEXT    DEFAULT 'snmp',
      synced        INTEGER DEFAULT 0,
      created_at    TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS known_devices (
      ip          TEXT PRIMARY KEY,
      serial      TEXT,
      brand       TEXT,
      model       TEXT,
      registered  INTEGER DEFAULT 0,
      poll_method TEXT    DEFAULT 'snmp',
      last_seen   TEXT
    );
  `);

  // Migracion en caliente: agrega columna si la BD ya existia sin ella
  for (const stmt of [
    "ALTER TABLE readings_queue ADD COLUMN poll_method   TEXT    DEFAULT 'snmp'",
    "ALTER TABLE known_devices  ADD COLUMN poll_method   TEXT    DEFAULT 'snmp'",
    "ALTER TABLE readings_queue ADD COLUMN toner_black   INTEGER DEFAULT NULL",
    "ALTER TABLE readings_queue ADD COLUMN toner_cyan    INTEGER DEFAULT NULL",
    "ALTER TABLE readings_queue ADD COLUMN toner_magenta INTEGER DEFAULT NULL",
    "ALTER TABLE readings_queue ADD COLUMN toner_yellow  INTEGER DEFAULT NULL",
    "ALTER TABLE readings_queue ADD COLUMN cartridge_code_black       TEXT DEFAULT NULL",
    "ALTER TABLE readings_queue ADD COLUMN cartridge_code_cyan        TEXT DEFAULT NULL",
    "ALTER TABLE readings_queue ADD COLUMN cartridge_code_magenta     TEXT DEFAULT NULL",
    "ALTER TABLE readings_queue ADD COLUMN cartridge_code_yellow      TEXT DEFAULT NULL",
    "ALTER TABLE readings_queue ADD COLUMN cartridge_serial_black     TEXT DEFAULT NULL",
    "ALTER TABLE readings_queue ADD COLUMN cartridge_serial_cyan      TEXT DEFAULT NULL",
    "ALTER TABLE readings_queue ADD COLUMN cartridge_serial_magenta   TEXT DEFAULT NULL",
    "ALTER TABLE readings_queue ADD COLUMN cartridge_serial_yellow    TEXT DEFAULT NULL",
    "ALTER TABLE readings_queue ADD COLUMN cartridge_capacity_black   INTEGER DEFAULT NULL",
    "ALTER TABLE readings_queue ADD COLUMN cartridge_capacity_cyan    INTEGER DEFAULT NULL",
    "ALTER TABLE readings_queue ADD COLUMN cartridge_capacity_magenta INTEGER DEFAULT NULL",
    "ALTER TABLE readings_queue ADD COLUMN cartridge_capacity_yellow  INTEGER DEFAULT NULL",
    "ALTER TABLE readings_queue ADD COLUMN cartridge_printed_black    INTEGER DEFAULT NULL",
    "ALTER TABLE readings_queue ADD COLUMN cartridge_printed_cyan     INTEGER DEFAULT NULL",
    "ALTER TABLE readings_queue ADD COLUMN cartridge_printed_magenta  INTEGER DEFAULT NULL",
    "ALTER TABLE readings_queue ADD COLUMN cartridge_printed_yellow   INTEGER DEFAULT NULL",
    "ALTER TABLE readings_queue ADD COLUMN cartridge_estimated_black   INTEGER DEFAULT NULL",
    "ALTER TABLE readings_queue ADD COLUMN cartridge_estimated_cyan    INTEGER DEFAULT NULL",
    "ALTER TABLE readings_queue ADD COLUMN cartridge_estimated_magenta INTEGER DEFAULT NULL",
    "ALTER TABLE readings_queue ADD COLUMN cartridge_estimated_yellow  INTEGER DEFAULT NULL",
  ]) {
    try { db.exec(stmt); } catch { /* columna ya existe */ }
  }
}

export function enqueueReading(r: DeviceReading): void {
  db.prepare(`
    INSERT INTO readings_queue
      (device_id, ip, brand, model, time, total_pages, mono_pages, color_pages,
       toner_black, toner_cyan, toner_magenta, toner_yellow,
       cartridge_code_black, cartridge_code_cyan, cartridge_code_magenta, cartridge_code_yellow,
       cartridge_serial_black, cartridge_serial_cyan, cartridge_serial_magenta, cartridge_serial_yellow,
       cartridge_capacity_black, cartridge_capacity_cyan, cartridge_capacity_magenta, cartridge_capacity_yellow,
       cartridge_printed_black, cartridge_printed_cyan, cartridge_printed_magenta, cartridge_printed_yellow,
       cartridge_estimated_black, cartridge_estimated_cyan, cartridge_estimated_magenta, cartridge_estimated_yellow,
       poll_method)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    r.serial ?? r.ip, r.ip, r.brand, r.model, r.time,
    r.total_pages, r.mono_pages, r.color_pages,
    r.toner_black ?? null, r.toner_cyan ?? null, r.toner_magenta ?? null, r.toner_yellow ?? null,
    r.cartridge_code_black ?? null, r.cartridge_code_cyan ?? null, r.cartridge_code_magenta ?? null, r.cartridge_code_yellow ?? null,
    r.cartridge_serial_black ?? null, r.cartridge_serial_cyan ?? null, r.cartridge_serial_magenta ?? null, r.cartridge_serial_yellow ?? null,
    r.cartridge_capacity_black ?? null, r.cartridge_capacity_cyan ?? null, r.cartridge_capacity_magenta ?? null, r.cartridge_capacity_yellow ?? null,
    r.cartridge_printed_black ?? null, r.cartridge_printed_cyan ?? null, r.cartridge_printed_magenta ?? null, r.cartridge_printed_yellow ?? null,
    r.cartridge_estimated_black ?? null, r.cartridge_estimated_cyan ?? null, r.cartridge_estimated_magenta ?? null, r.cartridge_estimated_yellow ?? null,
    r.poll_method ?? 'snmp',
  );
}

export interface QueueReading {
  id:            number;
  device_id:     string;
  ip:            string | null;
  brand:         string | null;
  model:         string | null;
  time:          string;
  total_pages:   number | null;
  mono_pages:    number | null;
  color_pages:   number | null;
  toner_black:   number | null;
  toner_cyan:    number | null;
  toner_magenta: number | null;
  toner_yellow:  number | null;
  cartridge_code_black?:       string | null;
  cartridge_code_cyan?:        string | null;
  cartridge_code_magenta?:     string | null;
  cartridge_code_yellow?:      string | null;
  cartridge_serial_black?:     string | null;
  cartridge_serial_cyan?:      string | null;
  cartridge_serial_magenta?:   string | null;
  cartridge_serial_yellow?:    string | null;
  cartridge_capacity_black?:   number | null;
  cartridge_capacity_cyan?:    number | null;
  cartridge_capacity_magenta?: number | null;
  cartridge_capacity_yellow?:  number | null;
  cartridge_printed_black?:    number | null;
  cartridge_printed_cyan?:     number | null;
  cartridge_printed_magenta?:  number | null;
  cartridge_printed_yellow?:   number | null;
  cartridge_estimated_black?:  number | null;
  cartridge_estimated_cyan?:   number | null;
  cartridge_estimated_magenta?: number | null;
  cartridge_estimated_yellow?:  number | null;
  poll_method:   PollMethod;
  synced:        number;
  created_at:    string;
}

export function getPendingReadings(limit = 500): QueueReading[] {
  return db.prepare(
    'SELECT * FROM readings_queue WHERE synced = 0 ORDER BY id ASC LIMIT ?'
  ).all(limit) as QueueReading[];
}

export function markSynced(ids: number[]): void {
  if (!ids.length) return;
  const ph = ids.map(() => '?').join(',');
  db.prepare(`UPDATE readings_queue SET synced = 1 WHERE id IN (${ph})`).run(...ids);
}

export function pendingCount(): number {
  const result = db.prepare('SELECT COUNT(*) as c FROM readings_queue WHERE synced = 0').get() as { c: number } | undefined;
  return result?.c ?? 0;
}

export function purgeOld(): void {
  db.prepare(`
    DELETE FROM readings_queue
    WHERE synced = 1
       OR created_at < datetime('now', '-${MAX_RETENTION_DAYS} days')
  `).run();
}

export function isBackpressureActive(): boolean {
  return pendingCount() > BACKPRESSURE_LIMIT;
}

export function upsertKnownDevice(
  ip: string,
  data: { serial?: string; brand?: string; model?: string; registered?: boolean; pollMethod?: PollMethod },
): void {
  db.prepare(`
    INSERT INTO known_devices (ip, serial, brand, model, registered, poll_method, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(ip) DO UPDATE SET
      serial      = COALESCE(excluded.serial,      serial),
      brand       = COALESCE(excluded.brand,       brand),
      model       = COALESCE(excluded.model,       model),
      registered  = COALESCE(excluded.registered,  registered),
      poll_method = COALESCE(excluded.poll_method, poll_method),
      last_seen   = datetime('now')
  `).run(
    ip,
    data.serial     ?? null,
    data.brand      ?? null,
    data.model      ?? null,
    data.registered === undefined ? null : (data.registered ? 1 : 0),
    data.pollMethod ?? null,
  );
}

export function getKnownPollMethod(ip: string): PollMethod | null {
  const row = db.prepare('SELECT poll_method FROM known_devices WHERE ip = ?').get(ip) as { poll_method: PollMethod } | undefined;
  return row?.poll_method ?? null;
}

export function closeQueue(): void {
  if (db) db.close();
}

export function isRegistered(ip: string): boolean {
  const row = db.prepare('SELECT registered FROM known_devices WHERE ip = ?').get(ip) as { registered: number } | undefined;
  return row?.registered === 1;
}

export function getDeviceCount(): number {
  const result = db.prepare('SELECT COUNT(*) as c FROM known_devices').get() as { c: number } | undefined;
  return result?.c ?? 0;
}


