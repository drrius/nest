import type * as Effect from "effect/Effect";
import type { PreferenceFailure } from "./client.ts";
export interface PreferenceCommand<P> {
  readonly operationId: string;
  readonly expectedRevision: string;
  readonly preferences: P;
}
export interface PreferenceProfile<P> {
  readonly revision: string;
  readonly preferences: P;
}
export interface PreferenceClient<P> {
  read: () => Effect.Effect<PreferenceProfile<P> | null, PreferenceFailure>;
  save: (
    command: PreferenceCommand<P>,
  ) => Effect.Effect<{ readonly revision: string }, PreferenceFailure>;
}
export interface PreferenceView<P> {
  profile: PreferenceProfile<P> | null;
  loaded: boolean;
  busy: boolean;
  stage: "form" | "uncertain" | "reload" | "conflict" | "verify";
  notice: string | null;
  generation: number;
}
