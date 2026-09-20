# Private native chat

The authenticated Today screen links to a private conversation list and full-screen chat. AI SDK `Chat`/`useChat` owns messages and streaming. The surrounding runtime owns only saved revision/turn reconciliation and screen lifetime. `expo/fetch` supplies native transport; Expo 57 already installs stream/clone globals. No transcript, prompt, token copy or AI retry queue is written to SQLite.

A submit captures one prompt/operation/revision before SDK dispatch. A missing acknowledgment triggers read-only reconciliation, never automatic regeneration. Explicit retry preserves the exact command only when the server confirms no claim and the revision still matches. Running claims block sends; expired claims can be explicitly interrupted without a model call. Stream completion is not proof of persistence: the UI reloads saved history and turn state. Cancellation/unmount aborts HTTP, and the server claim remains recoverable if finalization cannot run.

Current tools read chores and groceries only. Messages link to their real native screens. Mutating chat tools, tool-invocation journaling, financial approvals, meal proposals and memory consent remain separate unfinished work. Server Gateway credentials/model selection are required; there is no embedded/default model or provider secret in the app.

Local verification uses actual AI SDK state/streams, loopback HTTP, PostgREST and isolated PostgreSQL with synthetic Auth/model responses. This does not verify Hermes streaming, Keychain, keyboard, VoiceOver or a live provider. See the device checklist in `docs/native-rewrite/assistant-device-checks.md`.
