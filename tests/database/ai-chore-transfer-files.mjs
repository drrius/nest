import { aiChoreChangeFiles } from "./ai-chore-change-files.mjs";
import { choreTransferFiles } from "./chore-transfer-files.mjs";
export const aiChoreTransferFiles = [...new Set([...choreTransferFiles, ...aiChoreChangeFiles])];
