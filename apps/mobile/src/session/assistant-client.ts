import type { SupabaseClient } from "@supabase/supabase-js";
import { fetch } from "expo/fetch";
import { assistantClient } from "../assistant/client";
import { sessionCredentials } from "./credentials";
import type { Member } from "./contracts";
export const sessionAssistant = (auth: SupabaseClient["auth"], member: Member, apiUrl: string) =>
  assistantClient(
    apiUrl,
    { actor: member.userId, household: member.householdId },
    sessionCredentials(auth),
    fetch,
  );
