import * as Effect from "effect/Effect";
import type { Account } from "../offline/contracts.ts";
import type { PreferenceFailure } from "../preferences/client.ts";
import type { pushDeviceClient } from "./client.ts";
import type { protectedPushAttempts } from "./protected-attempt.ts";
import type { PushPermission } from "./permission.ts";
import { pushEnrollmentOperations } from "./operations.ts";
import { pushEnrollmentActions } from "./enrollment-actions.ts";
export interface EnrollmentDependencies {
  account: Account;
  client: ReturnType<typeof pushDeviceClient>;
  store: ReturnType<typeof protectedPushAttempts>;
  installation: Effect.Effect<string, PreferenceFailure>;
  readInstallation: Effect.Effect<string | null, PreferenceFailure>;
  permission: Effect.Effect<PushPermission, PreferenceFailure>;
  token: Effect.Effect<string, PreferenceFailure>;
  operationId: () => string;
}
export interface EnrollmentView {
  loaded: boolean;
  busy: boolean;
  enabled: boolean | null;
  pending: boolean;
  permission: PushPermission;
  notice: string | null;
}
const initial: EnrollmentView = {
  loaded: false,
  busy: false,
  enabled: null,
  pending: false,
  permission: { status: "unknown", canAskAgain: false },
  notice: null,
};
export class PushEnrollmentRuntime {
  private view = initial;
  private disposed = false;
  private readonly lifetime = new AbortController();
  private readonly listeners = new Set<() => void>();
  private readonly deps: EnrollmentDependencies;
  private readonly operations: ReturnType<typeof pushEnrollmentOperations>;
  private readonly actions: ReturnType<typeof pushEnrollmentActions>;
  constructor(deps: EnrollmentDependencies) {
    this.deps = deps;
    const current = () => !this.disposed;
    this.operations = pushEnrollmentOperations({ ...deps, current });
    this.actions = pushEnrollmentActions({ ...deps, current, operations: this.operations });
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<EnrollmentView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private run<A>(effect: Effect.Effect<A, PreferenceFailure>) {
    return Effect.runPromise(effect, { signal: this.lifetime.signal });
  }
  private async read(failed: boolean) {
    const permission = await this.run(this.deps.permission);
    const recovery = await this.run(this.operations.recover());
    const installation = await this.run(this.deps.readInstallation);
    const state =
      installation === null ? null : await this.run(this.deps.client.detail(installation));
    const pending = recovery?.status === "unresolved";
    this.publish({
      loaded: true,
      permission,
      enabled: state?.enabled ?? false,
      pending,
      notice:
        recovery?.status === "recorded"
          ? "Your previous change was confirmed."
          : pending
            ? "A saved change needs confirmation. Retry that change before making another."
            : failed
              ? "Could not finish. Check this iPhone’s permission and connection, then try again."
              : null,
    });
  }
  private async perform(effect?: Effect.Effect<unknown, PreferenceFailure>) {
    if (this.disposed || this.view.busy) return;
    this.publish({ busy: true, notice: null });
    let failed = false;
    try {
      if (effect) await this.run(effect);
    } catch {
      failed = true;
    }
    try {
      await this.read(failed);
    } catch {
      this.publish({
        loaded: false,
        enabled: null,
        notice: "Could not check this iPhone’s registration. Reconnect and try again.",
      });
    } finally {
      this.publish({ busy: false });
    }
  }
  load = () => this.perform();
  enable = async () => {
    if (this.view.loaded && !this.view.pending) await this.perform(this.actions.enable());
  };
  disable = async () => {
    if (this.view.loaded && !this.view.pending) await this.perform(this.actions.disable());
  };
  retry = async () => {
    if (this.view.loaded && this.view.pending) await this.perform(this.operations.retryPending());
  };
  dispose() {
    this.disposed = true;
    this.lifetime.abort();
    this.view = initial;
    this.listeners.clear();
  }
}
