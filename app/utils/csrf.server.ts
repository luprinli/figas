import { createHmac, timingSafeEqual } from "node:crypto";

const rawSecret = process.env.CSRF_SECRET ?? process.env.SESSION_SECRET;

if (!rawSecret) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "FATAL: CSRF_SECRET (or SESSION_SECRET as fallback) environment variable is required in production.\n" +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  console.warn(
    "WARNING: CSRF_SECRET not set. Using insecure fallback for development only."
  );
}

// Non-null assertion is safe here because:
// - In production, we throw above if the secret is missing.
// - In development, we fall back to a string literal.
const CSRF_SECRET: string =
  rawSecret ?? "dev-fallback-csrf-do-not-use-in-production";
const CSRF_ALGORITHM = "sha256";
const CSRF_DIGEST = "hex";

/**
 * Generate a CSRF token for the given basis string.
 *
 * The token is an HMAC-SHA256 signature, which means:
 *  - It is deterministic for the same basis (no extra server-side state).
 *  - It cannot be forged without knowing the CSRF_SECRET.
 *  - It is tied to a specific basis (e.g., session cookie, full Cookie header).
 *
 * Both the token generator and validator must use the same basis string.
 * The recommended basis is `request.headers.get("Cookie") ?? ""` for
 * cookie-based sessions, as `session.id` is empty in Remix's
 * createCookieSessionStorage.
 */
export function generateCsrfToken(basis: string): string {
  return createHmac(CSRF_ALGORITHM, CSRF_SECRET)
    .update(basis)
    .digest(CSRF_DIGEST);
}

/**
 * Validate a CSRF token against the given session ID.
 * Uses `timingSafeEqual` to prevent timing attacks.
 */
export function validateCsrfToken(
  token: string,
  sessionId: string
): boolean {
  try {
    const expected = generateCsrfToken(sessionId);
    const tokenBuf = Buffer.from(token, CSRF_DIGEST);
    const expectedBuf = Buffer.from(expected, CSRF_DIGEST);

    if (tokenBuf.length !== expectedBuf.length) {
      return false;
    }

    return timingSafeEqual(tokenBuf, expectedBuf);
  } catch {
    return false;
  }
}
