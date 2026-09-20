import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { useSession } from "../session/provider";
import { memoryOwner } from "../memory/owner";
import type { MemoryClient } from "../memory/client";
import type { MemoryRuntime } from "../memory/runtime";
import { MemoryContentView } from "../components/memory-content";
import { Page, Note } from "../components/page";
import { SignInCard } from "../components/sign-in-card";
export default function MemoryScreen() {
  const session = useSession();
  const params = useLocalSearchParams<{ approvalId?: string }>();
  const approvalId = typeof params.approvalId === "string" ? params.approvalId : null;
  if (session.state.status !== "ready" || !session.memory)
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  return (
    <Memories
      key={`${session.state.member.userId}:${session.state.member.householdId}:${approvalId ?? ""}`}
      client={session.memory}
      approvalId={approvalId}
      verify={session.retry}
    />
  );
}
function Memories({
  client,
  approvalId,
  verify,
}: {
  client: MemoryClient;
  approvalId: string | null;
  verify: () => void;
}) {
  const [owner] = useState(() => memoryOwner(client, Crypto.randomUUID, approvalId));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <Content runtime={runtime} verify={verify} />
  ) : (
    <Page>
      <Note>Loading private memory…</Note>
    </Page>
  );
}
function Content({ runtime, verify }: { runtime: MemoryRuntime; verify: () => void }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  return <MemoryContentView key={view.generation} runtime={runtime} view={view} verify={verify} />;
}
