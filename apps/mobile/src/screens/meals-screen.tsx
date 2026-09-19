import { useState } from "react";
import { Link } from "expo-router";
import { Text } from "react-native";
import { Card, Note, Page, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { useQuiet } from "../theme";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const dinners = [
  "Roasted tomato pasta",
  "Lentil soup",
  "Vegetable tray bake",
  "Leftover lentil soup",
  "Mushroom risotto",
  "Homemade pizza",
  "Chickpea stew",
];

export default function MealsScreen() {
  const colors = useQuiet();
  const [week, setWeek] = useState(dinners);
  return (
    <Page>
      <Note>Design preview · Sample week, 21–27 September</Note>
      <Note>Try replacing one dinner. The rest of the week stays in place.</Note>
      {days.map((day, index) => (
        <Section key={day} title={day}>
          <Card>
            <Note>Dinner · 2 portions</Note>
            <Text style={{ color: colors.text, fontSize: 19, fontWeight: "500" }}>
              {week[index]}
            </Text>
            <NativeAction
              label={`Replace ${day.toLowerCase()} dinner`}
              onPress={() =>
                setWeek((current) =>
                  current.map((meal, position) =>
                    position === index
                      ? meal === "Spinach frittata"
                        ? dinners[index]!
                        : "Spinach frittata"
                      : meal,
                  ),
                )
              }
            />
          </Card>
        </Section>
      ))}
      <Link href="/groceries" style={{ color: colors.accent, fontSize: 17, paddingVertical: 16 }}>
        Open groceries
      </Link>
    </Page>
  );
}
