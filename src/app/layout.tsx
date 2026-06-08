import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "KINSING — Shipment Tracking",
  description: "Track your KINSING shipment between Germany and Gambia.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container-wide">
            <Link href="/" className="brand">
              <span className="dot" />
              KINSING
            </Link>
            <nav>
              <Link href="/track">Track shipment</Link>
              <Link href="/admin">Staff login</Link>
            </nav>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          KINSING Logistics · Germany ↔ Gambia · All communications secured over HTTPS.
        </footer>
      </body>
    </html>
  );
}
