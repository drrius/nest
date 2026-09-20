# Native meal-week reads

`/meal-week` is a protected real-data screen linked from Today. The existing four-tab design preview remains explicitly fictional and development-only. This read slice is not a completed M5 meal-planning workflow.

The board shows a full Monday–Sunday week with previous/next navigation. It uses the household cooking profile's visible slots, offers Show all slots, and warns when saved meals are hidden. If the preference refresh fails, it keeps the current selection (all three on first mount) and explains that failure. Display preferences are not a filter on authoritative week data and cannot erase meals. Slot preferences are not separately persisted in this read slice.

The session client uses Expo fetch, protected credentials and the shared strict week schema. Household or requested-week mismatches fail closed. The private assistant `readMealWeek` uses the same backend service. Viewing never writes meals, adds groceries or grants an approval.

SQLite stores at most eight recently saved weeks per actor/household. Account leases protect every read/write. Atomic replacement/retention preserves a newer exact bigint revision against delayed older responses; malformed cached rows are never rendered and can be repaired by a fresh authorized response. These are read snapshots, not offline meal commands. The existing two-action outbox is unchanged.

The controller cancels or ignores superseded week requests and disposed-screen results. Focus, foreground, reconnect and explicit refresh load cached data before the authorized read. An empty board appears only after a valid loaded snapshot. Failed refreshes retain saved data with a stale notice; auth denial hides data until an authorized refresh succeeds. Storage failures do not claim offline success. Leaving the screen cancels reads.

Local evidence includes real SQLite restart/retention/isolation/rollback, exact revision safety, invalid credentials/scope, auth recovery and delayed-response cancellation. The actual HTTP/PostgREST journey reads existing meals, restarts offline, refreshes a partner edit and hides revoked access. The iOS export is packaging evidence only; physical navigation, Dynamic Type, VoiceOver and native rendering are still unverified.

Manual placement/move/replace/remove, saved recipe detail/library, generated proposals, exact-revision approval and separate ingredient review remain unfinished. No disabled or placeholder mutation controls are presented as implemented actions.
