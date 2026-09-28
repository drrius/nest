import * as Redacted from "effect/Redacted";
import { createReceiptUploadHandler } from "../../../packages/receipt-upload/src/handler.ts";
import { receiptPublishableKey } from "./configuration.ts";
const url = Deno.env.get("SUPABASE_URL");
const publishableKey = receiptPublishableKey(
  Deno.env.get("NEST_SUPABASE_PUBLISHABLE_KEY"),
  Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"),
);
const credential = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const handler =
  url && publishableKey && credential
    ? createReceiptUploadHandler({ url, publishableKey, credential: Redacted.make(credential) })
    : () =>
        Promise.resolve(
          Response.json(
            { error: { code: "unavailable" } },
            { status: 503, headers: { "Cache-Control": "no-store" } },
          ),
        );
Deno.serve(handler);
