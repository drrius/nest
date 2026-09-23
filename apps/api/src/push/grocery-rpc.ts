import type { pushWorkerRpc } from "./worker-rpc.ts";
/** Separate persisted scan progress; delivery attempts and receipt polling stay shared. */
export function groceryPushRpc(
  rpc: ReturnType<typeof pushWorkerRpc>,
): ReturnType<typeof pushWorkerRpc> {
  return (method, input) => {
    if (method === "readCheckpoint") return rpc("groceryReadCheckpoint", input);
    if (method === "saveCheckpoint") return rpc("grocerySaveCheckpoint", input);
    if (method === "scan") return rpc("groceryScan", input);
    return rpc(method, input);
  };
}
