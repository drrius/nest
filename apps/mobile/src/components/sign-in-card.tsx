import { Link } from "expo-router";
import * as Apple from "expo-apple-authentication";
import { ActivityIndicator, Text, useColorScheme } from "react-native";
import { Card, Note } from "./page";
import { NativeAction } from "./native-action";
import { useSession } from "../session/provider";
import { useQuiet } from "../theme";

export function SignInCard() {
  const session = useSession();
  const colors = useQuiet();
  const dark = useColorScheme() === "dark";
  if (!session.configured)
    return (
      <Card>
        <Note>This development build needs its household connection configured.</Note>
      </Card>
    );
  if (session.state.status === "logout_pending") return <LogoutCard />;
  if (session.working || session.state.status === "loading")
    return (
      <Card>
        <ActivityIndicator accessibilityLabel="Connecting to your household" />
        <Note>Connecting…</Note>
      </Card>
    );
  return (
    <Card>
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
          <Note>
            {session.state.status === "not_a_member"
              ? "This Apple account is not linked to your household. Use your existing account, or ask for verified account recovery."
              : "Your household could not be verified. Check your connection and try again."}
          </Note>
          <NativeAction label="Try again" onPress={session.retry} />
          <NativeAction label="Sign out" onPress={session.signOut} />
        </>
      )}
      {session.error ? (
        <Text accessibilityRole="alert" style={{ color: colors.text }}>
          {session.error}
        </Text>
      ) : null}
    </Card>
  );
}

function LogoutCard() {
  const { working, signOut, recoverSignOut } = useSession();
  const dark = useColorScheme() === "dark";
  return (
    <Card>
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
    </Card>
  );
}

function ReadySession() {
  const session = useSession();
  const colors = useQuiet();
  if (session.state.status !== "ready") return null;
  return (
    <>
      <Text style={{ color: colors.text, fontSize: 20 }}>
        Welcome, {session.state.member.displayName}.
      </Text>
      <Note>
        {session.state.offline
          ? "Showing your last verified household. Reconnect to refresh access."
          : "Your household identity is verified."}
      </Note>
      <Link href="/household" style={{ color: colors.accent, fontSize: 17, paddingVertical: 16 }}>
        Start quickly
      </Link>
      <Link href="/setup" style={{ color: colors.accent, fontSize: 17, paddingVertical: 16 }}>
        Set up everything
      </Link>
      <NativeAction label="Sign out" onPress={session.signOut} />
    </>
  );
}
