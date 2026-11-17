/** Runs once when the server starts (Next.js instrumentation): starts the hold job (ADR 0015). */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startHoldJob } = await import("@/lib/booking/hold-job");
  startHoldJob();
}
