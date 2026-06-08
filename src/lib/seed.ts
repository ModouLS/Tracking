import { getDb } from "./db";
import { hashPassword } from "./password";
import {
  attachCarrierRef,
  createShipment,
  getShipmentById,
  ingestCarrierEvent,
  type CreateShipmentInput,
} from "./shipments";

/** Convert a JS Date to a SQLite UTC string: "YYYY-MM-DD HH:MM:SS". */
function sqliteUtc(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19);
}

function hoursAgo(h: number): string {
  return sqliteUtc(new Date(Date.now() - h * 3600 * 1000));
}

/**
 * Idempotent seed. Populates a demo admin user and a handful of realistic
 * Germany↔Gambia shipments at different journey stages, driving each through
 * the status-mapping engine with real carrier event codes (RCS/DEP/ARR/NFD + DPD).
 *
 * Returns a summary of the demo tracking numbers so they can be surfaced in the UI.
 */
export function ensureSeeded(): { trackingNumbers: string[]; admin: { username: string } } {
  const db = getDb();

  const existing = (
    db.prepare(`SELECT COUNT(*) AS n FROM shipments`).get() as { n: number }
  ).n;

  // Always make sure the demo admin exists.
  const adminExists = db.prepare(`SELECT 1 FROM users WHERE username = ?`).get("admin");
  if (!adminExists) {
    db.prepare(`INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')`).run(
      "admin",
      hashPassword("kinsing123")
    );
    db.prepare(`INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'readonly')`).run(
      "viewer",
      hashPassword("viewer123")
    );
  }

  if (existing > 0) {
    const tns = (
      db.prepare(`SELECT kinsing_tracking FROM shipments ORDER BY created_at LIMIT 5`).all() as {
        kinsing_tracking: string;
      }[]
    ).map((r) => r.kinsing_tracking);
    return { trackingNumbers: tns, admin: { username: "admin" } };
  }

  const trackingNumbers: string[] = [];

  // 1) DE → GM, full air-freight journey, ready for pickup.
  {
    const base: CreateShipmentInput = {
      sender_name: "Müller Handels GmbH",
      receiver_name: "Awa Touray",
      origin_city: "Berlin",
      origin_country: "Germany",
      destination_city: "Banjul",
      destination_country: "Gambia",
      weight_kg: 24.5,
      pieces: 3,
      route: "DE_TO_GM",
      delivery_address: "Kairaba Avenue, Serrekunda",
      notes: "Fragile electronics. Customer prefers WhatsApp updates.",
    };
    const s = createShipment(base);
    trackingNumbers.push(s.kinsing_tracking);
    attachCarrierRef(s.id, "DPD", "01234567890123");
    attachCarrierRef(s.id, "LUFTHANSA", "020-12345675");
    // Ground leg (DPD) to KINSING warehouse, then air freight (Lufthansa C2K codes).
    ingestCarrierEvent({ shipmentId: s.id, carrier: "DPD", carrierCode: "Collected from sender", eventTime: hoursAgo(120) });
    ingestCarrierEvent({ shipmentId: s.id, carrier: "DPD", carrierCode: "In transit to parcel center", eventTime: hoursAgo(110) });
    ingestCarrierEvent({ shipmentId: s.id, carrier: "LUFTHANSA", carrierCode: "RCS", eventTime: hoursAgo(96) });
    ingestCarrierEvent({ shipmentId: s.id, carrier: "LUFTHANSA", carrierCode: "MAN", eventTime: hoursAgo(80) });
    ingestCarrierEvent({ shipmentId: s.id, carrier: "LUFTHANSA", carrierCode: "DEP", eventTime: hoursAgo(60) });
    ingestCarrierEvent({ shipmentId: s.id, carrier: "LUFTHANSA", carrierCode: "ARR", eventTime: hoursAgo(20) });
    ingestCarrierEvent({ shipmentId: s.id, carrier: "LUFTHANSA", carrierCode: "NFD", eventTime: hoursAgo(4) });
  }

  // 2) DE → GM, in the air (departed Germany).
  {
    const s = createShipment({
      sender_name: "Schmidt Logistik",
      receiver_name: "Modou Jallow",
      origin_city: "Frankfurt",
      origin_country: "Germany",
      destination_city: "Banjul",
      destination_country: "Gambia",
      weight_kg: 8.0,
      pieces: 1,
      route: "DE_TO_GM",
      delivery_address: null,
      notes: null,
    });
    trackingNumbers.push(s.kinsing_tracking);
    attachCarrierRef(s.id, "DPD", "09876543210987");
    attachCarrierRef(s.id, "LUFTHANSA", "020-98765432");
    ingestCarrierEvent({ shipmentId: s.id, carrier: "DPD", carrierCode: "Collected from sender", eventTime: hoursAgo(50) });
    ingestCarrierEvent({ shipmentId: s.id, carrier: "LUFTHANSA", carrierCode: "RCS", eventTime: hoursAgo(30) });
    ingestCarrierEvent({ shipmentId: s.id, carrier: "LUFTHANSA", carrierCode: "DEP", eventTime: hoursAgo(6) });
  }

  // 3) DE → GM, still on the ground (DPD on the way to KINSING).
  {
    const s = createShipment({
      sender_name: "Weber Export",
      receiver_name: "Fatou Ceesay",
      origin_city: "Hamburg",
      origin_country: "Germany",
      destination_city: "Brikama",
      destination_country: "Gambia",
      weight_kg: 15.2,
      pieces: 2,
      route: "DE_TO_GM",
      delivery_address: null,
      notes: "Awaiting AWB assignment.",
    });
    trackingNumbers.push(s.kinsing_tracking);
    attachCarrierRef(s.id, "DPD", "05555555550555");
    ingestCarrierEvent({ shipmentId: s.id, carrier: "DPD", carrierCode: "Order information received", eventTime: hoursAgo(10) });
    ingestCarrierEvent({ shipmentId: s.id, carrier: "DPD", carrierCode: "In transit to depot", eventTime: hoursAgo(2) });
  }

  // 4) GM → DE, delivered (reverse route, complete).
  {
    const s = createShipment({
      sender_name: "Lamin Sanneh",
      receiver_name: "Klaus Becker",
      origin_city: "Banjul",
      origin_country: "Gambia",
      destination_city: "Munich",
      destination_country: "Germany",
      weight_kg: 5.5,
      pieces: 1,
      route: "GM_TO_DE",
      delivery_address: "Leopoldstraße 12, München",
      notes: null,
    });
    trackingNumbers.push(s.kinsing_tracking);
    attachCarrierRef(s.id, "LUFTHANSA", "020-22223333");
    attachCarrierRef(s.id, "DPD", "07777777770777");
    ingestCarrierEvent({ shipmentId: s.id, carrier: "LUFTHANSA", carrierCode: "RCS", eventTime: hoursAgo(140) });
    ingestCarrierEvent({ shipmentId: s.id, carrier: "LUFTHANSA", carrierCode: "DEP", eventTime: hoursAgo(120) });
    ingestCarrierEvent({ shipmentId: s.id, carrier: "LUFTHANSA", carrierCode: "ARR", eventTime: hoursAgo(96) });
    ingestCarrierEvent({ shipmentId: s.id, carrier: "DPD", carrierCode: "Out for delivery", eventTime: hoursAgo(30) });
    ingestCarrierEvent({ shipmentId: s.id, carrier: "DPD", carrierCode: "Delivered to recipient", eventTime: hoursAgo(28) });
  }

  // 5) DE → GM, on hold / exception.
  {
    const s = createShipment({
      sender_name: "Becker & Co",
      receiver_name: "Isatou Bah",
      origin_city: "Cologne",
      origin_country: "Germany",
      destination_city: "Banjul",
      destination_country: "Gambia",
      weight_kg: 40.0,
      pieces: 5,
      route: "DE_TO_GM",
      delivery_address: null,
      notes: "Customs documentation incomplete — follow up with sender.",
    });
    trackingNumbers.push(s.kinsing_tracking);
    attachCarrierRef(s.id, "DPD", "03333333330333");
    ingestCarrierEvent({ shipmentId: s.id, carrier: "DPD", carrierCode: "Collected from sender", eventTime: hoursAgo(72) });
    ingestCarrierEvent({ shipmentId: s.id, carrier: "DPD", carrierCode: "Customs hold — documentation problem", eventTime: hoursAgo(40) });
  }

  // Touch each shipment so last_update reflects the latest event for sane ordering.
  for (const tn of trackingNumbers) {
    const row = db.prepare(`SELECT id FROM shipments WHERE kinsing_tracking = ?`).get(tn) as { id: number };
    if (row) getShipmentById(row.id);
  }

  return { trackingNumbers, admin: { username: "admin" } };
}
