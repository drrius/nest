import { runtimeHandler } from "../dist/runtime.mjs";

// Forward the original Web Request so bearer headers, streaming bodies and
// cancellation use the same authorized handler as local execution.
export default { fetch: runtimeHandler(process.env) };
