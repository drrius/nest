import * as Effect from "effect/Effect";
import { fixture as database, account, run } from "./offline-fixture.mjs";
import { MealProposalRuntime } from "../src/meals/proposal-runtime.ts";
export { Effect, account, run };
export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const weekStart = "2030-01-07";
export const command = {
  operationId: id(800),
  weekStart,
  expectedWeekRevision: "0",
  familiarOnly: false,
};
export const receipt = {
  version: 1,
  actorId: account.actor,
  householdId: account.household,
  ...command,
  proposalId: id(900),
  revision: "1",
};
export const pending = {
  version: 1,
  actorId: account.actor,
  householdId: account.household,
  proposal: {
    proposalId: receipt.proposalId,
    weekStart,
    weekRevision: "0",
    revision: "1",
    familiarOnly: false,
    expiresAt: Date.now() + 86400000,
    status: "generating",
    entries: null,
    failure: null,
  },
};
export const ready = {
  ...pending,
  proposal: {
    ...pending.proposal,
    status: "ready",
    revision: "2",
    entries: [
      {
        entryId: id(950),
        date: weekStart,
        slot: "dinner",
        estimatedCaloriesPerServing: 250,
        source: {
          kind: "suggested",
          recipe: {
            title: "Soup",
            servings: 2,
            instructions: "Simmer.",
            notes: null,
            recipeUrl: null,
            ingredients: [
              { name: "Carrots", quantity: "500", unit: "g", categoryId: null, note: null },
            ],
          },
        },
      },
    ],
  },
};
export async function fixture(t) {
  const db = await database(t),
    calls = { reserve: 0, generate: 0, discard: 0, recover: 0 };
  let current = structuredClone(pending),
    next = 800;
  /** @type {Pick<import("../src/meals/client.ts").MealClient, "read" | "proposals">} */
  const client = {
    read: () =>
      Effect.succeed({
        version: 1,
        householdId: account.household,
        weekStart,
        revision: "0",
        entries: [],
      }),
    proposals: {
      reserve: (input) =>
        Effect.sync(() => {
          calls.reserve++;
          return { ...receipt, ...input, revision: "1" };
        }),
      generate: (input) =>
        Effect.sync(() => {
          calls.generate++;
          current = structuredClone(ready);
          return {
            version: 1,
            receipt: { ...receipt, ...input, revision: "1" },
            envelope: current,
          };
        }),
      recover: () =>
        Effect.sync(() => {
          calls.recover++;
          return structuredClone(current);
        }),
      discard: (input) =>
        Effect.sync(() => {
          calls.discard++;
          current.proposal = {
            ...current.proposal,
            status: "discarded",
            failure: null,
            revision: (BigInt(input.expectedRevision) + 1n).toString(),
          };
          return {
            version: 1,
            actorId: account.actor,
            householdId: account.household,
            operationId: input.operationId,
            proposalId: input.proposalId,
            previousRevision: input.expectedRevision,
            revision: current.proposal.revision,
          };
        }),
    },
  };
  const create = (store = db.store, session = db.session) => {
    const runtime = new MealProposalRuntime(client, { store, session }, weekStart, () =>
      id(next++),
    );
    t.after(() => runtime.dispose());
    return runtime;
  };
  return {
    ...db,
    calls,
    client,
    create,
    setCurrent: (value) => {
      current = structuredClone(value);
    },
  };
}
