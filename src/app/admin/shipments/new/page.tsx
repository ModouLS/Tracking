import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { createShipmentAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function NewShipment() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (user.role === "readonly") redirect("/admin");

  return (
    <main className="container" style={{ paddingTop: 28, paddingBottom: 60 }}>
      <Link href="/admin" className="muted" style={{ fontSize: 14 }}>← Back to shipments</Link>
      <h1 style={{ color: "var(--kin-navy)" }}>New shipment</h1>
      <p className="muted" style={{ marginTop: -8 }}>A unique KINSING tracking number is generated automatically.</p>

      <form action={createShipmentAction} className="card">
        <p className="section-title">Parties</p>
        <div className="grid-2">
          <div className="field"><label>Sender name</label><input name="sender_name" required /></div>
          <div className="field"><label>Receiver name</label><input name="receiver_name" required /></div>
        </div>

        <p className="section-title">Route</p>
        <div className="field">
          <label>Direction</label>
          <select name="route" defaultValue="DE_TO_GM">
            <option value="DE_TO_GM">Germany → Gambia</option>
            <option value="GM_TO_DE">Gambia → Germany</option>
          </select>
        </div>
        <div className="grid-2">
          <div className="field"><label>Origin city</label><input name="origin_city" required /></div>
          <div className="field"><label>Origin country</label><input name="origin_country" defaultValue="Germany" required /></div>
          <div className="field"><label>Destination city</label><input name="destination_city" required /></div>
          <div className="field"><label>Destination country</label><input name="destination_country" defaultValue="Gambia" required /></div>
        </div>

        <p className="section-title">Cargo</p>
        <div className="grid-2">
          <div className="field"><label>Weight (kg)</label><input name="weight_kg" type="number" step="0.1" min="0" /></div>
          <div className="field"><label>Pieces</label><input name="pieces" type="number" min="0" /></div>
        </div>
        <div className="field">
          <label>Delivery area (optional — street + town only, no phone numbers)</label>
          <input name="delivery_address" placeholder="e.g. Kairaba Avenue, Serrekunda" />
        </div>
        <div className="field">
          <label>Internal notes (never shown publicly)</label>
          <textarea name="notes" rows={3} />
        </div>

        <button className="btn btn-primary" type="submit">Create shipment</button>
      </form>
    </main>
  );
}
