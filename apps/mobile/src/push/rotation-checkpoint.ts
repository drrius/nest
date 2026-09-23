import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { PushDeviceReceipt } from "@nest/contracts/push-registration";
import type { Account } from "../offline/contracts.ts";
import { PreferenceFailure } from "../preferences/client.ts";
import type { PushProtectedDisk } from "./protected-attempt.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const Checkpoint = Schema.Struct({
  version: Schema.Literal(1),
  actor: Uuid,
  household: Uuid,
  installationId: Uuid,
  revision: Uuid,
  digest: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$(?![\s\S])/)),
});
export interface PushRotationCheckpoint {
  matches: (
    installation: string,
    revision: string | null,
    token: string,
  ) => Effect.Effect<boolean, PreferenceFailure>;
  record: (
    receipt: typeof PushDeviceReceipt.Type,
    token: string,
  ) => Effect.Effect<void, PreferenceFailure>;
}
// This is only a cache of a verified receipt, never registration authority.
// A missing/corrupt checkpoint cannot suppress a fresh authorized rotation.
export function pushRotationCheckpoint(deps: {
  account: Account;
  disk: PushProtectedDisk;
  hash: (token: string) => Effect.Effect<string, PreferenceFailure>;
}): PushRotationCheckpoint {
  const actor = deps.account.actor.toLowerCase(),
    household = deps.account.household.toLowerCase();
  const key = (installation: string) =>
    `nest.push.checkpoint.v1.${actor}.${household}.${installation.toLowerCase()}`;
  const disk = <T>(body: () => Promise<T>) =>
    Effect.tryPromise({ try: body, catch: () => new PreferenceFailure({ code: "unavailable" }) });
  return {
    matches: (installationId, revision, token) =>
      Effect.gen(function* () {
        const raw = yield* disk(() => deps.disk.getItem(key(installationId)));
        if (raw === null || revision === null) return false;
        const saved = decode(raw);
        if (saved === null) return false;
        const digest = yield* deps.hash(token);
        return (
          saved.actor === actor &&
          saved.household === household &&
          saved.installationId === installationId &&
          saved.revision === revision &&
          saved.digest === digest
        );
      }),
    record: (receipt, token) =>
      Effect.gen(function* () {
        if (
          receipt.actorId !== actor ||
          receipt.householdId !== household ||
          receipt.action !== "register"
        )
          return yield* new PreferenceFailure({ code: "unavailable" });
        const digest = yield* deps.hash(token);
        const checkpoint = {
          version: 1 as const,
          actor,
          household,
          installationId: receipt.installationId,
          revision: receipt.revision,
          digest,
        };
        if (!Schema.is(Checkpoint)(checkpoint))
          return yield* new PreferenceFailure({ code: "unavailable" });
        yield* disk(() =>
          deps.disk.setItem(key(receipt.installationId), JSON.stringify(checkpoint)),
        );
      }),
  };
}
function decode(raw: string): typeof Checkpoint.Type | null {
  try {
    return Schema.decodeUnknownSync(Checkpoint)(JSON.parse(raw), { onExcessProperty: "error" });
  } catch {
    return null;
  }
}
