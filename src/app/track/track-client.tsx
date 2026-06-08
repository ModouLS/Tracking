"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface ProgressStep {
  key: string;
  label: string;
  reached: boolean;
  current: boolean;
}
interface TimelineEvent {
  statusKey: string;
  label: string;
  description: string | null;
  time: string;
}
interface ShipmentView {
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
  timeline: TimelineEvent[];
  progress: ProgressStep[];
  nextMilestone: string | null;
}

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@kinsing.de";
const SUPPORT_PHONE = process.env.NEXT_PUBLIC_SUPPORT_PHONE || "";

export default function TrackClient() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get("code") ?? "";

  const [code, setCode] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shipment, setShipment] = useState<ShipmentView | null>(null);

  const lookup = useCallback(async (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    setLoading(true);
    setError(null);
    setShipment(null);
    try {
      const res = await fetch(`/api/track?code=${encodeURIComponent(value)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
      } else {
        setShipment(data.shipment);
      }
    } catch {
      setError("Could not reach the tracking service. Please try again shortly.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-search when the page loads with ?code=…
  useEffect(() => {
    if (initial) lookup(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = code.trim().toUpperCase();
    setCode(value);
    router.replace(`/track?code=${encodeURIComponent(value)}`);
    lookup(value);
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 20 }}>
        <form onSubmit={onSubmit} style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <input
            aria-label="Tracking number"
            placeholder="e.g. KIN-26-A7X9P2"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mono"
            style={{ flex: "1 1 240px", textTransform: "uppercase" }}
          />
          <button className="btn btn-primary" type="submit" disabled={loading || !code.trim()}>
            {loading ? "Searching…" : "Track"}
          </button>
        </form>
      </div>

      {error && (
        <div className="card">
          <div className="error-box">{error}</div>
          <p className="muted" style={{ marginBottom: 0, marginTop: 14, fontSize: 14 }}>
            Need help? Contact KINSING customer service at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            {SUPPORT_PHONE ? <> or call {SUPPORT_PHONE}.</> : "."}
          </p>
        </div>
      )}

      {shipment && <ShipmentDetails s={shipment} />}
    </>
  );
}

function statusPillClass(key: string) {
  if (key === "exception") return "pill pill-exception";
  if (key === "delivered" || key === "ready_for_pickup") return "pill pill-done";
  return "pill pill-active";
}

function ShipmentDetails({ s }: { s: ShipmentView }) {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="muted" style={{ fontSize: 13 }}>Tracking number</div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 700 }}>{s.trackingNumber}</div>
          </div>
          <span className={statusPillClass(s.currentStatusKey)} style={{ fontSize: 15, padding: "8px 16px" }}>
            {s.currentStatusLabel}
          </span>
        </div>

        {s.currentStatusKey !== "exception" && (
          <div className="steps" style={{ marginTop: 20 }}>
            {s.progress.map((step) => (
              <div
                key={step.key}
                className={`step ${step.current ? "current" : step.reached ? "reached" : ""}`}
              >
                {step.label}
              </div>
            ))}
          </div>
        )}

        <div className="muted" style={{ fontSize: 14 }}>
          Last update: {s.lastUpdate}
          {s.nextMilestone && s.currentStatusKey !== "exception" && (
            <> · Next expected: <strong>{s.nextMilestone}</strong></>
          )}
        </div>
      </div>

      <div className="card">
        <p className="section-title">Shipment details</p>
        <div className="summary">
          <div><div className="k">Sender</div><div className="v">{s.sender}</div></div>
          <div><div className="k">Receiver</div><div className="v">{s.receiver}</div></div>
          <div><div className="k">Origin</div><div className="v">{s.origin}</div></div>
          <div><div className="k">Destination</div><div className="v">{s.destination}</div></div>
          <div><div className="k">Route</div><div className="v">{s.route}</div></div>
          <div><div className="k">Weight / Pieces</div><div className="v">{s.weightKg != null ? `${s.weightKg} kg` : "—"} · {s.pieces ?? "—"} pcs</div></div>
          {s.deliveryAddress && (
            <div style={{ gridColumn: "1 / -1" }}>
              <div className="k">Delivery area</div><div className="v">{s.deliveryAddress}</div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <p className="section-title">Status timeline</p>
        <ul className="timeline">
          {s.timeline.map((e, i) => (
            <li key={i}>
              <div className="t-label">{e.description || e.label}</div>
              <div className="t-time">{e.time}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
