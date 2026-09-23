import { expoPushRequest } from "./expo-request.ts";
import type {
  RenewalNotification,
  ChoreNotification,
  MealNotification,
  GroceryNotification,
  DailySummaryNotification,
} from "../../../../packages/contracts/src/push-notification.ts";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { PushToken } from "../../../../packages/contracts/src/push-registration.ts";
import { expoReceiptResult, expoTicketResult } from "./provider-results.ts";

const Delivery = Schema.Struct({
  token: PushToken,
  householdId: Schema.String.check(Schema.isUUID()),
  renewalId: Schema.String.check(Schema.isUUID()),
});
const ChoreDelivery = Schema.Struct({
  token: PushToken,
  householdId: Schema.String.check(Schema.isUUID()),
  occurrenceId: Schema.String.check(Schema.isUUID()),
});
const MealDelivery = Schema.Struct({
  token: PushToken,
  householdId: Schema.String.check(Schema.isUUID()),
  entryId: Schema.String.check(Schema.isUUID()),
});
const GroceryDelivery = Schema.Struct({
  token: PushToken,
  householdId: Schema.String.check(Schema.isUUID()),
  itemId: Schema.String.check(Schema.isUUID()),
});
const SummaryDelivery = Schema.Struct({
  token: PushToken,
  householdId: Schema.String.check(Schema.isUUID()),
  recipientId: Schema.String.check(Schema.isUUID()),
  summaryId: Schema.String.check(Schema.isUUID()),
});
const TicketId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,200}$(?![\s\S])/));
/** Server-only adapter. Call send only after the one-use database authorization. */
export function expoPushTransport(
  accessToken?: Redacted.Redacted<string>,
  fetcher: typeof fetch = globalThis.fetch,
) {
  const post = expoPushRequest(accessToken, fetcher);
  return {
    send: (input: unknown) =>
      Schema.decodeUnknownEffect(Delivery)(input).pipe(
        Effect.flatMap((delivery) =>
          post("send", {
            to: delivery.token,
            title: "Nest",
            body: "You have a reminder in Nest.",
            sound: "default",
            data: {
              version: 1,
              kind: "renewal",
              householdId: delivery.householdId,
              renewalId: delivery.renewalId,
            } satisfies RenewalNotification,
          }),
        ),
        Effect.map(expoTicketResult),
        Effect.catch(() => Effect.succeed({ status: "unknown" as const })),
      ),
    sendChore: choreSender(post),
    sendMeal: mealSender(post),
    sendGrocery: grocerySender(post),
    sendSummary: (input: unknown) =>
      Schema.decodeUnknownEffect(SummaryDelivery)(input).pipe(
        Effect.flatMap((delivery) =>
          post("send", {
            to: delivery.token,
            title: "Nest",
            body: "Your daily summary is ready.",
            sound: "default",
            data: {
              version: 1,
              kind: "daily_summary",
              householdId: delivery.householdId,
              recipientId: delivery.recipientId,
              summaryId: delivery.summaryId,
            } satisfies DailySummaryNotification,
          }),
        ),
        Effect.map(expoTicketResult),
        Effect.catch(() => Effect.succeed({ status: "unknown" as const })),
      ),
    receipt: (ticketId: string) =>
      Schema.decodeUnknownEffect(TicketId)(ticketId).pipe(
        Effect.flatMap((id) => post("getReceipts", { ids: [id] })),
        Effect.map((body) => expoReceiptResult(body, ticketId)),
        Effect.catch(() => Effect.succeed(null)),
      ),
  };
}

function choreSender(post: ReturnType<typeof expoPushRequest>) {
  return (input: unknown) =>
    Schema.decodeUnknownEffect(ChoreDelivery)(input).pipe(
      Effect.flatMap((delivery) =>
        post("send", {
          to: delivery.token,
          title: "Nest",
          body: "You have a reminder in Nest.",
          sound: "default",
          data: {
            version: 1,
            kind: "chore",
            householdId: delivery.householdId,
            occurrenceId: delivery.occurrenceId,
          } satisfies ChoreNotification,
        }),
      ),
      Effect.map(expoTicketResult),
      Effect.catch(() => Effect.succeed({ status: "unknown" as const })),
    );
}

function mealSender(post: ReturnType<typeof expoPushRequest>) {
  return (input: unknown) =>
    Schema.decodeUnknownEffect(MealDelivery)(input).pipe(
      Effect.flatMap((delivery) =>
        post("send", {
          to: delivery.token,
          title: "Nest",
          body: "You have a reminder in Nest.",
          sound: "default",
          data: {
            version: 1,
            kind: "meal",
            householdId: delivery.householdId,
            entryId: delivery.entryId,
          } satisfies MealNotification,
        }),
      ),
      Effect.map(expoTicketResult),
      Effect.catch(() => Effect.succeed({ status: "unknown" as const })),
    );
}

function grocerySender(post: ReturnType<typeof expoPushRequest>) {
  return (input: unknown) =>
    Schema.decodeUnknownEffect(GroceryDelivery)(input).pipe(
      Effect.flatMap((delivery) =>
        post("send", {
          to: delivery.token,
          title: "Nest",
          body: "You have a reminder in Nest.",
          sound: "default",
          data: {
            version: 1,
            kind: "grocery",
            householdId: delivery.householdId,
            itemId: delivery.itemId,
          } satisfies GroceryNotification,
        }),
      ),
      Effect.map(expoTicketResult),
      Effect.catch(() => Effect.succeed({ status: "unknown" as const })),
    );
}
