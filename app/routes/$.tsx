import type { MetaFunction } from "@remix-run/node";
import { Link } from "@remix-run/react";
import { useRouteError, isRouteErrorResponse } from "@remix-run/react";

export const meta: MetaFunction = () => [{ title: "Page Not Found - FIGAS" }];

export default function PrivateNotFound() {
  return (
    <main className="grow px-8 py-12 flex items-center justify-center">
      <div className="px-8 py-10 space-y-4 border rounded-sm shadow-sm dark:shadow-slate-900/20 border-cyan-500 bg-cyan-100/20 w-full max-w-4xl text-center">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 sm:text-3xl lg:text-4xl">
          Page Not Found
        </h1>
        <p>The page you’re looking for doesn’t exist.</p>
        <Link to="/" className="underline text-cyan-600">
          Go back home
        </Link>
      </div>
    </main>
  );
}


export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-700 dark:bg-slate-900">
        <div className="mx-auto max-w-lg text-center px-4">
          <div className="mb-4 text-5xl font-bold text-slate-300 dark:text-slate-500 dark:text-slate-600 dark:text-slate-300 dark:text-slate-500">{error.status}</div>
          <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Something went wrong</h1>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">{error.statusText}</p>
          <button onClick={() => window.location.reload()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Try Again</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-700 dark:bg-slate-900">
      <div className="mx-auto max-w-lg text-center px-4">
        <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Unexpected Error</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">An unexpected error occurred. Please try again.</p>
        <button onClick={() => window.location.reload()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Try Again</button>
      </div>
    </div>
  );
}