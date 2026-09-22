import type { LegacyAdoptionContext } from "@nest/contracts/legacy-adoption";
import type { LegacyDraftContext } from "@nest/contracts/legacy-draft-dismissal";
import type { LegacyDraftList } from "@nest/contracts/legacy-recurring-drafts";
import type { LegacyRecurringList } from "@nest/contracts/legacy-recurring";
import type { RecurringHistory } from "@nest/contracts/recurring-history";
import * as Effect from "effect/Effect";
import type { RecurringDetail, RecurringList } from "@nest/contracts/recurring-read";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
export type RecurringReadTarget =
  | { kind: "legacy-adoption"; ruleId: string }
  | { kind: "legacy-review"; draftId: string }
  | { kind: "legacy-drafts"; ruleId: string; after: string | null }
  | { kind: "legacy"; after: string | null }
  | { kind: "list"; after: string | null }
  | { kind: "detail"; ruleId: string }
  | { kind: "history"; ruleId: string; before: string | null };
export type RecurringReadEntry =
  | { kind: "legacy-adoption"; value: { review: typeof LegacyAdoptionContext.Type; today: string } }
  | { kind: "legacy-review"; value: typeof LegacyDraftContext.Type }
  | { kind: "legacy-drafts"; value: typeof LegacyDraftList.Type }
  | { kind: "legacy"; value: typeof LegacyRecurringList.Type }
  | { kind: "list"; value: RecurringList }
  | { kind: "detail"; value: RecurringDetail }
  | { kind: "history"; value: RecurringHistory };
export function recurringReadOperations(account: OfflineAccount, client: MoneyClient) {
  return {
    read: (target: RecurringReadTarget) =>
      Effect.gen(function* () {
        yield* account.store.checkSession(account.session);
        const entry = yield* readTarget(client, target);
        yield* account.store.checkSession(account.session);
        return entry;
      }),
  };
}
export type RecurringReadOperations = ReturnType<typeof recurringReadOperations>;

function readTarget(
  client: MoneyClient,
  target: RecurringReadTarget,
): Effect.Effect<RecurringReadEntry, import("../preferences/client.ts").PreferenceFailure> {
  if (target.kind === "legacy-adoption")
    return Effect.all([client.legacyAdoptionContext(target.ruleId), client.recurringRules(null)], {
      concurrency: 2,
    }).pipe(
      Effect.map(([review, rules]) => ({
        kind: "legacy-adoption" as const,
        value: { review, today: rules.today },
      })),
    );
  if (target.kind === "legacy-review")
    return client
      .legacyDraftContext(target.draftId)
      .pipe(Effect.map((value) => ({ kind: "legacy-review" as const, value })));
  if (target.kind === "legacy-drafts")
    return client
      .legacyDrafts({ ruleId: target.ruleId, after: target.after })
      .pipe(Effect.map((value) => ({ kind: "legacy-drafts" as const, value })));
  if (target.kind === "legacy")
    return client
      .legacyRecurring(target.after)
      .pipe(Effect.map((value) => ({ kind: "legacy" as const, value })));
  if (target.kind === "list")
    return client
      .recurringRules(target.after)
      .pipe(Effect.map((value) => ({ kind: "list" as const, value })));
  if (target.kind === "history")
    return client
      .recurringHistory({ ruleId: target.ruleId, before: target.before })
      .pipe(Effect.map((value) => ({ kind: "history" as const, value })));
  return client
    .recurringRule(target.ruleId)
    .pipe(Effect.map((value) => ({ kind: "detail" as const, value })));
}
