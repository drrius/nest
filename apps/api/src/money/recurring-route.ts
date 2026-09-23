import { legacyAdoptionRoute } from "./legacy-adoption-route.ts";
import { legacyConfirmationRoute } from "./legacy-confirmation-route.ts";
import { legacyDismissalRoute } from "./legacy-dismissal-route.ts";
import { legacyDraftRoute } from "./legacy-draft-read.ts";
import { legacyRecurringRoute } from "./legacy-recurring-read.ts";
import { recurringHistoryRoute } from "./recurring-history.ts";
import { manualCycleRoute } from "./recurring-manual-route.ts";
import { variableCycleRoute } from "./recurring-variable-route.ts";
import { recurringResumeRoute } from "./recurring-resume-route.ts";
import { recurringApprovalRoute } from "./recurring-approval-route.ts";
import { recurringStateRoute } from "./recurring-state-route.ts";
import * as Effect from "effect/Effect";
import { recurringSaveRecovery } from "./recurring-save-read.ts";
import { recurringReads } from "./recurring-read.ts";
import { recurringCommands } from "./recurring.ts";
import { commandBody } from "../request-body.ts";
import { ApiFailure } from "../errors.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
export function recurringRoute(request: Request, config: IdentityConfig, caller: AuthorizedCaller) {
  const url = new URL(request.url);
  if (url.pathname.includes("/legacy-adoption/"))
    return legacyAdoptionRoute(request, config, caller);
  if (url.pathname.includes("/legacy-confirmation/"))
    return legacyConfirmationRoute(request, config, caller);
  if (url.pathname.includes("/legacy-dismissal/"))
    return legacyDismissalRoute(request, config, caller);
  if (url.pathname.includes("/manual/")) return manualCycleRoute(request, config, caller);
  if (url.pathname.includes("/variable/")) return variableCycleRoute(request, config, caller);
  if (url.pathname.includes("/resume/")) return recurringResumeRoute(request, config, caller);
  if (url.pathname.includes("/state/")) return recurringStateRoute(request, config, caller);
  if (url.pathname.includes("/approval")) return recurringApprovalRoute(request, config, caller);
  if (request.method === "GET") return recurringReadRoute(url, config, caller);
  return Effect.gen(function* () {
    if (url.searchParams.size) return yield* new ApiFailure({ code: "invalid_request" });
    if (url.pathname.endsWith("/cancel-save"))
      return yield* recurringSaveRecovery(config, caller).cancel(yield* commandBody(request, 1024));
    const input = yield* commandBody(request, 65536),
      commands = recurringCommands(config, caller);
    return yield* url.pathname.endsWith("/execute")
      ? commands.execute(input)
      : commands.save(input);
  });
}

function recurringReadRoute(url: URL, config: IdentityConfig, caller: AuthorizedCaller) {
  if (url.pathname.endsWith("/legacy-drafts")) return legacyDraftRoute(url, config, caller);
  if (url.pathname.endsWith("/legacy")) return legacyRecurringRoute(url, config, caller);
  if (url.pathname.endsWith("/cycles")) return recurringHistoryRoute(url, config, caller);
  if (url.pathname.endsWith("/rules") || url.pathname.endsWith("/due-variable"))
    return recurringListRoute(url, config, caller);
  return Effect.gen(function* () {
    const params = url.searchParams;
    if (url.pathname.endsWith("/receipt")) {
      if (params.size !== 1 || !params.has("operationId"))
        return yield* new ApiFailure({ code: "invalid_request" });
      return yield* recurringSaveRecovery(config, caller).read({
        operationId: params.get("operationId"),
      });
    }
    if (params.size !== 1 || !params.has("ruleId"))
      return yield* new ApiFailure({ code: "invalid_request" });
    return yield* recurringReads(config, caller).detail({ ruleId: params.get("ruleId") });
  });
}

function recurringListRoute(url: URL, config: IdentityConfig, caller: AuthorizedCaller) {
  return Effect.gen(function* () {
    const params = url.searchParams;
    if (params.size > 1 || [...params.keys()].some((key) => key !== "after"))
      return yield* new ApiFailure({ code: "invalid_request" });
    const reads = recurringReads(config, caller);
    return yield* (url.pathname.endsWith("/due-variable") ? reads.dueVariable : reads.list)({
      after: params.get("after"),
    });
  });
}
