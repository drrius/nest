import { Card, Note, Page, Section } from "../components/page";
import { CheckRow } from "../components/check-row";
import { usePreview } from "../preview/preview-state";

export default function GroceriesScreen() {
  const state = usePreview();
  return (
    <Page>
      <Note>Design preview · Changes are not saved to a household.</Note>
      <Section title="For the next shop">
        <Card>
          {state.groceries.map((item) => (
            <CheckRow key={item.id} item={item} onPress={() => state.checkGrocery(item.id)} />
          ))}
        </Card>
      </Section>
      <Note>Checking an item never records an expense.</Note>
    </Page>
  );
}
