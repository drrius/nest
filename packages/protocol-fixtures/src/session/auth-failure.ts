import { isAuthSessionMissingError, type AuthError } from "@supabase/supabase-js";
export const definitiveAuthFailure = (error: AuthError) =>
  isAuthSessionMissingError(error) ||
  [
    "refresh_token_not_found",
    "refresh_token_already_used",
    "session_not_found",
    "session_expired",
    "bad_jwt",
  ].includes(error.code ?? "") ||
  error.status === 401 ||
  error.status === 403;
