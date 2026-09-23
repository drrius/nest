import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { PushDeviceReceipt, PushDeviceCommand } from "@nest/contracts/push-registration";
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
  cancelled: (command: PushDeviceCommand) => Effect.Effect<void, PreferenceFailure>;
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
// A verified receipt or explicit cancellation can suppress redundant rotation.
// Corrupt protected state fails closed rather than forgetting cancellation.
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
    cancelled: (command) =>
      Effect.gen(function* () {
        if (command.action !== "register" || command.expectedRevision === null) return;
        const digest = yield* deps.hash(command.token);
        const checkpoint = {
          version: 1 as const,
          actor,
          household,
          installationId: command.installationId,
          revision: command.expectedRevision,
          digest,
        };
        if (!Schema.is(Checkpoint)(checkpoint))
          return yield* new PreferenceFailure({ code: "unavailable" });
        yield* disk(() =>
          deps.disk.setItem(key(command.installationId), JSON.stringify(checkpoint)),
        );
      }),
    matches: (installationId, revision, token) =>
      Effect.gen(function* () {
        const raw = yield* disk(() => deps.disk.getItem(key(installationId)));
        if (raw === null || revision === null) return false;
        const saved = yield* Effect.try({
          try: () => decode(raw),
          catch: () => new PreferenceFailure({ code: "unavailable" }),
        });
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
function decode(raw: string): typeof Checkpoint.Type {
  return Schema.decodeUnknownSync(Checkpoint)(JSON.parse(raw), { onExcessProperty: "error" });
}
