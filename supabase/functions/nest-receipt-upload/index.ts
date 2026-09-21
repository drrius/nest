import * as Redacted from "effect/Redacted";
import { createReceiptUploadHandler } from "../../../packages/receipt-upload/src/handler.ts";
const url = Deno.env.get("SUPABASE_URL");
const publishableKey = Deno.env.get("NEST_SUPABASE_PUBLISHABLE_KEY");
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
