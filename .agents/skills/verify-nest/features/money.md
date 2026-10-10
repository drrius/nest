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

- The baseline preconditions hold, and `$V signin $RUN member` has printed `SIGNED-IN`. The synthetic household has both members, so Money is available.
- Postings are permanent. Post only when the change under test needs it, at CHF 1.00 or less, with a run-prefixed description. Read-only recipes have no such limit.

- **Balance.** Open Money. Run `$V ad $RUN press 'role=button label="Money"' --settle` and then `$V ad $RUN wait 'id="tab-header-money"'`. The snapshot shows `All square, without the guesswork.`, a balance headline such as `You’re settled up` with a `CHF` amount, and `Across your shared expenses`. Wait for that last text, because the balance loads from the network.
- **History.** Run `$V ad $RUN press 'label="View full history"' --settle`. Rows carry identifiers of the form `money-event-<uuid>`. Back out with `$V ad $RUN back --settle`.
- **Expense, review only.** Run `$V ad $RUN press 'label="Add expense"' --settle`, fill the amount and description by their refs, run `$V ad $RUN keyboard dismiss`, then run `$V ad $RUN press 'label="Review expense"' --settle`. The review shows `expense-review-amount`, `expense-review-payer` and one `expense-share-<member uuid>` per member. Stop here, and leave through `Edit` and Back, unless the change needs a posting.
- **Expense, posting.** Only when the change needs a posting. Run `$V ad $RUN press 'label="Save expense"' --settle`, then `$V ad $RUN wait text "Expense recorded."`. Prove it with a second read: the new row in `View full history` and the changed balance.
- **Payment, review only.** Run `$V ad $RUN press 'label="Record a payment"' --settle`, fill the amount, then `$V ad $RUN press 'label="Review payment"' --settle`. Stop before `Record payment` unless the change needs a payment.
- **Approvals.** Run `$V ad $RUN press 'label="Your financial approvals"' --settle`. The screen lists `Waiting for your review` or `No pending financial approvals.` Opening an item is read-only. The decision buttons are not.
- **Proof.** Run `$V ad $RUN snapshot > evidence/verify-nest/$RUN/money.snapshot.txt` and `$V ad $RUN screenshot money.png`, then `$V pull $RUN`.

## Gotchas

- `Save expense`, `Record payment` and every approval decision (`Record`, `Apply`, `Save`, `Link`, `Adopt`, `Confirm`, `Resume`, `Dismiss`, `Decline`) post or reject money permanently. Never retry one because a wait timed out. Read the history first.
- Amounts are CHF with two decimals. Assert the rendered amount, not the typed field value.
- The receipt section's `Choose photo` and `Choose PDF` open system pickers and upload to storage. A fresh simulator has no PDFs, so attach nothing unless the run planned a fixture.
- `Showing your previous balance` and `Showing saved information from <date>` are offline states. They do not prove a fresh read.
- The approval `Expires` time follows the simulator's clock. An expired approval reads `This approval has expired` and cannot be decided.
