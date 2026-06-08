import { NextRequest, NextResponse } from "next/server";
import { buildPublicView } from "@/lib/public-view";

// Domains allowed to call this API cross-origin (kinsing.de + any staging subdomain).
const ALLOWED_ORIGINS = [
  "https://www.kinsing.de",
  "https://kinsing.de",
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

/**
 * Public tracking endpoint (§3.3): GET /api/track?code=KIN-26-A7X9P2
 * Returns only the safe, non-sensitive projection of a shipment.
 */
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  const code = req.nextUrl.searchParams.get("code")?.trim() ?? "";

  if (!code) {
    return NextResponse.json({ error: "Please provide a tracking number." }, { status: 400, headers });
  }
  // Basic shape guard to discourage enumeration / junk queries.
  if (!/^KIN-\d{2}-[A-Z0-9]{6}$/i.test(code)) {
    return NextResponse.json(
      { error: "That doesn't look like a valid KINSING tracking number (e.g. KIN-26-A7X9P2)." },
      { status: 404, headers }
    );
  }

  const view = buildPublicView(code);
  if (!view) {
    return NextResponse.json(
      { error: "No shipment found for that tracking number. Please check and try again." },
      { status: 404, headers }
    );
  }

  return NextResponse.json({ shipment: view }, { headers });
}
