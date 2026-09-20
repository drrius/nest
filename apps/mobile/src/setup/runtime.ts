import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { SetupStatus } from "@nest/contracts/setup";
import { PreferenceFailure } from "../preferences/client.ts";
import type { SetupClient } from "./client.ts";
export type SetupView = {
  status: SetupStatus | null;
  busy: boolean;
  error: string | null;
  verify: boolean;
};
export class SetupRuntime {
  private view: SetupView = { status: null, busy: false, error: null, verify: false };
  private controller: AbortController | null = null;
  private disposed = false;
  private listeners = new Set<() => void>();
  private readonly client: SetupClient;
  constructor(client: SetupClient) {
    this.client = client;
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<SetupView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  load = async () => {
    if (this.disposed || this.view.busy) return;
    const controller = new AbortController();
    this.controller = controller;
    this.publish({ busy: true, error: null, status: null });
    try {
      const status = await Effect.runPromise(this.client.read(), { signal: controller.signal });
      if (this.controller === controller) this.publish({ status, verify: false });
    } catch (error) {
      if (this.controller !== controller) return;
      this.failed(error);
    } finally {
      if (this.controller === controller) {
        this.controller = null;
        this.publish({ busy: false });
      }
    }
  };
  private failed(error: unknown) {
    const denied =
      Schema.is(PreferenceFailure)(error) &&
      (error.code === "session" || error.code === "forbidden");
    this.publish({
      status: null,
      verify: denied || this.view.verify,
      error: denied
        ? "Verify your account before reviewing setup."
        : "Could not check saved setup. Try again online. Your choices have not changed.",
    });
  }
  cancel = () => {
    const controller = this.controller;
    this.controller = null;
    controller?.abort();
    this.publish({ busy: false });
  };
  dispose = () => {
    this.disposed = true;
    this.cancel();
    this.view = { status: null, busy: false, error: null, verify: false };
    this.listeners.clear();
  };
}
