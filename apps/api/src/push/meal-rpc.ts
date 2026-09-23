import type { pushWorkerRpc } from "./worker-rpc.ts";
/** Separate persisted scan progress; delivery attempts and receipt polling stay shared. */
export function mealPushRpc(
  rpc: ReturnType<typeof pushWorkerRpc>,
): ReturnType<typeof pushWorkerRpc> {
  return (method, input) => {
    if (method === "readCheckpoint") return rpc("mealReadCheckpoint", input);
    if (method === "saveCheckpoint") return rpc("mealSaveCheckpoint", input);
    if (method === "scan") return rpc("mealScan", input);
    return rpc(method, input);
  };
}
