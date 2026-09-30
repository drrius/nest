export interface PushPermission {
  status: "allowed" | "quiet" | "temporary" | "denied" | "undetermined" | "unknown";
  canAskAgain: boolean;
}
export function pushPermission(input: {
  granted: boolean;
  canAskAgain: boolean;
  ios?: { status: number };
}): PushPermission {
  const states = ["undetermined", "denied", "allowed", "quiet", "temporary"] as const;
  const status = input.ios
    ? (states[input.ios.status] ?? "unknown")
    : input.granted
      ? "allowed"
      : "unknown";
  return { status, canAskAgain: input.canAskAgain };
}
export const allowsPush = (permission: PushPermission) =>
  ["allowed", "quiet", "temporary"].includes(permission.status);
