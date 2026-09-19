import * as Schema from "effect/Schema";

export class ApiFailure extends Schema.TaggedError<ApiFailure>()("ApiFailure", {
  code: Schema.Literals([
    "unauthenticated",
    "not_a_member",
    "unavailable",
    "invalid_request",
    "forbidden",
    "conflict",
  ]),
}) {}

export function failureResponse(error: ApiFailure): Response {
  const statuses = {
    unauthenticated: 401,
    not_a_member: 403,
    unavailable: 503,
    invalid_request: 400,
    forbidden: 403,
    conflict: 409,
  };
  return Response.json(
    { error: { code: error.code } },
    {
      status: statuses[error.code],
      headers: { "Cache-Control": "no-store" },
    },
  );
}
