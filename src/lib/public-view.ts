import { getShipmentByTracking, getStatusHistory, type ShipmentRow } from "./shipments";
import { KINSING_STATUSES, PIPELINE_STEPS, statusLabel } from "./status";
import { formatBerlin, routeLabel } from "./format";

/**
 * Builds the SAFE public projection of a shipment (§2, §3.1).
 * Deliberately omits: carrier tracking numbers / AWBs, pricing, internal notes,
 * phone numbers and full contact details.
 */

export interface PublicTimelineEvent {
  statusKey: string;
  label: string;
  description: string | null;
  time: string; // formatted Europe/Berlin
}

export interface PublicShipmentView {
  trackingNumber: string;
  sender: string;
  receiver: string;
  origin: string;
  destination: string;
  route: string;
  weightKg: number | null;
  pieces: number | null;
  deliveryAddress: string | null;
  currentStatusKey: string;
  currentStatusLabel: string;
  lastUpdate: string;
  timeline: PublicTimelineEvent[];
  progress: { key: string; label: string; reached: boolean; current: boolean }[];
  nextMilestone: string | null;
}

function buildProgress(currentKey: string) {
  const currentOrder = KINSING_STATUSES[currentKey]?.order ?? 0;
  const isException = KINSING_STATUSES[currentKey]?.offPipeline;
  return PIPELINE_STEPS.map((step) => ({
    key: step.key,
    label: step.label,
    reached: !isException && step.order <= currentOrder,
    current: !isException && step.key === currentKey,
  }));
}

function nextMilestone(currentKey: string): string | null {
  const currentOrder = KINSING_STATUSES[currentKey]?.order ?? 0;
  const upcoming = PIPELINE_STEPS.find((s) => s.order > currentOrder);
  return upcoming ? upcoming.label : null;
}

export function buildPublicView(code: string): PublicShipmentView | null {
  const s: ShipmentRow | undefined = getShipmentByTracking(code);
  if (!s) return null;

  const history = getStatusHistory(s.id);
  const timeline: PublicTimelineEvent[] = history
    .slice()
    .reverse() // newest first for display
    .map((e) => ({
      statusKey: e.status_code,
      label: statusLabel(e.status_code),
      description: e.description,
      time: formatBerlin(e.event_time),
    }));

  return {
    trackingNumber: s.kinsing_tracking,
    sender: s.sender_name,
    receiver: s.receiver_name,
    origin: `${s.origin_city}, ${s.origin_country}`,
    destination: `${s.destination_city}, ${s.destination_country}`,
    route: routeLabel(s.route),
    weightKg: s.weight_kg,
    pieces: s.pieces,
    deliveryAddress: s.delivery_address,
    currentStatusKey: s.current_status,
    currentStatusLabel: statusLabel(s.current_status),
    lastUpdate: formatBerlin(s.last_update),
    timeline,
    progress: buildProgress(s.current_status),
    nextMilestone: nextMilestone(s.current_status),
  };
}
