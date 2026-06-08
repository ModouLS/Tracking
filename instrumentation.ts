/**
 * Next.js instrumentation hook — runs once when the server boots.
 * We use it to lazily initialise + seed the SQLite database (Node runtime only).
 */
export async function register() {
  console.log("[KINSING] instrumentation register() called, runtime:", process.env.NEXT_RUNTIME);
  // NEXT_RUNTIME is "nodejs" in production and undefined/unset in dev when first
  // invoked, so we guard by excluding the edge runtime instead.
  if (process.env.NEXT_RUNTIME !== "edge") {
    try {
      const { ensureSeeded } = await import("./src/lib/seed");
      const summary = ensureSeeded();
      console.log("[KINSING] DB ready. Demo tracking numbers:", summary.trackingNumbers.join(", "));
    } catch (err) {
      console.error("[KINSING] Seed error:", err);
    }
  }
}
