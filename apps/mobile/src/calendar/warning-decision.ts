// A dismissed or abandoned native warning must never invoke a stale save callback.
export function warningDecision(
  signal: AbortSignal,
  present: (decide: (accepted: boolean) => void) => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    let finished = false;
    const decide = (accepted: boolean) => {
      if (finished) return;
      finished = true;
      signal.removeEventListener("abort", cancel);
      resolve(accepted && !signal.aborted);
    };
    const cancel = () => decide(false);
    signal.addEventListener("abort", cancel, { once: true });
    try {
      present(decide);
    } catch {
      decide(false);
    }
  });
}
