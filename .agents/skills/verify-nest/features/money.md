# Money

Money shows the household's CHF balance between the two partners and their recent shared expenses. It also records expenses and payments, and routes bills and financial proposals through approvals. Every money change is permanent: history is append-only, and corrections are new entries.

## Sub-features

- `money-balance` shows `You're settled up`, `Your partner owes you` or `You owe your partner` with a CHF amount, or explains why the balance is unavailable.
- `money-expense` records an expense through `Add expense` → `Review expense` → `Save expense`.
- `money-payment` records a settlement through `Record payment`.
- `money-history` lists `Recent activity` and the full history.
- `money-bills` lists `Bills to confirm` and `Recurring expenses`.
- `money-approvals` reviews pending financial approvals in `Your approvals`.

## How to get to it (user POV)

- Choose the `Money` tab.
- From Today, choose `Add` → `Expense`, a bill under `Bills to confirm`, or `All proposals and saved decisions`.
- From Groceries, choose `Record grocery expense`.

## Driving it with nest-verify

Preconditions:

- The baseline preconditions hold, and an owner-authorized member is signed in on the run's simulator.
- The household has a verified, linked partner. A one-member household shows `Money will be ready when your partner's verified account is linked` and nothing else.
- Any expense, payment or approval decision needs the owner's explicit go-ahead for that exact amount, because history cannot be deleted. Read-only recipes need no go-ahead.

- **Balance.** Open Money. Run `nest-verify ad $RUN press 'label="Money"' --settle` and then `nest-verify ad $RUN wait 'id="tab-header-money"'`. The snapshot shows `All square, without the guesswork.` and either a balance headline with a `CHF` amount or one of the unavailable messages.
- **History.** Run `press 'label="View full history"' --settle`. Rows carry identifiers of the form `money-event-<uuid>`. Back out with `back --settle`.
- **Expense, review only.** Run `press 'label="Add expense"' --settle`, fill the amount and description from the snapshot refs, then run `press 'label="Review expense"' --settle`. The review shows `expense-review-amount`, `expense-review-payer` and one `expense-share-<member uuid>` per member. Stop here, and leave through `Edit` and Back, unless the owner authorized the posting.
- **Expense, posting.** Only with the owner's go-ahead. Run `press 'label="Save expense"' --settle`, then `wait text "Expense recorded."`. Prove it with a second read: the new row in `View full history` and the changed balance.
- **Payment, review only.** Run `press 'label="Record a payment"' --settle`, fill the amount, then `press 'label="Review payment"' --settle`. Stop before `Record payment` unless authorized.
- **Approvals.** Run `press 'label="Your financial approvals"' --settle`. The screen lists `Waiting for your review` or `No pending financial approvals.` Opening an item is read-only. The decision buttons are not.
- **Proof.** Run `nest-verify ad $RUN snapshot > evidence/verify-nest/$RUN/money.snapshot.txt` and `nest-verify ad $RUN screenshot money.png`, then `nest-verify pull $RUN`.

## Gotchas

- `Save expense`, `Record payment` and every approval decision (`Record`, `Apply`, `Save`, `Link`, `Adopt`, `Confirm`, `Resume`, `Dismiss`, `Decline`) post or reject money permanently. Never retry one because a wait timed out. Read the history first.
- Amounts are CHF with two decimals. Assert the rendered amount, not the typed field value.
- The receipt section's `Choose photo` and `Choose PDF` open system pickers and upload to storage. A fresh simulator has no PDFs, so attach nothing unless the run planned a fixture.
- `Showing your previous balance` and `Showing saved information from <date>` are offline states. They do not prove a fresh read.
- The approval `Expires` time follows the simulator's clock. An expired approval reads `This approval has expired` and cannot be decided.
