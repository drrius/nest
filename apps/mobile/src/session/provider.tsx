import { sessionPushDevices } from "./push-client";
import { finishNativePushLogout } from "../push/native-logout";
import { sessionRenewalReminders } from "./renewal-reminder-client";
import type { RenewalReminderClient } from "../renewal-reminders/client";
import { nativeReceiptStorage } from "../money/receipt-upload-native";
import { sessionRenewals } from "./renewal-client";
import type { RenewalClient } from "../renewals/client";
import { sessionMoney } from "./money-client";
import type { MoneyClient } from "../money/client";
import { sessionMeals } from "./meal-client";
import type { MealClient } from "../meals/client";
import { sessionRoutines } from "./routine-client";
import type { RoutineClient } from "../routines/client";
import { sessionSetup } from "./setup-client";
import type { SetupClient } from "../setup/client";
import { sessionNotification } from "./notification-client";
import type { NotificationClient } from "../notifications/client";
import { sessionCalendar } from "./calendar-client";
import type { CalendarClient } from "../calendar/client";
import { sessionAssistant } from "./assistant-client";
import { sessionFood } from "./food-client";
import { sessionMemory } from "./memory-client";
import type { MemoryClient } from "../memory/client";
import { sessionCooking } from "./cooking-client";
import type { CookingClient } from "../cooking/client";
import type { FoodClient } from "../food/client";
import type { AssistantClient } from "../assistant/client";
import { sessionGroceries } from "./grocery-client";
import type { GroceryClient } from "../groceries/client";
import {
  createContext,
  useContext,
  useMemo,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { fetch } from "expo/fetch";
import { sessionChores } from "./chore-client";
import type { ChoreClient } from "../chores/client";
import {
  nativeAuth,
  offlineIdentity,
  beginLocalLogout,
  beginLocalSignIn,
  logoutCredentials,
} from "./native-client";
import { signInWithApple } from "./apple";
import { sessionConfig } from "./config";
import { SessionFailure, type SessionState, type Member } from "./contracts";
import { subscribeSession } from "./subscription";
import { signOutSession } from "./sign-out";
import { verifySession } from "./verification";

const configuration = (() => {
  try {
    return sessionConfig(
      {
        supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
        publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        apiUrl: process.env.EXPO_PUBLIC_API_URL,
      },
      __DEV__,
    );
  } catch {
    return null;
  }
})();
type Runtime = {
  auth: ReturnType<typeof nativeAuth>;
  subscription: ReturnType<typeof subscribeSession>;
};
interface SessionContextValue {
  pushDevices: ReturnType<typeof sessionPushDevices> | null;
  renewals: RenewalClient | null;
  renewalReminders: RenewalReminderClient | null;
  money: MoneyClient | null;
  meals: MealClient | null;
  routines: RoutineClient | null;
  setup: SetupClient | null;
  notification: NotificationClient | null;
  calendar: CalendarClient | null;
  memory: MemoryClient | null;
  cooking: CookingClient | null;
  food: FoodClient | null;
  assistant: AssistantClient | null;
  chores: ChoreClient | null;
  groceries: GroceryClient | null;
  configured: boolean;
  state: SessionState;
  working: boolean;
  error: string | null;
  signIn: () => void;
  signOut: () => void;
  retry: () => void;
}
const SessionContext = createContext<SessionContextValue | null>(null);

function useRuntime(publish: (state: SessionState) => void) {
  const runtime = useRef<Runtime | null>(null);
  const [generation, restart] = useState(0);
  useEffect(() => {
    if (!configuration) {
      publish({ status: "signed_out" });
      return;
    }
    let disposed = false;
    let disposeRuntime = () => {};
    void logoutCredentials
      .read()
      .then((pending) => {
        if (disposed) return;
        const auth = nativeAuth(configuration);
        const subscription = subscribeSession(
          auth,
          (credentials) =>
            verifySession(configuration.apiUrl, credentials).pipe(
              Effect.provideService(FetchHttpClient.Fetch, fetch),
            ),
          publish,
          offlineIdentity,
        );
        if (pending) subscription.hide();
        runtime.current = { auth, subscription };
        const activate = (active: boolean) => {
          if (active && subscription.canRefresh()) {
            void auth.startAutoRefresh().catch(subscription.unavailable);
            void subscription.refresh();
          } else void auth.stopAutoRefresh().catch(subscription.unavailable);
        };
        activate(AppState.currentState === "active");
        const listener = AppState.addEventListener("change", (state) =>
          activate(state === "active"),
        );
        disposeRuntime = () => {
          runtime.current = null;
          listener.remove();
          subscription.dispose();
        };
      })
      .catch(() => {
        if (!disposed) publish({ status: "unavailable" });
      });
    return () => {
      disposed = true;
      disposeRuntime();
    };
  }, [publish, generation]);
  return [runtime, () => restart((value) => value + 1)] as const;
}

function usePreferenceClients(member: Member | null, runtime: ReturnType<typeof useRuntime>[0]) {
  const actor = member?.userId,
    household = member?.householdId;
  return useMemo(() => {
    if (!actor || !household || !runtime.current || !configuration)
      return {
        food: null,
        cooking: null,
        memory: null,
        calendar: null,
        notification: null,
        setup: null,
        routines: null,
        meals: null,
        money: null,
        renewals: null,
        renewalReminders: null,
        pushDevices: null,
      };
    const { auth } = runtime.current;
    return {
      pushDevices: sessionPushDevices(auth, { actor, household }, configuration.apiUrl),
      renewalReminders: sessionRenewalReminders(auth, { actor, household }, configuration.apiUrl),
      renewals: sessionRenewals(auth, { actor, household }, configuration.apiUrl),
      routines: sessionRoutines(auth, { actor, household }, configuration.apiUrl),
      meals: sessionMeals(auth, { actor, household }, configuration.apiUrl),
      money: sessionMoney(
        auth,
        { actor, household },
        configuration.apiUrl,
        nativeReceiptStorage(configuration),
      ),
      setup: sessionSetup(auth, { actor, household }, configuration.apiUrl),
      notification: sessionNotification(auth, { actor, household }, configuration.apiUrl),
      calendar: sessionCalendar(auth, { actor, household }, configuration.apiUrl),
      memory: sessionMemory(auth, { actor, household }, configuration.apiUrl),
      food: sessionFood(auth, { actor, household }, configuration.apiUrl),
      cooking: sessionCooking(auth, { actor, household }, configuration.apiUrl),
    };
  }, [actor, household, runtime]);
}

function logout(current: Runtime) {
  if (!configuration) return Effect.void;
  return signOutSession(
    current.auth,
    current.subscription,
    beginLocalLogout,
    finishNativePushLogout(configuration, current.auth),
  );
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const [runtime, restartRuntime] = useRuntime(setState);
  const member = state.status === "ready" ? state.member : null;
  const preferenceClients = usePreferenceClients(member, runtime);
  const { chores, groceries, assistant } = useMemo(() => {
    if (!member || !runtime.current || !configuration)
      return { chores: null, groceries: null, assistant: null };
    const { auth } = runtime.current;
    return {
      chores: sessionChores(auth, member, configuration.apiUrl),
      groceries: sessionGroceries(auth, member, configuration.apiUrl),
      assistant: sessionAssistant(auth, member, configuration.apiUrl),
    };
  }, [member, runtime]);
  const run = (action: Effect.Effect<void, SessionFailure>) => {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    setError(null);
    void Effect.runPromise(action)
      .catch((failure: SessionFailure) => {
        if (failure.code !== "cancelled") setError("Could not finish. Please try again.");
      })
      .finally(() => {
        busy.current = false;
        setWorking(false);
      });
  };
  const signIn = () => {
    const current = runtime.current;
    if (current)
      run(
        Effect.tryPromise({
          try: beginLocalSignIn,
          catch: () => new SessionFailure({ code: "unavailable" }),
        }).pipe(
          Effect.flatMap(() => signInWithApple(current.auth)),
          Effect.flatMap((credentials) =>
            Effect.promise(() => current.subscription.signIn(credentials)),
          ),
        ),
      );
  };
  const signOut = () => {
    const current = runtime.current;
    if (!current || !configuration || busy.current) return;
    run(logout(current));
  };
  return (
    <SessionContext
      value={{
        ...preferenceClients,
        chores,
        groceries,
        assistant,
        configured: configuration !== null,
        state,
        working,
        error,
        signIn,
        signOut,
        retry: () => {
          if (runtime.current) void runtime.current.subscription.refresh();
          else restartRuntime();
        },
      }}
    >
      {children}
    </SessionContext>
  );
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("SessionProvider missing");
  return value;
}
