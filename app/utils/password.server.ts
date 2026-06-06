import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";

/**
 * Hash a password using Node.js built-in scrypt.
 * Returns a string in the format "salt:derivedKey" (hex-encoded).
 */
export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString("hex");
    scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      resolve(`${salt}:${key.toString("hex")}`);
    });
  });
}

/**
 * Verify a password against a stored hash.
 *
 * Supports two hash formats:
 * 1. Scrypt hashes produced by `hashPassword` (format: "salt:derivedKey")
 * 2. Bcrypt hashes from Laravel (format: "$2y$..." / "$2a$..." / "$2b$...")
 *
 * Uses timing-safe comparison for scrypt hashes to prevent timing attacks.
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  // Detect bcrypt hashes (Laravel uses $2y$ prefix)
  if (isBcryptHash(hash)) {
    return bcrypt.compare(password, hash);
  }

  // Scrypt hash verification
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(":");
    if (!salt || !key) {
      resolve(false);
      return;
    }
    scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(timingSafeEqual(Buffer.from(key, "hex"), derivedKey));
    });
  });
}

/**
 * Check whether a hash string is a bcrypt hash.
 * Laravel produces hashes starting with "$2y$" (or "$2a$"/"$2b$").
 */
function isBcryptHash(hash: string): boolean {
  return /^\$2[aby]\$/.test(hash);
}
