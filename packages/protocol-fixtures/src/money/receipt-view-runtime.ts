import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { ReceiptMetadata, ReceiptTarget, ReceiptLink } from "@nest/contracts/receipt";
import { OfflineFailure } from "../offline/contracts.ts";
import { PreferenceFailure } from "../preferences/client.ts";
import type { ReceiptViewOperations } from "./receipt-view-operations.ts";
type Link = typeof ReceiptLink.Type;
export interface ReceiptView {
  active: boolean;
  online: boolean;
  busy: boolean;
  verify: boolean;
  metadata: ReceiptMetadata | null;
  link: Link | null;
  image: "loading" | "ready" | "failed" | null;
  notice: string | null;
}
export class ReceiptViewRuntime {
  private view: ReceiptView = {
    active: false,
    online: false,
    busy: false,
    verify: false,
    metadata: null,
    link: null,
    image: null,
    notice: null,
  };
  private readonly operations: ReceiptViewOperations;
  private readonly target: ReceiptTarget;
  private readonly now: () => number;
  private request: AbortController | null = null;
  private disposed = false;
  private browser: AbortController | null = null;
  private readonly listeners = new Set<() => void>();
  constructor(operations: ReceiptViewOperations, target: ReceiptTarget, now = Date.now) {
    this.operations = operations;
    this.target = target;
    this.now = now;
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<ReceiptView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private current(request: AbortController) {
    return !this.disposed && this.request === request && !request.signal.aborted;
  }
  private available() {
    return (
      !this.disposed && this.view.active && this.view.online && !this.view.busy && !this.view.verify
    );
  }
  private hide() {
    this.request?.abort();
    this.request = null;
    if (this.browser) {
      this.browser = null;
      void this.operations.close();
    }
    this.publish({ metadata: null, link: null, image: null, notice: null, busy: false });
  }
  setActive = (active: boolean) => {
    if (this.disposed || this.view.active === active) return Promise.resolve();
    this.hide();
    this.publish({ active });
    return active ? this.refresh() : Promise.resolve();
  };
  setOnline = (online: boolean) => {
    if (this.disposed || this.view.online === online) return Promise.resolve();
    this.hide();
    this.publish({ online });
    return online ? this.refresh() : Promise.resolve();
  };
  private async perform(body: (request: AbortController) => Promise<void>) {
    const request = new AbortController();
    this.request = request;
    this.publish({ busy: true, notice: null });
    try {
      await body(request);
    } catch (error) {
      if (this.current(request)) this.failed(error);
    } finally {
      if (this.current(request)) {
        this.request = null;
        this.publish({ busy: false });
      }
    }
  }
  refresh = async () => {
    if (!this.available()) return;
    this.publish({ metadata: null, link: null, image: null });
    await this.perform(async (request) => {
      const metadata = await Effect.runPromise(this.operations.read(this.target), {
        signal: request.signal,
      });
      if (!this.current(request)) return;
      this.publish({ metadata });
      if (!metadata.receipt || metadata.receipt.contentType === "application/pdf") return;
      const link = await Effect.runPromise(this.operations.link(this.target), {
        signal: request.signal,
      });
      if (!this.current(request)) return;
      this.checkLink(link, metadata);
      this.publish({ link, image: "loading" });
    });
  };
  private checkLink(link: Link, metadata: ReceiptMetadata) {
    if (
      link.metadata.receipt?.path !== metadata.receipt?.path ||
      link.metadata.receipt?.contentType !== metadata.receipt?.contentType ||
      Date.parse(link.expiresAt) <= this.now()
    )
      throw new PreferenceFailure({ code: "unavailable" });
  }
  openPdf = async () => {
    const metadata = this.view.metadata;
    if (!this.available() || metadata?.receipt?.contentType !== "application/pdf") return;
    await this.perform(async (request) => {
      const link = await Effect.runPromise(this.operations.link(this.target), {
        signal: request.signal,
      });
      if (!this.current(request)) return;
      this.checkLink(link, metadata);
      this.browser = request;
      try {
        await Effect.runPromise(this.operations.open(link.url), { signal: request.signal });
      } finally {
        if (this.browser === request) this.browser = null;
      }
    });
  };
  imageReady = (link: Link) => {
    if (this.view.link === link && this.view.active) this.publish({ image: "ready" });
  };
  imageFailed = (link: Link) => {
    if (this.view.link === link)
      this.publish({
        link: null,
        image: "failed",
        notice: "Could not load the receipt image. Reload online to try again.",
      });
  };
  private failed(error: unknown) {
    const denied = Schema.is(OfflineFailure)(error)
      ? error.reason === "session_changed"
      : Schema.is(PreferenceFailure)(error) && ["session", "forbidden"].includes(error.code);
    this.publish({
      metadata: null,
      link: null,
      image: null,
      verify: denied,
      notice: denied
        ? "Verify your account before viewing this receipt."
        : "Could not open this receipt. Reload online to try again.",
    });
  }
  dispose = () => {
    if (this.disposed) return;
    this.hide();
    this.publish({ active: false });
    this.disposed = true;
    this.listeners.clear();
  };
}
