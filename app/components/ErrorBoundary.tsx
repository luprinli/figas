import { useRouteError, isRouteErrorResponse, Link } from "@remix-run/react";

interface ErrorBoundaryProps {
  title?: string;
  backLink?: string;
  backLabel?: string;
}

/**
 * Shared ErrorBoundary component for consistent error handling across routes.
 * Usage: export { ErrorBoundary } from "~/components/ErrorBoundary";
 */
export function ErrorBoundary({
  title = "Something went wrong",
  backLink = "/",
  backLabel = "Go Home",
}: ErrorBoundaryProps) {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="mx-auto max-w-lg text-center px-4">
          <div className="mb-4 text-5xl font-bold text-slate-300 dark:text-slate-500">
            {error.status}
          </div>
          <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h1>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
            {error.statusText}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 mr-2"
          >
            Try Again
          </button>
          <Link
            to={backLink}
            className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
          >
            {backLabel}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="mx-auto max-w-lg text-center px-4">
        <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}