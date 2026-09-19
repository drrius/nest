import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { fetch } from "expo/fetch";
import { nativeAuth } from "./native-client";
import { signInWithApple } from "./apple";
import { sessionConfig } from "./config";
import { SessionFailure, type SessionState } from "./contracts";
import { subscribeSession } from "./subscription";
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
  useEffect(() => {
    if (!configuration) {
      publish({ status: "signed_out" });
      return;
    }
    const auth = nativeAuth(configuration);
    let alive = true;
    const unavailable = () => {
      if (alive) publish({ status: "unavailable" });
    };
    const subscription = subscribeSession(
      auth,
      (credentials) =>
        verifySession(configuration.apiUrl, credentials).pipe(
          Effect.provideService(FetchHttpClient.Fetch, fetch),
        ),
      publish,
    );
    runtime.current = { auth, subscription };
    const activate = (active: boolean) => {
      if (active) {
        void auth.startAutoRefresh().catch(unavailable);
        void subscription.refresh();
      } else void auth.stopAutoRefresh().catch(unavailable);
    };
    activate(AppState.currentState === "active");
    const listener = AppState.addEventListener("change", (state) => activate(state === "active"));
    return () => {
      runtime.current = null;
      alive = false;
      listener.remove();
      subscription.dispose();
    };
  }, [publish]);
  return runtime;
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const runtime = useRuntime(setState);
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
        signInWithApple(current.auth).pipe(
          Effect.map((credentials) => current.subscription.signIn(credentials)),
        ),
      );
  };
  const signOut = () => {
    const current = runtime.current;
    if (!current || busy.current) return;
    current.subscription.hide();
    run(
      Effect.tryPromise({
        try: async () => {
          const result = await current.auth.signOut({ scope: "local" });
          if (result.error) throw result.error;
        },
        catch: () => new SessionFailure({ code: "unavailable" }),
      }),
    );
  };
  return (
    <SessionContext
      value={{
        configured: configuration !== null,
        state,
        working,
        error,
        signIn,
        signOut,
        retry: () => {
          void runtime.current?.subscription.refresh();
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
