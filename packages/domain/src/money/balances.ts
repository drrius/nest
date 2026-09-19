export type LedgerEntry = {
  readonly eventId: string;
  readonly memberId: string;
  readonly deltaCentimes: number;
};

function safeSigned(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error("Balance exceeds safe integer CHF centimes");
  return result;
}

function validatePair(pair: readonly [string, string]): void {
  if (!pair[0].trim() || !pair[1].trim() || pair[0] === pair[1]) {
    throw new Error("Two distinct members required");
  }
}

function indexEvents(entries: readonly LedgerEntry[], pair: readonly [string, string]) {
  const events = new Map<string, Map<string, bigint>>();
  for (const entry of entries) {
    if (
      !entry.eventId.trim() ||
      !pair.includes(entry.memberId) ||
      !Number.isSafeInteger(entry.deltaCentimes)
    ) {
      throw new Error("Invalid ledger entry");
    }
    const deltas = events.get(entry.eventId) ?? new Map<string, bigint>();
    if (deltas.has(entry.memberId)) throw new Error("Duplicate member entry for financial event");
    deltas.set(entry.memberId, BigInt(entry.deltaCentimes));
    events.set(entry.eventId, deltas);
  }
  return events;
}

export function deriveBalances(entries: readonly LedgerEntry[], pair: readonly [string, string]) {
  validatePair(pair);
  const events = indexEvents(entries, pair);
  let first = 0n;
  for (const deltas of events.values()) {
    const a = deltas.get(pair[0]);
    const b = deltas.get(pair[1]);
    if (a === undefined || b === undefined || a + b !== 0n)
      throw new Error("Every event must balance between both members");
    first += a;
  }
  return [
    { memberId: pair[0], centimes: safeSigned(first) },
    { memberId: pair[1], centimes: safeSigned(-first) },
  ] as const;
}
