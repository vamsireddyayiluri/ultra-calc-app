// src/utils/exportReadiness.ts
//
// Deterministic, timer-free readiness gate for the PDF export pipeline.
// Every hidden export page (cover, design parameters, per-room details,
// per-room layout, materials summary) reports itself ready — via
// markReady(id) — once its own content (including any async asset
// loading) has settled and its ref is attached. handleExportPDF() calls
// waitFor(ids) with the full set of ids expected for the current project
// and only proceeds once every one of them has reported ready.
//
// No setTimeout/polling/arbitrary delay is involved: waitFor() resolves
// synchronously (well, on the same microtask) the instant the last
// outstanding id calls markReady() — it's event-driven, not time-driven.
// markReady() is idempotent (safe to call more than once for the same
// id, e.g. if a room's data changes and its effects re-run).

export interface ReadinessGate {
  markReady: (id: string) => void;
  waitFor: (ids: string[]) => Promise<void>;
}

export function createReadinessGate(): ReadinessGate {
  const ready = new Set<string>();
  let waiters: { ids: string[]; resolve: () => void }[] = [];

  const markReady = (id: string) => {
    if (ready.has(id)) return;
    ready.add(id);
    waiters = waiters.filter((w) => {
      if (w.ids.every((i) => ready.has(i))) {
        w.resolve();
        return false;
      }
      return true;
    });
  };

  const waitFor = (ids: string[]): Promise<void> => {
    if (ids.every((i) => ready.has(i))) return Promise.resolve();
    return new Promise<void>((resolve) => {
      waiters.push({ ids, resolve });
    });
  };

  return { markReady, waitFor };
}
