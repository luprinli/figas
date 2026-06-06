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
 * Generate a CSRF token for the given session ID.
 *
 * The token is an HMAC-SHA256 signature of the session ID, which means:
 *  - It is deterministic for the same session (no extra server-side state).
 *  - It cannot be forged without knowing the CSRF_SECRET.
 *  - It is tied to a specific session.
 */
export function generateCsrfToken(sessionId: string): string {
  return createHmac(CSRF_ALGORITHM, CSRF_SECRET)
    .update(sessionId)
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
