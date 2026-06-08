import crypto from "node:crypto";
import { getDb } from "./db";
import { currentStatusKey, mapCarrierEvent, statusLabel, type CarrierName } from "./status";

/** Data-access layer for shipments, carrier refs and status history. */

export interface ShipmentRow {
  id: number;
  kinsing_tracking: string;
  sender_name: string;
  receiver_name: string;
  origin_city: string;
  origin_country: string;
  destination_city: string;
  destination_country: string;
  weight_kg: number | null;
  pieces: number | null;
  route: string;
  delivery_address: string | null;
  notes: string | null;
  current_status: string;
  created_at: string;
  last_update: string;
  last_refreshed: string | null;
}

export interface StatusEvent {
  id: number;
  status_code: string;
  description: string | null;
  event_time: string;
  carrier_event_code: string | null;
  carrier_name: string | null;
  source: string;
}

export interface CarrierRef {
  id: number;
  carrier_name: string;
  carrier_tracking_number: string;
  last_carrier_status: string | null;
  last_carrier_timestamp: string | null;
}

// ---- tracking number generation ----

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I

/** Generate a hard-to-guess tracking number, e.g. KIN-26-A7X9P2 (§3.1). */
export function generateTrackingNumber(year = new Date().getFullYear()): string {
  const yy = String(year).slice(-2);
  let suffix = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) suffix += ALPHABET[bytes[i] % ALPHABET.length];
  return `KIN-${yy}-${suffix}`;
}

export function generateUniqueTrackingNumber(): string {
  const db = getDb();
  for (let i = 0; i < 20; i++) {
    const candidate = generateTrackingNumber();
    const exists = db.prepare(`SELECT 1 FROM shipments WHERE kinsing_tracking = ?`).get(candidate);
    if (!exists) return candidate;
  }
  throw new Error("Could not generate a unique tracking number");
}

// ---- queries ----

export function getShipmentByTracking(code: string): ShipmentRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM shipments WHERE kinsing_tracking = ? COLLATE NOCASE`)
    .get(code.trim()) as ShipmentRow | undefined;
}

export function getShipmentById(id: number): ShipmentRow | undefined {
  return getDb().prepare(`SELECT * FROM shipments WHERE id = ?`).get(id) as ShipmentRow | undefined;
}

export function getStatusHistory(shipmentId: number): StatusEvent[] {
  return getDb()
    .prepare(`SELECT * FROM status_history WHERE shipment_id = ? ORDER BY event_time ASC, id ASC`)
    .all(shipmentId) as StatusEvent[];
}

export function getCarrierRefs(shipmentId: number): CarrierRef[] {
  return getDb()
    .prepare(`SELECT * FROM carrier_references WHERE shipment_id = ?`)
    .all(shipmentId) as CarrierRef[];
}

export interface ShipmentListItem extends ShipmentRow {}

export function searchShipments(filters: {
  q?: string;
  status?: string;
  route?: string;
}): ShipmentListItem[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.q) {
    clauses.push(
      `(kinsing_tracking LIKE ? OR sender_name LIKE ? OR receiver_name LIKE ? OR origin_city LIKE ? OR destination_city LIKE ?)`
    );
    const like = `%${filters.q}%`;
    params.push(like, like, like, like, like);
  }
  if (filters.status) {
    clauses.push(`current_status = ?`);
    params.push(filters.status);
  }
  if (filters.route) {
    clauses.push(`route = ?`);
    params.push(filters.route);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return getDb()
    .prepare(`SELECT * FROM shipments ${where} ORDER BY last_update DESC LIMIT 200`)
    .all(...(params as never[])) as ShipmentListItem[];
}

// ---- mutations ----

export interface CreateShipmentInput {
  sender_name: string;
  receiver_name: string;
  origin_city: string;
  origin_country: string;
  destination_city: string;
  destination_country: string;
  weight_kg?: number | null;
  pieces?: number | null;
  route: string;
  delivery_address?: string | null;
  notes?: string | null;
}

export function createShipment(input: CreateShipmentInput): ShipmentRow {
  const db = getDb();
  const tracking = generateUniqueTrackingNumber();
  const info = db
    .prepare(
      `INSERT INTO shipments
        (kinsing_tracking, sender_name, receiver_name, origin_city, origin_country,
         destination_city, destination_country, weight_kg, pieces, route, delivery_address, notes, current_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'registered')`
    )
    .run(
      tracking,
      input.sender_name,
      input.receiver_name,
      input.origin_city,
      input.origin_country,
      input.destination_city,
      input.destination_country,
      input.weight_kg ?? null,
      input.pieces ?? null,
      input.route,
      input.delivery_address ?? null,
      input.notes ?? null
    );
  const id = Number(info.lastInsertRowid);
  // Seed the first timeline event.
  db.prepare(
    `INSERT INTO status_history (shipment_id, status_code, description, source)
     VALUES (?, 'registered', ?, 'manual')`
  ).run(id, statusLabel("registered"));
  return getShipmentById(id)!;
}

export function attachCarrierRef(
  shipmentId: number,
  carrier: CarrierName,
  trackingNumber: string
): void {
  getDb()
    .prepare(
      `INSERT INTO carrier_references (shipment_id, carrier_name, carrier_tracking_number)
       VALUES (?, ?, ?)`
    )
    .run(shipmentId, carrier, trackingNumber.trim());
}

/** Recompute and persist a shipment's current status from its full history. */
export function recomputeCurrentStatus(shipmentId: number): void {
  const db = getDb();
  const keys = (
    db.prepare(`SELECT status_code FROM status_history WHERE shipment_id = ?`).all(shipmentId) as {
      status_code: string;
    }[]
  ).map((r) => r.status_code);
  const current = currentStatusKey(keys);
  db.prepare(`UPDATE shipments SET current_status = ?, last_update = datetime('now') WHERE id = ?`).run(
    current,
    shipmentId
  );
}

/** Add a manual status event (admin override, §3.2). */
export function addManualStatus(shipmentId: number, statusCode: string, description?: string): void {
  getDb()
    .prepare(
      `INSERT INTO status_history (shipment_id, status_code, description, source)
       VALUES (?, ?, ?, 'manual')`
    )
    .run(shipmentId, statusCode, description ?? statusLabel(statusCode));
  recomputeCurrentStatus(shipmentId);
}

/**
 * Ingest a raw carrier event. In production this is called by the polling job /
 * webhook handler after fetching from DPD/Lufthansa. Here it's used by the seed
 * and by the "simulate carrier update" admin action.
 */
export function ingestCarrierEvent(args: {
  shipmentId: number;
  carrier: CarrierName;
  carrierCode: string;
  eventTime?: string; // SQLite UTC string; defaults to now
  description?: string;
}): { mapped: string | null } {
  const db = getDb();
  const mapped = mapCarrierEvent(args.carrier, args.carrierCode);
  if (mapped) {
    db.prepare(
      `INSERT INTO status_history
         (shipment_id, status_code, description, event_time, carrier_event_code, carrier_name, source)
       VALUES (?, ?, ?, COALESCE(?, datetime('now')), ?, ?, 'carrier')`
    ).run(
      args.shipmentId,
      mapped,
      args.description ?? statusLabel(mapped),
      args.eventTime ?? null,
      args.carrierCode,
      args.carrier
    );
  }
  // Update the carrier reference's last-known status regardless of mapping.
  db.prepare(
    `UPDATE carrier_references
       SET last_carrier_status = ?, last_carrier_timestamp = COALESCE(?, datetime('now'))
     WHERE shipment_id = ? AND carrier_name = ?`
  ).run(args.carrierCode, args.eventTime ?? null, args.shipmentId, args.carrier);

  db.prepare(`UPDATE shipments SET last_refreshed = datetime('now') WHERE id = ?`).run(args.shipmentId);
  if (mapped) recomputeCurrentStatus(args.shipmentId);
  return { mapped };
}
