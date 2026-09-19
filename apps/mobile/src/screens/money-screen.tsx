import { Card, Note, Page, Section } from "../components/page";

export default function MoneyScreen() {
  return (
    <Page>
      <Note>Design preview · Fictional financial history</Note>
      <Section title="You’re owed CHF 24.50">
        <Note>A shared-expense balance, not a bank balance.</Note>
      </Section>
      <Section title="Recent activity">
        <Card>
          <Note>Groceries · CHF 49.00</Note>
          <Note>You paid · Split equally</Note>
          <Note>Partner’s share: CHF 24.50</Note>
        </Card>
      </Section>
      <Section title="Clear and explainable">
        <Note>
          Expenses and settlements will preserve the original history. Nothing in this preview posts
          a financial entry.
        </Note>
      </Section>
    </Page>
  );
}
