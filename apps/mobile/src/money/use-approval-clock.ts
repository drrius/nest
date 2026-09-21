import { useEffect, useState } from "react";
export function useApprovalClock(expiresAt: string) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const delay = Math.max(0, Math.min(2147483646, Date.parse(expiresAt) - Date.now()));
    const timer = setTimeout(() => setNow(Date.now()), delay + 1);
    return () => clearTimeout(timer);
  }, [expiresAt]);
  return now;
}
