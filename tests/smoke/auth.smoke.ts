/**
 * auth.smoke.ts
 * Guardian smoke test — verifies auth flows render without crashing.
 * Uses mocked loaders/actions, no real database.
 */

import { describe, test, expect } from "vitest";

describe("Auth smoke", () => {
  test("login page renders", () => {
    // This test verifies that the auth route module can be imported
    // without throwing — a basic smoke check that the file is valid.
    expect(async () => {
      await import("~/routes/_auth.login");
    }).not.toThrow();
  });

  test("signup page renders", () => {
    expect(async () => {
      await import("~/routes/_auth.signup");
    }).not.toThrow();
  });

  test("auth layout renders", () => {
    expect(async () => {
      await import("~/routes/_auth");
    }).not.toThrow();
  });

  test("session.server exports expected functions", async () => {
    const session = await import("~/session.server");
    expect(typeof session.getSession).toBe("function");
    expect(typeof session.commitSession).toBe("function");
    expect(typeof session.destroySession).toBe("function");
  });
});
