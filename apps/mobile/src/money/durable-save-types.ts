import type * as Effect from "effect/Effect";
import type { OfflineFailure } from "../offline/contracts.ts";
import type { PreferenceFailure } from "../preferences/client.ts";
export interface SaveAttempt<C> {
  command: C;
  action: "save" | "cancel";
}
export interface SaveOutcome {
  status: "unresolved" | "recorded" | "cancelled";
}
export interface DurableSaveView<C, R> {
  active: boolean;
  online: boolean;
  busy: boolean;
  fresh: boolean;
  verify: boolean;
  attempt: SaveAttempt<C> | null;
  result: R | null;
  notice: string | null;
}
export interface DurableSaveOperations<C, R> {
  saved: () => Effect.Effect<SaveAttempt<C> | null, OfflineFailure>;
  stage: (
    attempt: SaveAttempt<C>,
    current: () => boolean,
  ) => Effect.Effect<unknown, OfflineFailure>;
  clear: (attempt: SaveAttempt<C>) => Effect.Effect<unknown, OfflineFailure>;
  read: (attempt: SaveAttempt<C>) => Effect.Effect<R, OfflineFailure | PreferenceFailure>;
  send: (attempt: SaveAttempt<C>) => Effect.Effect<R, OfflineFailure | PreferenceFailure>;
}
export interface DurableSaveOptions<C> {
  prepare: (input: C) => SaveAttempt<C>;
  label: string;
}
