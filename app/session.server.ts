import { createCookieSessionStorage } from "@remix-run/node";

const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "FATAL: SESSION_SECRET environment variable is required in production.\n" +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  console.warn(
    "WARNING: SESSION_SECRET not set. Using insecure fallback for development only."
  );
}

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [SESSION_SECRET ?? "dev-fallback-secret-do-not-use-in-production"],
    secure: process.env.NODE_ENV === "production",
  },
});

export const { getSession, commitSession, destroySession } = sessionStorage;
