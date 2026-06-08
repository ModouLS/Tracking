/**
 * Date/timezone + presentation helpers.
 * Public page shows times in Europe/Berlin (§3.1 localization & timezone).
 */

const BERLIN_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** SQLite stores UTC strings like "2026-06-08 12:30:00". Parse as UTC. */
export function parseSqliteUtc(s: string): Date {
  // Replace space with 'T' and mark as UTC.
  return new Date(s.replace(" ", "T") + "Z");
}

export function formatBerlin(sqliteTs: string | null | undefined): string {
  if (!sqliteTs) return "—";
  try {
    return BERLIN_FMT.format(parseSqliteUtc(sqliteTs)) + " (Berlin)";
  } catch {
    return sqliteTs;
  }
}

export function routeLabel(route: string): string {
  return route === "GM_TO_DE" ? "Gambia → Germany" : "Germany → Gambia";
}
