import { getSession } from "../session.server";
import { validateCsrfToken } from "./csrf.server";

/**
 * Validate a CSRF token from a FormData against the user's session.
 * Extracts the session from the request Cookie header, then validates
 * the `csrf_token` field from the form submission.
 *
 * Returns true if the token is valid or CSRF is disabled (dev fallback).
 * Returns false and logs a warning if validation fails.
 */
export async function validateCsrfRequest(
  request: Request,
  formData: FormData
): Promise<boolean> {
  const token = formData.get("csrf_token")?.toString();
  if (!token) {
    console.warn("[CSRF] Missing csrf_token in form submission");
    return false;
  }

  const session = await getSession(request.headers.get("Cookie"));
  const sessionId = session.id;
  if (!sessionId) {
    console.warn("[CSRF] No session ID found — cannot validate CSRF token");
    return false;
  }

  if (!validateCsrfToken(token, sessionId)) {
    console.warn("[CSRF] Token validation failed for session", sessionId.slice(0, 8));
    return false;
  }

  return true;
}
