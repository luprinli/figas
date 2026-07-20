import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";
import type { LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

import { generateCsrfToken } from "./utils/csrf.server";
import styles from "./styles/tailwind.css?url";
import printStyles from "./styles/print.css?url";
import ToastContainer from "./components/Toast";
import ThemeProvider from "./components/ThemeProvider";

export const links: LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
  { rel: "stylesheet", href: styles },
  { rel: "stylesheet", href: printStyles, media: "print" },
  { rel: "manifest", href: "/manifest.json" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const csrfToken = generateCsrfToken(cookieHeader);
  return json({ csrfToken });
}

export default function App() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#2563eb" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0f172a" media="(prefers-color-scheme: dark)" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem("figas-theme");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme:dark)").matches)){document.documentElement.classList.add("dark")}})()`,
          }}
        />
        <Meta />
        <Links />
      </head>
      <body className="flex flex-col min-h-screen text-slate-700 bg-slate-100 dark:bg-slate-900 dark:text-slate-300">
        <ThemeProvider>
          <main id="main-content">
            <Outlet />
          </main>
          <ScrollRestoration />
          <Scripts />
          <ToastContainer />
        </ThemeProvider>
      </body>
    </html>
  );
}

export { RouteErrorFallback as ErrorBoundary } from "./components/RouteErrorFallback";
