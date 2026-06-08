"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { logAudit } from "@/lib/db";
import {
  addManualStatus,
  attachCarrierRef,
  createShipment,
  ingestCarrierEvent,
} from "@/lib/shipments";
import type { CarrierName } from "@/lib/status";

async function requireEditor() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (user.role === "readonly") throw new Error("Read-only users cannot make changes.");
  return user;
}

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function numOrNull(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function createShipmentAction(fd: FormData) {
  const user = await requireEditor();
  const shipment = createShipment({
    sender_name: str(fd, "sender_name"),
    receiver_name: str(fd, "receiver_name"),
    origin_city: str(fd, "origin_city"),
    origin_country: str(fd, "origin_country"),
    destination_city: str(fd, "destination_city"),
    destination_country: str(fd, "destination_country"),
    weight_kg: numOrNull(fd, "weight_kg"),
    pieces: numOrNull(fd, "pieces"),
    route: str(fd, "route") || "DE_TO_GM",
    delivery_address: str(fd, "delivery_address") || null,
    notes: str(fd, "notes") || null,
  });
  logAudit(user.username, "create_shipment", shipment.kinsing_tracking);
  revalidatePath("/admin");
  redirect(`/admin/shipments/${shipment.id}`);
}

export async function attachCarrierRefAction(fd: FormData) {
  const user = await requireEditor();
  const id = Number(str(fd, "shipment_id"));
  const carrier = str(fd, "carrier") as CarrierName;
  const trackingNumber = str(fd, "carrier_tracking_number");
  if (id && carrier && trackingNumber) {
    attachCarrierRef(id, carrier, trackingNumber);
    logAudit(user.username, "attach_carrier_ref", `${id}:${carrier}`);
  }
  revalidatePath(`/admin/shipments/${id}`);
}

export async function addStatusAction(fd: FormData) {
  const user = await requireEditor();
  const id = Number(str(fd, "shipment_id"));
  const status = str(fd, "status_code");
  const description = str(fd, "description") || undefined;
  if (id && status) {
    addManualStatus(id, status, description);
    logAudit(user.username, "manual_status", `${id}:${status}`);
  }
  revalidatePath(`/admin/shipments/${id}`);
}

export async function simulateCarrierEventAction(fd: FormData) {
  const user = await requireEditor();
  const id = Number(str(fd, "shipment_id"));
  const carrier = str(fd, "carrier") as CarrierName;
  const carrierCode = str(fd, "carrier_code");
  if (id && carrier && carrierCode) {
    const { mapped } = ingestCarrierEvent({ shipmentId: id, carrier, carrierCode });
    logAudit(user.username, "carrier_event", `${id}:${carrier}:${carrierCode}=>${mapped ?? "unmapped"}`);
  }
  revalidatePath(`/admin/shipments/${id}`);
}

export async function logoutAction() {
  const { logout } = await import("@/lib/auth");
  await logout();
  redirect("/admin/login");
}
