import { validateCsrfToken, generateCsrfToken } from "./csrf.server";

/**
 * Validate a CSRF token from a FormData against the user's session cookie.
 * Uses the full Cookie header value as the token basis (not session.id,
 * which is always empty for cookie-based sessions).
 *
 * Returns true if the token is valid.
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

  const cookieHeader = request.headers.get("Cookie") ?? "";
  if (!cookieHeader) {
    console.warn("[CSRF] No session cookie found — cannot validate CSRF token");
    return false;
  }

  if (!validateCsrfToken(token, cookieHeader)) {
    console.warn("[CSRF] Token validation failed");
    return false;
  }

  return true;
}

/**
 * Generate a CSRF token from a Request's cookie header.
 * Use this in loaders to embed the token for client-side fetcher.submit calls.
 */
export function generateCsrfTokenFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return null;
  return generateCsrfToken(cookieHeader);
}
