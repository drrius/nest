export function receiptPublishableKey(explicit: string | undefined, defaults: string | undefined) {
  if (explicit !== undefined) return explicit.startsWith("sb_publishable_") ? explicit : undefined;
  try {
    const parsed: unknown = JSON.parse(defaults ?? "{}");
    if (typeof parsed !== "object" || parsed === null || !("default" in parsed)) return undefined;
    return typeof parsed.default === "string" && parsed.default.startsWith("sb_publishable_")
      ? parsed.default
      : undefined;
  } catch {
    return undefined;
  }
}
