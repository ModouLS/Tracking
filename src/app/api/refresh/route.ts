import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { trackAWB } from "@/lib/lufthansa";
import { ingestCarrierEvent } from "@/lib/shipments";

/**
 * POST /api/refresh
 *
 * Polls Lufthansa Cargo API for all active shipments that have an LH carrier ref.
 * Called by the Railway cron service every 15 minutes.
 *
 * Secured by CRON_SECRET env var — Railway passes it as a Bearer token.
 */
export async function POST(req: NextRequest) {
  // Verify cron secret so random internet requests can't trigger polls
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const db = getDb();

  // Fetch all active shipments (not delivered/exception) with an LH carrier ref
  const shipments = db.prepare(`
    SELECT s.id, s.kinsing_tracking, s.current_status, cr.carrier_tracking_number,
           cr.last_carrier_status, cr.last_carrier_timestamp
    FROM shipments s
    JOIN carrier_references cr ON cr.shipment_id = s.id
    WHERE cr.carrier_name = 'LUFTHANSA'
      AND s.current_status NOT IN ('delivered', 'exception', 'returned')
  `).all() as {
    id: number;
    kinsing_tracking: string;
    current_status: string;
    carrier_tracking_number: string;
    last_carrier_status: string | null;
    last_carrier_timestamp: string | null;
  }[];

  const results: { tracking: string; awb: string; newEvents: number; error?: string }[] = [];

  for (const shipment of shipments) {
    try {
      const result = await trackAWB(shipment.carrier_tracking_number);

      if (!result) {
        results.push({ tracking: shipment.kinsing_tracking, awb: shipment.carrier_tracking_number, newEvents: 0 });
        continue;
      }

      // Only ingest events newer than the last known carrier timestamp
      const lastKnown = shipment.last_carrier_timestamp
        ? new Date(shipment.last_carrier_timestamp).getTime()
        : 0;

      let newEvents = 0;
      for (const event of result.events) {
        const eventTime = new Date(event.timestamp).getTime();
        if (eventTime > lastKnown) {
          ingestCarrierEvent({
            shipmentId: shipment.id,
            carrier: "LUFTHANSA",
            carrierCode: event.eventCode,
            eventTime: new Date(event.timestamp).toISOString().replace("T", " ").slice(0, 19),
            description: event.description,
          });
          newEvents++;
        }
      }

      results.push({ tracking: shipment.kinsing_tracking, awb: shipment.carrier_tracking_number, newEvents });
    } catch (err) {
      results.push({
        tracking: shipment.kinsing_tracking,
        awb: shipment.carrier_tracking_number,
        newEvents: 0,
        error: String(err),
      });
    }
  }

  const totalNew = results.reduce((sum, r) => sum + r.newEvents, 0);
  console.log(`[KINSING] Refresh: checked ${shipments.length} shipments, ${totalNew} new events`);

  return NextResponse.json({ checked: shipments.length, totalNewEvents: totalNew, results });
}
