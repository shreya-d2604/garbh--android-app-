// Verify queue (PLAN.md §7.5 #2): self-registered patients waiting for desk verification,
// today's arrivals first, then the longest-waiting.

export interface QueuePatient {
  id: string;
  created_at: string;
}

export function sortVerifyQueue<P extends QueuePatient>(
  patients: readonly P[],
  arrivingTodayIds: ReadonlySet<string>,
): (P & { arrivesToday: boolean })[] {
  return patients
    .map((p) => ({ ...p, arrivesToday: arrivingTodayIds.has(p.id) }))
    .sort(
      (a, b) =>
        Number(b.arrivesToday) - Number(a.arrivesToday) ||
        Date.parse(a.created_at) - Date.parse(b.created_at) ||
        a.id.localeCompare(b.id),
    );
}
