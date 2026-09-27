import { useRouter } from "expo-router";
import * as Apple from "expo-apple-authentication";
import { ActivityIndicator, Text, View, useColorScheme } from "react-native";
import { Card, Note } from "./page";
import { NativeAction } from "./native-action";
import { useSession } from "../session/provider";
import { space, type, useQuiet } from "../theme";

export function SignInCard({ welcome = false }: { welcome?: boolean }) {
  const session = useSession();
  const colors = useQuiet();
  const dark = useColorScheme() === "dark";
  const Container = welcome ? WelcomeContent : Card;
  if (!session.configured)
    return (
      <Container>
        <Note>This development build needs its household connection configured.</Note>
      </Container>
    );
  if (session.state.status === "logout_pending") return <LogoutCard welcome={welcome} />;
  if (isConnecting(session.working, session.state.status))
    return (
      <Container>
        <ActivityIndicator accessibilityLabel="Connecting to your household" />
        <Note>Connecting…</Note>
      </Container>
    );
  return (
    <Container>
      {session.state.status === "ready" ? (
        <ReadySession />
      ) : session.state.status === "signed_out" ? (
        <>
          <Note>Sign in with the Apple account already linked to your household.</Note>
          <Apple.AppleAuthenticationButton
            buttonType={Apple.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={
              dark
                ? Apple.AppleAuthenticationButtonStyle.WHITE
                : Apple.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={10}
            style={{ height: 48, width: "100%" }}
            onPress={session.signIn}
          />
        </>
      ) : (
        <>
          <Note>{membershipMessage(session.state.status)}</Note>
          <NativeAction label="Try again" onPress={session.retry} />
          <NativeAction label="Sign out" variant="quiet" onPress={session.signOut} />
        </>
      )}
      {session.error ? (
        <Text accessibilityRole="alert" style={{ color: colors.text }}>
          {session.error}
        </Text>
      ) : null}
    </Container>
  );
}

function membershipMessage(status: string) {
  return status === "not_a_member"
    ? "This Apple account is not linked to your household. Use your existing account, or ask for verified account recovery."
    : "Your household could not be verified. Check your connection and try again.";
}

function isConnecting(working: boolean, status: string) {
  return working || status === "loading";
}

function WelcomeContent({ children }: { children: React.ReactNode }) {
  return <View style={{ gap: space.large }}>{children}</View>;
}

function LogoutCard({ welcome }: { welcome: boolean }) {
  const { working, signOut, recoverSignOut } = useSession();
  const dark = useColorScheme() === "dark";
  const Container = welcome ? WelcomeContent : Card;
  return (
    <Container>
      <Note>
        {working
          ? "Signing out…"
          : "Sign-out could not finish. Your household is hidden while Nest stops this session’s notifications and removes saved credentials. Unlock your phone, check your connection and try again."}
      </Note>
      {working ? (
        <ActivityIndicator accessibilityLabel="Signing out" />
      ) : (
        <>
          <NativeAction label="Retry sign-out" onPress={signOut} />
          <Note>
            If retry cannot finish, verify the same Apple account to stop the old session’s
            notifications.
          </Note>
          <Apple.AppleAuthenticationButton
            buttonType={Apple.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={
              dark
                ? Apple.AppleAuthenticationButtonStyle.WHITE
                : Apple.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={10}
            style={{ height: 48, width: "100%" }}
            onPress={recoverSignOut}
          />
        </>
      )}
    </Container>
  );
}

function ReadySession() {
  const session = useSession();
  const colors = useQuiet();
  const router = useRouter();
  if (session.state.status !== "ready") return null;
  return (
    <View style={{ gap: space.large }}>
      <View style={{ gap: space.small }}>
        <Text style={{ ...type.title, color: colors.text }}>
          Welcome, {session.state.member.displayName}.
        </Text>
        <Note>
          {session.state.offline
            ? "You’re offline. You can still open your saved household."
            : "Start with today. You can make Nest your own as you go."}
        </Note>
      </View>
      <View style={{ gap: space.small }}>
        <NativeAction
          variant="primary"
          label="Get started"
          onPress={() => router.push("/household")}
        />
        <NativeAction
          label="Set up everything"
          variant="secondary"
          onPress={() => router.push("/setup")}
        />
      </View>
      <NativeAction label="Sign out" variant="quiet" onPress={session.signOut} />
    </View>
  );
}
