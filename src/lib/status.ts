/**
 * KINSING status-mapping engine.
 *
 * Each carrier (DPD ground, Lufthansa Cargo air) emits its own raw event codes.
 * This module normalises those raw codes into a single, ordered set of
 * customer-facing KINSING statuses, as described in the MVP design (§2, §3.1, §3.3).
 *
 * Air cargo codes (C2K milestones) per logistics glossaries:
 *   RCS — cargo "Ready for Carriage", accepted by airline
 *   DEP — departed airport of origin
 *   ARR — arrived at destination airport
 *   NFD — ready for pick-up, consignee notified
 */

export type CarrierName = "DPD" | "LUFTHANSA";

/** The canonical, ordered KINSING lifecycle. Lower order = earlier in journey. */
export interface KinsingStatusDef {
  key: string;
  /** Customer-facing label shown on the public page. */
  label: string;
  /** Position in the journey, used to sort the timeline and pick the "current" status. */
  order: number;
  /** Whether this is a terminal (journey-complete) state. */
  terminal?: boolean;
  /** Off-pipeline states (exceptions) are not part of the linear progress bar. */
  offPipeline?: boolean;
}

export const KINSING_STATUSES: Record<string, KinsingStatusDef> = {
  registered: { key: "registered", label: "Shipment registered", order: 10 },
  on_the_way_to_kinsing: { key: "on_the_way_to_kinsing", label: "On the way to KINSING", order: 20 },
  received_at_kinsing: { key: "received_at_kinsing", label: "Received at KINSING warehouse", order: 30 },
  prepared_for_air_freight: { key: "prepared_for_air_freight", label: "Prepared for air freight", order: 40 },
  departed_germany: { key: "departed_germany", label: "Departed Germany", order: 50 },
  arrived_gambia: { key: "arrived_gambia", label: "Arrived in Gambia", order: 60 },
  ready_for_pickup: { key: "ready_for_pickup", label: "Ready for pickup", order: 70 },
  delivered: { key: "delivered", label: "Delivered", order: 80, terminal: true },
  exception: { key: "exception", label: "On hold — needs attention", order: 999, offPipeline: true },
};

/** The linear progress steps shown on the public tracking page (excludes exceptions). */
export const PIPELINE_STEPS = Object.values(KINSING_STATUSES)
  .filter((s) => !s.offPipeline)
  .sort((a, b) => a.order - b.order);

/**
 * Lufthansa Cargo C2K milestone codes → KINSING status key.
 * Codes are matched case-insensitively against the raw event code.
 */
const LUFTHANSA_MAP: Record<string, string> = {
  FOH: "prepared_for_air_freight", // Freight on Hand
  RCS: "received_at_kinsing", // Ready for Carriage / accepted by airline
  MAN: "prepared_for_air_freight", // Manifested
  DEP: "departed_germany", // Departed origin airport
  ARR: "arrived_gambia", // Arrived destination airport
  RCF: "arrived_gambia", // Received from Flight
  AWD: "arrived_gambia", // Arrival documents delivered
  NFD: "ready_for_pickup", // Notified / ready for pick-up
  DLV: "delivered", // Delivered to consignee
};

/**
 * DPD ground statuses (Germany) → KINSING status key.
 * DPD returns human-readable statuses; we match on keywords (case-insensitive).
 * Edge cases can always be corrected via admin manual override (§3.2).
 */
const DPD_KEYWORD_MAP: Array<{ match: RegExp; status: string }> = [
  { match: /order|registered|data received|announced/i, status: "registered" },
  { match: /collect|picked up|pickup/i, status: "on_the_way_to_kinsing" },
  { match: /depot|sorting|hub|parcel center|in transit|on the way|forwarded/i, status: "on_the_way_to_kinsing" },
  { match: /out for delivery/i, status: "on_the_way_to_kinsing" },
  { match: /received at kinsing|at warehouse/i, status: "received_at_kinsing" },
  { match: /delivered/i, status: "delivered" },
  { match: /exception|failed|return|held|customs hold|problem/i, status: "exception" },
];

/**
 * Map a single raw carrier event to a KINSING status key.
 * Returns `null` if the code cannot be mapped (caller may keep it unmapped or flag for review).
 */
export function mapCarrierEvent(carrier: CarrierName, rawCode: string): string | null {
  const code = (rawCode || "").trim();
  if (!code) return null;

  if (carrier === "LUFTHANSA") {
    const key = code.toUpperCase();
    return LUFTHANSA_MAP[key] ?? null;
  }

  if (carrier === "DPD") {
    for (const { match, status } of DPD_KEYWORD_MAP) {
      if (match.test(code)) return status;
    }
    return null;
  }

  return null;
}

/** Look up the customer-facing label for an internal status key. */
export function statusLabel(key: string): string {
  return KINSING_STATUSES[key]?.label ?? key;
}

/** Given a list of internal status keys present in a shipment's history, return the latest by order. */
export function currentStatusKey(statusKeys: string[]): string {
  let best: KinsingStatusDef | null = null;
  for (const k of statusKeys) {
    const def = KINSING_STATUSES[k];
    if (!def) continue;
    if (def.offPipeline) return k; // an exception dominates
    if (!best || def.order > best.order) best = def;
  }
  return best?.key ?? "registered";
}
