import { json } from "@remix-run/node";
import { Outlet , useRouteError, isRouteErrorResponse } from "@remix-run/react";


import Logo from "../components/Logo";

export async function loader() {
  return json({});
}

export default function AuthLayout() {
  return (
    <main className="flex grow">
      <div className="absolute left-4 top-4">
        <Logo />
      </div>
      <div className="hidden p-8 bg-white dark:bg-slate-900 lg:basis-5/12 lg:flex items-center justify-center overflow-hidden">
        <img
          src="/illustration_light.svg"
          alt="BN-2B Islander"
          className="block dark:hidden max-w-full max-h-full object-contain"
        />
        <img
          src="/illustration_dark.svg"
          alt="BN-2B Islander"
          className="hidden dark:block max-w-full max-h-full object-contain"
        />
      </div>
      <div className="flex flex-col items-center justify-center w-full px-4 py-24 lg:px-8 lg:basis-7/12">
        <Outlet />
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