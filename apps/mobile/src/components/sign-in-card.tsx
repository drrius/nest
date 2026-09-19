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
        <>
          <Text style={{ color: colors.text, fontSize: 20 }}>
            Welcome, {session.state.member.displayName}.
          </Text>
          <Note>
            Your household identity is verified. Daily services are being connected in this
            development build.
          </Note>
          <NativeAction label="Sign out" onPress={session.signOut} />
        </>
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
