import { isRouteErrorResponse, useRouteError } from "@remix-run/react";

export function RouteErrorFallback() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="mx-auto max-w-lg text-center px-4">
          <div className="mb-4 text-5xl font-bold text-slate-300 dark:text-slate-600">
            {error.status}
          </div>
          <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
            Something went wrong
          </h1>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
            {error.statusText}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="mx-auto max-w-lg text-center px-4">
        <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
          Unexpected Error
        </h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
