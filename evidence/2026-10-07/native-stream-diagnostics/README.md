# Native stream diagnostics for the next beta

Assistant SSE requests now use the same bounded diagnostic sink and correlation/
build headers as standard HTTP. A single record covers byte consumption and
receiver delivery through completion, including status and elapsed time. Fixed
outcomes distinguish response validation, parsing, incomplete framing, provider
error/abort events, cancellation, receiver failure and transport failure. Original
errors and completion behavior are preserved. Only the fixed event type is
inspected; prompts, responses, conversation/operation IDs and error text are not
retained in diagnostics.

Four focused AssistantStreamDiagnosticsTests pass on the authorized Mac. Six
existing NestRequestDiagnosticsTests also pass after the shared header helper
changes. These execute the real request builder/parser/receiver handling with an
in-process byte transport, not a hosted provider stream or iPhone journey. Strict
Swift formatting, source limits and diff checks pass. Build25's source/IPA is
unchanged. This patch is for the next planned beta, without another upload solely
for telemetry. Auth transport remains a separately documented gap.
