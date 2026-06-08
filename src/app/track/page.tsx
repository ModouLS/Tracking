import { Suspense } from "react";
import TrackClient from "./track-client";

export const metadata = { title: "Track your shipment — KINSING" };

export default function TrackPage() {
  return (
    <main className="container" style={{ paddingBottom: 60 }}>
      <div className="hero">
        <h1>Track your KINSING shipment</h1>
        <p>Enter your tracking number to see the latest status.</p>
      </div>
      <Suspense fallback={<div className="card">Loading…</div>}>
        <TrackClient />
      </Suspense>
    </main>
  );
}
