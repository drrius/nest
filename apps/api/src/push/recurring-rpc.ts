import type { pushWorkerRpc } from "./worker-rpc.ts";
/** Separate persisted scan progress; delivery attempts and receipt polling stay shared. */
export function recurringPushRpc(
  rpc: ReturnType<typeof pushWorkerRpc>,
): ReturnType<typeof pushWorkerRpc> {
  return (method, input) => {
    if (method === "readCheckpoint") return rpc("recurringReadCheckpoint", input);
    if (method === "saveCheckpoint") return rpc("recurringSaveCheckpoint", input);
    if (method === "scan") return rpc("recurringScan", input);
    return rpc(method, input);
  };
}
