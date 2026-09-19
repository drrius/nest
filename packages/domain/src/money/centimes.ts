export function assertCentimes(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Amount must be non-negative safe integer CHF centimes");
  }
}

export function parseChf(value: string): number | null {
  const match = /^(\d{1,14})(?:\.(\d{1,2}))?$/.exec(value.trim().replace(",", "."));
  if (!match) return null;
  const centimes = BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  return centimes <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(centimes) : null;
}

export function formatChfField(centimes: number): string {
  assertCentimes(centimes);
  const exact = BigInt(centimes);
  return `${exact / 100n}.${String(exact % 100n).padStart(2, "0")}`;
}
