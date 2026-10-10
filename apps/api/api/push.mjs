import { pushRuntimeHandler } from "../dist/push-runtime.mjs";

export default { fetch: pushRuntimeHandler(process.env) };
