/**
 * Lufthansa Cargo Tracking API client.
 *
 * Docs: https://developer.lufthansa.com (Cargo Tracking API)
 * Auth: OAuth2 client_credentials flow → Bearer token
 * AWB format: "020-12345678" (prefix-number) or just the 8-digit number
 */

const LH_TOKEN_URL = "https://api.lufthansa.com/v1/oauth/token";
const LH_TRACKING_URL = "https://api.lufthansa.com/v1/cargo/shipmenttracking";

// Cache the token in memory (reuse until it expires)
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 30_000) {
    return cachedToken.value;
  }

  const clientId = process.env.LH_CLIENT_ID;
  const clientSecret = process.env.LH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("LH_CLIENT_ID or LH_CLIENT_SECRET not set");
  }

  const res = await fetch(LH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LH token error ${res.status}: ${text}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.value;
}

export interface LHEvent {
  timestamp: string;       // ISO 8601
  location: string;
  eventCode: string;       // RCS, DEP, ARR, NFD, DLV, etc.
  description: string;
}

export interface LHTrackingResult {
  awb: string;
  events: LHEvent[];
  latestEventCode: string | null;
}

/**
 * Track a Lufthansa Cargo AWB.
 * @param awb Air Waybill number — accepts "020-12345678" or "02012345678"
 */
export async function trackAWB(awb: string): Promise<LHTrackingResult | null> {
  // Normalise: strip prefix dash → "02012345678"
  const normalised = awb.replace("-", "");

  const token = await getToken();
  const url = `${LH_TRACKING_URL}/${encodeURIComponent(normalised)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (res.status === 404) return null;

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LH tracking error ${res.status}: ${text}`);
  }

  const data = await res.json() as {
    shipmentTrackingNumber?: string;
    events?: Array<{
      timestamp?: string;
      location?: { locationName?: string };
      eventCode?: string;
      description?: string;
    }>;
  };

  const events: LHEvent[] = (data.events ?? []).map((e) => ({
    timestamp: e.timestamp ?? new Date().toISOString(),
    location: e.location?.locationName ?? "",
    eventCode: e.eventCode ?? "",
    description: e.description ?? e.eventCode ?? "",
  }));

  return {
    awb,
    events,
    latestEventCode: events.at(-1)?.eventCode ?? null,
  };
}
