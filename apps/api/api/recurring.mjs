import { recurringRuntimeHandler } from "../dist/recurring-runtime.mjs";

// Keep the original request, including cancellation, at the scheduler boundary.
export default { fetch: recurringRuntimeHandler(process.env) };
