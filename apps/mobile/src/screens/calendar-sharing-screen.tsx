import { useSyncExternalStore } from "react";
import { useSession } from "../session/provider";
import { useCalendarSharing } from "../calendar/provider";
import type { CalendarRuntime } from "../calendar/runtime";
import { CalendarSharingContent } from "../components/calendar-sharing-content";
import { Page, Note } from "../components/page";
import { SignInCard } from "../components/sign-in-card";
export default function CalendarSharingScreen() {
  const session = useSession(),
    runtime = useCalendarSharing();
  if (session.state.status !== "ready")
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  return runtime ? (
    <Content runtime={runtime} verify={session.retry} />
  ) : (
    <Page>
      <Note>Opening calendar settings…</Note>
    </Page>
  );
}
function Content({ runtime, verify }: { runtime: CalendarRuntime; verify: () => void }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  return (
    <CalendarSharingContent
      key={`${view.consent?.incarnation}:${view.consent?.version}:${view.selection?.status}`}
      runtime={runtime}
      view={view}
      verify={verify}
    />
  );
}
