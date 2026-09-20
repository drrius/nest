import type { AssistantMessage } from "@nest/ai/chat";
import { Link } from "expo-router";
import { Text } from "react-native";
import { Card, Note } from "./page";
import { actionResult } from "../assistant/action-result";
import { useQuiet } from "../theme";
export function AssistantMessageCard({ message }: { message: AssistantMessage }) {
  const colors = useQuiet();
  return (
    <Card>
      <Text accessibilityRole="header" style={{ color: colors.muted, fontSize: 15 }}>
        {message.role === "user" ? "You" : "Nest"}
      </Text>
      {message.parts.map((part, index) => {
        if (part.type === "text")
          return (
            <Text
              key={index}
              selectable
              style={{ color: colors.text, fontSize: 17, lineHeight: 25 }}
            >
              {part.text}
            </Text>
          );
        if (part.type === "tool-listChores")
          return (
            <Link
              key={index}
              href="/household"
              style={{ color: colors.accent, fontSize: 17, paddingVertical: 8 }}
            >
              Open chores
            </Link>
          );
        if (part.type === "tool-listGroceries" || part.type === "tool-listGroceryCategories")
          return (
            <Link
              key={index}
              href="/checklist"
              style={{ color: colors.accent, fontSize: 17, paddingVertical: 8 }}
            >
              Open groceries
            </Link>
          );
        const action = actionResult(part);
        return action ? (
          <Link
            key={index}
            href={action.href}
            style={{ color: colors.accent, fontSize: 17, paddingVertical: 8 }}
          >
            {action.label}
          </Link>
        ) : null;
      })}
      {message.parts.length === 0 ? <Note>No response content was saved.</Note> : null}
    </Card>
  );
}
