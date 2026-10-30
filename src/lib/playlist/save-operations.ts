// A bounded, process-local supplement to the browser's persistent save journal.
// This is not a distributed exactly-once guarantee across Vercel instances.
const MAX_ENTRIES = 200;
const TTL_MS = 30 * 60 * 1000;
type Operation = { fingerprint: string; started: number; settled: boolean; failed: boolean; promise: Promise<unknown> };
const operations = new Map<string, Operation>();

export class SaveOperationConflict extends Error {}

export async function runSaveOperation<T>(key: string, fingerprint: string, recovering: boolean, work: () => Promise<T>): Promise<T> {
  const now = Date.now();
  for (const [id, entry] of operations) {
    if (entry.settled && now - entry.started > TTL_MS) operations.delete(id);
  }
  const existing = operations.get(key);
  if (existing) {
    if (existing.fingerprint !== fingerprint) throw new SaveOperationConflict("The saved draft has changed. Start a new draft before saving.");
    if (!(recovering && existing.settled && existing.failed)) return existing.promise as Promise<T>;
  }
  if (operations.size >= MAX_ENTRIES && !existing) {
    const oldestSettled = Array.from(operations).find(([, entry]) => entry.settled);
    if (oldestSettled) operations.delete(oldestSettled[0]);
    else throw new SaveOperationConflict("Too many saves are in progress. Please try again shortly.");
  }
  const entry: Operation = { fingerprint, started: now, settled: false, failed: false, promise: Promise.resolve() };
  entry.promise = Promise.resolve().then(work).then(
    (result) => { entry.settled = true; return result; },
    (error) => {
      entry.settled = true;
      entry.failed = true;
      // Definitive pre-creation rejection can be retried after login/cooldown.
      if (error && typeof error === "object" && "retrySafe" in error && error.retrySafe === true) operations.delete(key);
      throw error;
    },
  );
  operations.set(key, entry);
  return entry.promise as Promise<T>;
}
