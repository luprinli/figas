import type { ReactElement } from "react";
import { useMatches } from "@remix-run/react";

/**
 * Shared CSRF hook — eliminates per-route token duplication.
 *
 * Usage in a route component:
 *   const { csrfToken, csrfHiddenInput, injectCsrf } = useCsrf();
 *
 *   // In <Form method="post">:
 *   <Form method="post">{csrfHiddenInput}...</Form>
 *
 *   // In fetcher.submit():
 *   const fd = new FormData(); injectCsrf(fd); fetcher.submit(fd, { method: "post" });
 */
export function useCsrf() {
  // Root loader returns { csrfToken } at app/root.tsx:36-37
  const matches = useMatches();
  const rootData = matches[0]?.data as { csrfToken?: string } | undefined;
  const csrfToken = rootData?.csrfToken ?? null;

  const csrfHiddenInput: ReactElement | null = csrfToken
    ? <input type="hidden" name="csrf_token" value={csrfToken} key="csrf" />
    : null;

  /** Mutates a FormData to include the CSRF token. Safe no-op if no token available. */
  function injectCsrf(formData: FormData): FormData {
    if (csrfToken) formData.set("csrf_token", csrfToken);
    return formData;
  }

  /** Returns a plain object with csrf_token added. */
  function injectCsrfObject<T extends Record<string, unknown>>(data: T): T & { csrf_token?: string } {
    return csrfToken ? { ...data, csrf_token: csrfToken } : data;
  }

  return { csrfToken, csrfHiddenInput, injectCsrf, injectCsrfObject };
}
