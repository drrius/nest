# Private assistant device checks

Status: not device-verified. Linux source tests and an iOS export do not satisfy these checks. Use an isolated development API/backend with approved server-only Gateway credentials/model and existing member identity mappings. Do not connect these fixtures or additive migrations to production.

- From authenticated Today, open Private assistant. Verify loading/error/empty/content states and dated conversation links, New conversation and Older conversations. Confirm the partner cannot see the other member's list or guessed links.
- With the keyboard open, type a long/multiline prompt, send and follow a streamed answer. Check Send/Stop/Reload are reachable with large text and VoiceOver. Verify selection/copy, text clearing only after the user message is saved, scrolling and back gestures. Unsaved text requires an explicit leave decision.
- Read chores/groceries and follow their links. The assistant currently cannot change records; it must direct users to working native screens. No financial approval, meal proposal or memory UI is claimed by this slice.
- Interrupt before dispatch, mid-stream, while backgrounded and during saved-history reload. Confirm explicit retry preserves one operation, running/uncertain turns prevent another send, Stop aborts generation, and expired recovery never invokes a model. Check that partial content and interruption are described honestly.
- Force-quit/reopen and select the saved chat from the list. The app must recover from server state without a local transcript or automatic AI queue. Race two devices on the same conversation; the losing prompt must not start a second generation or hide the winning running turn.
- Sign out or switch accounts during streaming and during list/history reads. The prior account's content must disappear; delayed responses must not populate the next account. Check current membership revocation and token-expiry recovery.

Record device/OS/build commit, configured model, observed results and failure/recovery evidence. No paid build, release, provider call or production migration has been made to claim these results.
