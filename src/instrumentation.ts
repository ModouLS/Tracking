/**
 * Next.js instrumentation hook — runs once when the server boots.
 * Must live in src/ when the project uses a src/ directory layout.
 */
export async function register() {
  // NEXT_RUNTIME is "nodejs" in production; it's unset (or undefined) in dev.
  // We guard against the edge runtime so this never runs in edge workers.
  if (process.env.NEXT_RUNTIME !== "edge") {
    try {
      const { ensureSeeded } = await import("./lib/seed");
      const summary = ensureSeeded();
      // eslint-disable-next-line no-console
      console.log("[KINSING] DB ready. Demo tracking numbers:", summary.trackingNumbers.join(", "));
    } catch (err) {
      console.error("[KINSING] Seed error:", err);
    }
  }
}
