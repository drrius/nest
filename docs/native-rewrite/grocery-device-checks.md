## Grocery device checks awaiting an iPhone

Use an isolated development Supabase project/API and fixture household with both test members. Do not point this journey at personal production groceries or financial data. Record the source SHA, development build ID/profile, iOS/device, backend fixture revision and date beside each result.

1. Sign in, open Today → Groceries, and verify the fixture items and quantities. Denied membership must hide the list and show account verification; an unavailable list must not appear as an empty successful load.
2. While already signed in with a loaded list, disconnect and check/uncheck an item. Confirm the saved/pending indication. Reconnect and refresh, then inspect the other member's device: the agreed state should appear once, without an expense or shopping-session transition.
3. For a conflicting opposite check or partner edit, verify that the app retains the pending intent and offers explicit discard after showing current state. A compatible same-state check must converge without duplicating anything.
4. Add a clearly named fixture item, optional quantity/unit and category. Test the bottom controls with the keyboard open, large text and VoiceOver. Confirm save succeeds online, dismiss back to the same checklist, and verify the server result.
5. Edit the fixture item while the partner changes it. Saving the stale form must preserve a reviewable attempt and report a conflict. Return to the latest list before discarding the retry and starting a fresh edit.
6. On a controlled lost-response test backend, restart after an online add/remove commits but before acknowledgment. Reopen Add/resume: confirm the exact target label and category details are visible, then explicitly retry. The server must retain one mutation/receipt. Restart alone must not send an online edit.
7. Start editing, type input and swipe/back out. Verify the discard prompt, Stay preservation and Leave behavior. Repeat while a save is in flight: a retained attempt must remain available without another user's account seeing it.
8. Remove only the fixture item. Confirm its name appears in the destructive confirmation and any retained removal retry. Existing legacy claimed items must explain why removal is unavailable.

Current gap: cold launch while offline cannot yet restore the previously verified identity. Treat that journey as incomplete, not a successful native offline test. Automatic connectivity retries and category grouping and native verification of checked-list presentation are also separate unfinished work. Current Linux exports and Node/SQLite/PostgreSQL tests do not verify any of the native UI steps above.
