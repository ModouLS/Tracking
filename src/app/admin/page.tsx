import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { searchShipments } from "@/lib/shipments";
import { KINSING_STATUSES, statusLabel } from "@/lib/status";
import { formatBerlin, routeLabel } from "@/lib/format";
import { logoutAction } from "./actions";

export const dynamic = "force-dynamic";

function pillClass(key: string) {
  if (key === "exception") return "pill pill-exception";
  if (key === "delivered" || key === "ready_for_pickup") return "pill pill-done";
  if (key === "registered") return "pill pill-neutral";
  return "pill pill-active";
}

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; route?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  const sp = await searchParams;
  const rows = searchShipments({ q: sp.q, status: sp.status, route: sp.route });

  return (
    <main className="container-wide" style={{ paddingTop: 28, paddingBottom: 60 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, color: "var(--kin-navy)" }}>Shipments</h1>
          <span className="muted" style={{ fontSize: 14 }}>
            Signed in as <strong>{user.username}</strong> ({user.role})
          </span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {user.role !== "readonly" && (
            <Link href="/admin/shipments/new" className="btn btn-primary">+ New shipment</Link>
          )}
          <form action={logoutAction}>
            <button className="btn btn-secondary" type="submit">Sign out</button>
          </form>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <form method="get" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 12, alignItems: "end" }}>
          <div>
            <label htmlFor="q">Search</label>
            <input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Tracking no., sender, receiver, city…" />
          </div>
          <div>
            <label htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={sp.status ?? ""}>
              <option value="">All</option>
              {Object.values(KINSING_STATUSES).map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="route">Route</label>
            <select id="route" name="route" defaultValue={sp.route ?? ""}>
              <option value="">All</option>
              <option value="DE_TO_GM">Germany → Gambia</option>
              <option value="GM_TO_DE">Gambia → Germany</option>
            </select>
          </div>
          <button className="btn btn-primary" type="submit">Filter</button>
        </form>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th>Tracking</th>
              <th>Sender → Receiver</th>
              <th>Route</th>
              <th>Status</th>
              <th>Last update</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="muted" style={{ padding: 24, textAlign: "center" }}>No shipments match your filters.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/admin/shipments/${r.id}`} className="mono">{r.kinsing_tracking}</Link></td>
                <td>{r.sender_name} → {r.receiver_name}</td>
                <td>{routeLabel(r.route)}</td>
                <td><span className={pillClass(r.current_status)}>{statusLabel(r.current_status)}</span></td>
                <td className="muted">{formatBerlin(r.last_update)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
