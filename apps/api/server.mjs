import { runtimeHandler } from "./runtime.mjs";
import { nodeServer } from "./node-server.mjs";

// Vercel captures the listening server; the shared adapter preserves streaming
// and cancellation, while every data route retains bearer/member authorization.
nodeServer(runtimeHandler(process.env)).listen(Number(process.env.PORT ?? "3000"));
