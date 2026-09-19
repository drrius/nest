import { assertCentimes } from "./centimes.ts";

export type Allocation = { readonly memberId: string; readonly centimes: number };
export type Allocations = readonly [Allocation, Allocation];

function members(payer: string, other: string): void {
  if (!payer.trim() || !other.trim() || payer === other) {
    throw new Error("Two distinct household members are required");
  }
}

export function equalAllocation(amount: number, payer: string, other: string): Allocations {
  assertCentimes(amount);
  members(payer, other);
  const otherShare = Math.floor(amount / 2);
  return [
    { memberId: payer, centimes: amount - otherShare },
    { memberId: other, centimes: otherShare },
  ];
}

export function exactAllocation(
  amount: number,
  pair: readonly [string, string],
  values: readonly Allocation[],
): Allocations {
  assertCentimes(amount);
  members(pair[0], pair[1]);
  if (values.length !== 2) throw new Error("Exactly two allocations are required");
  const payer = values.find((value) => value.memberId === pair[0]);
  const other = values.find((value) => value.memberId === pair[1]);
  if (!payer || !other)
    throw new Error("Allocations must contain both household members exactly once");
  assertCentimes(payer.centimes);
  assertCentimes(other.centimes);
  if (BigInt(payer.centimes) + BigInt(other.centimes) !== BigInt(amount)) {
    throw new Error("Allocations must sum to the expense amount");
  }
  return [{ ...payer }, { ...other }];
}

// Basis points allow two decimal percentage places without floating-point money.
// Largest remainder allocation; an exact half-cent tie is assigned to the payer.
export function percentageAllocation(
  amount: number,
  payer: string,
  other: string,
  payerBasisPoints: number,
): Allocations {
  assertCentimes(amount);
  members(payer, other);
  if (
    !Number.isSafeInteger(payerBasisPoints) ||
    payerBasisPoints < 0 ||
    payerBasisPoints > 10_000
  ) {
    throw new Error("Percentage must be integer basis points between 0 and 10000");
  }
  const numerator = BigInt(amount) * BigInt(10_000 - payerBasisPoints);
  const otherShare = Number(numerator / 10_000n + (numerator % 10_000n > 5_000n ? 1n : 0n));
  return [
    { memberId: payer, centimes: amount - otherShare },
    { memberId: other, centimes: otherShare },
  ];
}
