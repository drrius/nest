import * as Effect from "effect/Effect";
import { fixture as sqlite, account, run } from "./offline-fixture.mjs";
import { ReceiptViewRuntime } from "../src/money/receipt-view-runtime.ts";
import { receiptViewOperations } from "../src/money/receipt-view-operations.ts";
export { Effect, account, run };
export const target = { eventId: "40000000-0000-4000-8000-000000000001" };
export const metadata = {
  version: 1,
  householdId: account.household,
  target,
  receipt: {
    path: `${account.household}/receipts/40000000-0000-4000-8000-000000000002.jpg`,
    contentType: "image/jpeg",
    bytes: "128",
  },
};
export function link(value = metadata) {
  return {
    metadata: value,
    url: `https://fixture.supabase.co/storage/v1/object/sign/household-files/${value.receipt.path}?token=a.b.c`,
    expiresAt: "2030-01-01T00:00:00.000Z",
  };
}
export async function fixture(t) {
  const db = await sqlite(t);
  let value = structuredClone(metadata),
    links = 0,
    reads = 0,
    opens = 0,
    closes = 0;
  const client = {
    receipt: () =>
      Effect.sync(() => {
        reads++;
        return structuredClone(value);
      }),
    receiptLink: () =>
      Effect.sync(() => {
        links++;
        return link(structuredClone(value));
      }),
  };
  let open = async () => {};
  const browser = {
    open: async (url) => {
      opens++;
      await open(url);
    },
    close: async () => {
      closes++;
    },
  };
  const operations = receiptViewOperations(
    { store: db.store, session: db.session },
    client,
    browser,
  );
  const runtime = new ReceiptViewRuntime(operations, target, () => 1);
  t.after(() => runtime.dispose());
  return {
    db,
    client,
    browser,
    operations,
    runtime,
    counts: () => ({ links, reads, opens, closes }),
    value: (next) => {
      value = next;
    },
    open: (next) => {
      open = next;
    },
  };
}
