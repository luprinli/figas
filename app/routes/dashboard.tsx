import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { useState } from "react";

import MenuIcon from "../components/icons/Menu";
import ProfilePopup from "../components/ProfilePopup";
import Sidebar from "../components/Sidebar";
import { getUserIdentity } from "../utils/auth.server";
import { requireUser } from "../utils/layout.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { userId, userIdentity } = await requireUser(request);

  // Fetch full identity with permissions for PBAC sidebar rendering
  const fullIdentity = userId ? await getUserIdentity(userId) : null;
  const userPermissions = fullIdentity?.permissions ?? [];

  return json({ userIdentity, userPermissions });
}

export default function Dashboard() {
  const { userIdentity, userPermissions } = useLoaderData<typeof loader>();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <>
      <nav className="flex items-center justify-between gap-6 p-4 md:justify-end">
        <button
          className="flex items-center justify-center w-8 h-8 transition rounded-md cursor-pointer md:hidden text-slate-900 dark:text-slate-100 hover:bg-slate-200/80"
          onClick={() => setIsSidebarOpen(true)}
        >
          <MenuIcon />
        </button>
        <ProfilePopup user={userIdentity} />
      </nav>
      <Sidebar
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        userPermissions={userPermissions}
      />
      <main className="py-8 grow md:ml-70 md:py-16">
        <div className="px-4 mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>
    </>
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