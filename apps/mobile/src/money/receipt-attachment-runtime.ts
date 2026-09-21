import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { OfflineFailure } from "../offline/contracts.ts";
import { PreferenceFailure } from "../preferences/client.ts";
import {
  ReceiptSelectionFailure,
  type ReceiptKind,
  type SelectedReceipt,
} from "./receipt-selection.ts";
import type { ReceiptAttachmentOperations } from "./receipt-attachment-operations.ts";
export interface ReceiptAttachmentView {
  active: boolean;
  online: boolean;
  busy: "selecting" | "uploading" | null;
  status: "empty" | "selected" | "uncertain" | "uploaded";
  contentType: string | null;
  path: string | null;
  verify: boolean;
  notice: string | null;
}
export class ReceiptAttachmentRuntime {
  private view: ReceiptAttachmentView = {
    active: false,
    online: false,
    busy: null,
    status: "empty",
    contentType: null,
    path: null,
    verify: false,
    notice: null,
  };
  private file: SelectedReceipt | null = null;
  private path: string | null = null;
  private request: AbortController | null = null;
  private disposed = false;
  private readonly listeners = new Set<() => void>();
  private readonly operations: ReceiptAttachmentOperations;
  constructor(operations: ReceiptAttachmentOperations) {
    this.operations = operations;
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<ReceiptAttachmentView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    this.view.path = this.view.active ? this.path : null;
    this.view.contentType = this.view.active ? (this.file?.input.contentType ?? null) : null;
    for (const listener of this.listeners) listener();
  }
  private available() {
    return (
      !this.disposed && this.view.active && this.view.online && !this.view.verify && !this.view.busy
    );
  }
  private current(request: AbortController) {
    return !this.disposed && this.request === request && !request.signal.aborted;
  }
  private stopUpload() {
    if (this.view.busy !== "uploading") return;
    this.request?.abort();
    this.request = null;
    this.publish({
      busy: null,
      status: "uncertain",
      notice: "Upload interrupted. Retry the same receipt online to check its outcome.",
    });
  }
  setActive = (active: boolean) => {
    if (!active) this.stopUpload();
    // A system picker can temporarily make the app inactive. Its result still
    // passes the account lease check and remains hidden until this screen is active.
    this.publish({ active });
  };
  setOnline = (online: boolean) => {
    if (!online) this.stopUpload();
    this.publish({ online });
  };
  private async perform(
    kind: "selecting" | "uploading",
    body: (request: AbortController) => Promise<void>,
  ) {
    const request = new AbortController();
    this.request = request;
    this.publish({ busy: kind, notice: null });
    try {
      await body(request);
    } catch (error) {
      if (this.current(request)) this.failed(error);
    } finally {
      if (this.current(request)) {
        this.request = null;
        this.publish({ busy: null });
      }
    }
  }
  select = async (kind: ReceiptKind) => {
    if (!this.available() || this.view.status !== "empty") return;
    await this.perform("selecting", async (request) => {
      const file = await Effect.runPromise(this.operations.select(kind), {
        signal: request.signal,
      });
      if (!this.current(request) || !file) return;
      this.file = file;
      this.publish({ status: "selected" });
    });
  };
  upload = async () => {
    const file = this.file;
    if (!this.available() || !file || this.view.status === "uploaded") return;
    this.publish({ status: "uncertain" });
    await this.perform("uploading", async (request) => {
      const result = await Effect.runPromise(this.operations.upload(file), {
        signal: request.signal,
      });
      if (!this.current(request)) return;
      this.path = result.path;
      this.publish({
        status: "uploaded",
        notice: "Receipt uploaded. It will be attached only when you save the expense.",
      });
    });
  };
  clearSelection = () => {
    if (this.disposed || this.view.busy || this.view.status !== "selected") return;
    this.file = null;
    this.publish({ status: "empty", notice: null });
  };
  private failed(error: unknown) {
    const denied = Schema.is(OfflineFailure)(error)
      ? error.reason === "session_changed"
      : Schema.is(PreferenceFailure)(error) && ["session", "forbidden"].includes(error.code);
    if (denied) {
      this.file = null;
      this.path = null;
    }
    let notice = "Could not upload the receipt. Retry online using the same selection.";
    if (this.view.busy === "selecting") notice = selectionNotice(error);
    this.publish({
      verify: denied,
      notice: denied ? "Verify your account before attaching a receipt." : notice,
    });
  }
  dispose = () => {
    if (this.disposed) return;
    this.request?.abort();
    this.request = null;
    this.file = null;
    this.path = null;
    this.publish({ active: false, busy: null, status: "empty" });
    this.disposed = true;
    this.listeners.clear();
  };
}
function selectionNotice(error: unknown) {
  if (!Schema.is(ReceiptSelectionFailure)(error)) return "Could not select a receipt. Try again.";
  if (error.reason === "too_large") return "Choose a receipt smaller than 4 MiB.";
  if (error.reason === "unsupported") return "Choose a supported photo or PDF receipt.";
  return "Could not read the selected receipt. Try again.";
}
