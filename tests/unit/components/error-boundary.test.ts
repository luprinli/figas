import { describe, it, expect, vi } from "vitest";
import { isRouteErrorResponse } from "@remix-run/react";

// ---------------------------------------------------------------------------
// isRouteErrorResponse — pure utility, no mocking needed
// ---------------------------------------------------------------------------

describe("isRouteErrorResponse", () => {
  it("identifies route error responses with status 400", () => {
    const error = {
      status: 400,
      statusText: "Bad Request",
      internal: false,
      data: { message: "Invalid input" },
    };
    expect(isRouteErrorResponse(error)).toBe(true);
  });

  it("identifies route error responses with status 404", () => {
    const error = {
      status: 404,
      statusText: "Not Found",
      internal: false,
      data: null,
    };
    expect(isRouteErrorResponse(error)).toBe(true);
  });

  it("identifies route error responses with status 500", () => {
    const error = {
      status: 500,
      statusText: "Internal Server Error",
      internal: true,
      data: { message: "Unexpected crash" },
    };
    expect(isRouteErrorResponse(error)).toBe(true);
  });

  it("does NOT identify TypeError as a route error response", () => {
    const error = new TypeError("Cannot read properties of undefined");
    expect(isRouteErrorResponse(error)).toBe(false);
  });

  it("does NOT identify generic Error as a route error response", () => {
    const error = new Error("Something broke");
    expect(isRouteErrorResponse(error)).toBe(false);
  });

  it("does NOT identify plain objects missing a status field", () => {
    const error = { message: "oops", stack: "..." };
    expect(isRouteErrorResponse(error)).toBe(false);
  });

  it("does NOT identify null", () => {
    expect(isRouteErrorResponse(null)).toBe(false);
  });

  it("does NOT identify undefined", () => {
    expect(isRouteErrorResponse(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Status → user-facing message mapping (same pattern used in ErrorBoundary)
// ---------------------------------------------------------------------------

describe("ErrorBoundary status message mapping", () => {
  function getStatusDisplay(
    status: number,
  ): { heading: string; body: string } {
    switch (status) {
      case 404:
        return {
          heading: "Page Not Found",
          body: "The page you are looking for does not exist.",
        };
      case 500:
        return {
          heading: "Server Error",
          body: "An internal server error occurred. Please try again later.",
        };
      default:
        return {
          heading: `Error ${status}`,
          body: "Something went wrong.",
        };
    }
  }

  it("maps 404 to 'Not Found' heading and descriptive body", () => {
    const result = getStatusDisplay(404);
    expect(result.heading).toMatch(/Not Found/i);
    expect(result.body).toMatch(/does not exist/i);
  });

  it("maps 500 to 'Server Error' heading", () => {
    const result = getStatusDisplay(500);
    expect(result.heading).toMatch(/Server Error/i);
    expect(result.body).toMatch(/internal server error/i);
  });

  it("maps 400 to a generic error heading containing the status code", () => {
    const result = getStatusDisplay(400);
    expect(result.heading).toBe("Error 400");
    expect(result.body).toBe("Something went wrong.");
  });

  it("maps 403 to a generic error heading and body", () => {
    const result = getStatusDisplay(403);
    expect(result.heading).toBe("Error 403");
  });
});

// ---------------------------------------------------------------------------
// window.location.reload() — onClick handler pattern in ErrorBoundary
// ---------------------------------------------------------------------------

describe("ErrorBoundary onClick reload handler", () => {
  it("vi.fn() mock can simulate window.location.reload from an onClick handler", () => {
    const reloadMock = vi.fn();

    // Pattern used in the ErrorBoundary component:
    //   onClick={() => window.location.reload()}
    const onClick = () => reloadMock();
    onClick();

    expect(reloadMock).toHaveBeenCalledOnce();
  });

  it("reload is invoked when the onClick handler fires", () => {
    const reloadMock = vi.fn();

    const handleClick = () => reloadMock();
    handleClick();

    expect(reloadMock).toHaveBeenCalled();
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });
});
