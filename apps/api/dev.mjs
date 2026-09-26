import { runtimeHandler } from "./runtime.mjs";
import { nodeServer } from "./node-server.mjs";

const port = Number(process.env.NEST_API_PORT ?? "8787");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid NEST_API_PORT");
const server = nodeServer(runtimeHandler(process.env));
server.listen(port, "127.0.0.1", () =>
  process.stdout.write(`Nest development API: http://127.0.0.1:${port}\n`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    server.close();
    server.closeAllConnections();
  });
