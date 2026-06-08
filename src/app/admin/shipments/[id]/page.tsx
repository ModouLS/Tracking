import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getCarrierRefs, getShipmentById, getStatusHistory } from "@/lib/shipments";
import { KINSING_STATUSES, statusLabel } from "@/lib/status";
import { formatBerlin, routeLabel } from "@/lib/format";
import { addStatusAction, attachCarrierRefAction, simulateCarrierEventAction } from "../../actions";

export const dynamic = "force-dynamic";

function pillClass(key: string) {
  if (key === "exception") return "pill pill-exception";
  if (key === "delivered" || key === "ready_for_pickup") return "pill pill-done";
  if (key === "registered") return "pill pill-neutral";
  return "pill pill-active";
}

export default async function ShipmentDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  const canEdit = user.role !== "readonly";

  const { id } = await params;
  const shipment = getShipmentById(Number(id));
  if (!shipment) notFound();

  const history = getStatusHistory(shipment.id).slice().reverse();
  const refs = getCarrierRefs(shipment.id);

  return (
    <main className="container" style={{ paddingTop: 28, paddingBottom: 60 }}>
      <Link href="/admin" className="muted" style={{ fontSize: 14 }}>← Back to shipments</Link>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
        <h1 className="mono" style={{ color: "var(--kin-navy)", margin: 0 }}>{shipment.kinsing_tracking}</h1>
        <span className={pillClass(shipment.current_status)} style={{ fontSize: 15, padding: "8px 16px" }}>
          {statusLabel(shipment.current_status)}
        </span>
      </div>
      <p style={{ marginTop: 6 }}>
        <Link href={`/track?code=${shipment.kinsing_tracking}`} target="_blank">View public tracking page ↗</Link>
      </p>

      {/* Details */}
      <div className="card" style={{ marginBottom: 20 }}>
        <p className="section-title">Details</p>
        <div className="summary">
          <div><div className="k">Sender</div><div className="v">{shipment.sender_name}</div></div>
          <div><div className="k">Receiver</div><div className="v">{shipment.receiver_name}</div></div>
          <div><div className="k">Origin</div><div className="v">{shipment.origin_city}, {shipment.origin_country}</div></div>
          <div><div className="k">Destination</div><div className="v">{shipment.destination_city}, {shipment.destination_country}</div></div>
          <div><div className="k">Route</div><div className="v">{routeLabel(shipment.route)}</div></div>
          <div><div className="k">Weight / Pieces</div><div className="v">{shipment.weight_kg ?? "—"} kg · {shipment.pieces ?? "—"} pcs</div></div>
          <div><div className="k">Created</div><div className="v">{formatBerlin(shipment.created_at)}</div></div>
          <div><div className="k">Last carrier refresh</div><div className="v">{formatBerlin(shipment.last_refreshed)}</div></div>
          {shipment.delivery_address && (
            <div style={{ gridColumn: "1 / -1" }}><div className="k">Delivery area</div><div className="v">{shipment.delivery_address}</div></div>
          )}
          {shipment.notes && (
            <div style={{ gridColumn: "1 / -1" }}><div className="k">Internal notes</div><div className="v" style={{ fontWeight: 400 }}>{shipment.notes}</div></div>
          )}
        </div>
      </div>

      {/* Carrier references — hidden from public */}
      <div className="card" style={{ marginBottom: 20 }}>
        <p className="section-title">Carrier references (internal)</p>
        {refs.length === 0 && <p className="muted">No carrier references attached yet.</p>}
        {refs.length > 0 && (
          <table>
            <thead><tr><th>Carrier</th><th>Reference</th><th>Last carrier status</th><th>Updated</th></tr></thead>
            <tbody>
              {refs.map((r) => (
                <tr key={r.id}>
                  <td>{r.carrier_name}</td>
                  <td className="mono">{r.carrier_tracking_number}</td>
                  <td>{r.last_carrier_status ?? "—"}</td>
                  <td className="muted">{formatBerlin(r.last_carrier_timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {canEdit && (
          <form action={attachCarrierRefAction} style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap", alignItems: "end" }}>
            <input type="hidden" name="shipment_id" value={shipment.id} />
            <div style={{ flex: "0 0 160px" }}>
              <label>Carrier</label>
              <select name="carrier" defaultValue="DPD">
                <option value="DPD">DPD (ground)</option>
                <option value="LUFTHANSA">Lufthansa (AWB)</option>
              </select>
            </div>
            <div style={{ flex: "1 1 220px" }}>
              <label>Tracking number / AWB</label>
              <input name="carrier_tracking_number" placeholder="e.g. 020-12345675" required />
            </div>
            <button className="btn btn-secondary" type="submit">Attach</button>
          </form>
        )}
      </div>

      {/* Status timeline */}
      <div className="card" style={{ marginBottom: 20 }}>
        <p className="section-title">Status history</p>
        <ul className="timeline">
          {history.map((e) => (
            <li key={e.id}>
              <div className="t-label">
                {statusLabel(e.status_code)}
                {e.carrier_event_code && <span className="muted" style={{ fontWeight: 400 }}> · {e.carrier_name} {e.carrier_event_code}</span>}
                <span className="pill pill-neutral" style={{ marginLeft: 8, fontSize: 11, padding: "2px 8px" }}>{e.source}</span>
              </div>
              {e.description && <div className="muted" style={{ fontSize: 14 }}>{e.description}</div>}
              <div className="t-time">{formatBerlin(e.event_time)}</div>
            </li>
          ))}
        </ul>
      </div>

      {/* Editor controls */}
      {canEdit && (
        <div className="grid-2">
          <div className="card">
            <p className="section-title">Simulate carrier update</p>
            <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>
              Stands in for the live DPD/Lufthansa polling job. The code is run through the mapping engine.
            </p>
            <form action={simulateCarrierEventAction}>
              <input type="hidden" name="shipment_id" value={shipment.id} />
              <div className="field">
                <label>Carrier</label>
                <select name="carrier" defaultValue="LUFTHANSA">
                  <option value="LUFTHANSA">Lufthansa Cargo</option>
                  <option value="DPD">DPD</option>
                </select>
              </div>
              <div className="field">
                <label>Raw event code / text</label>
                <input name="carrier_code" placeholder="RCS, DEP, ARR, NFD … or DPD text" required />
              </div>
              <button className="btn btn-secondary" type="submit">Ingest event</button>
            </form>
          </div>

          <div className="card">
            <p className="section-title">Manual status override</p>
            <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>For discrepancies or exceptions (§3.2).</p>
            <form action={addStatusAction}>
              <input type="hidden" name="shipment_id" value={shipment.id} />
              <div className="field">
                <label>KINSING status</label>
                <select name="status_code" defaultValue="received_at_kinsing">
                  {Object.values(KINSING_STATUSES).map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Note (optional)</label>
                <input name="description" placeholder="Customer-facing description" />
              </div>
              <button className="btn btn-secondary" type="submit">Add status</button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
