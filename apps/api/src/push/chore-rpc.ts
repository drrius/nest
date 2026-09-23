import type { pushWorkerRpc } from "./worker-rpc.ts";
/** Separate persisted scan progress; delivery attempts and receipt polling stay shared. */
export function chorePushRpc(
  rpc: ReturnType<typeof pushWorkerRpc>,
): ReturnType<typeof pushWorkerRpc> {
  return (method, input) => {
    if (method === "readCheckpoint") return rpc("choreReadCheckpoint", input);
    if (method === "saveCheckpoint") return rpc("choreSaveCheckpoint", input);
    if (method === "scan") return rpc("choreScan", input);
    return rpc(method, input);
  };
}
