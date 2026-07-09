import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";
import type { LinksFunction } from "@remix-run/node";

import styles from "./styles/tailwind.css?url";
import printStyles from "./styles/print.css?url";
import ToastContainer from "./components/Toast";
import ThemeProvider from "./components/ThemeProvider";
import { GlobalErrorBoundary } from "./components/GlobalErrorBoundary";

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

export default function App() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#2563eb" />
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
          <Outlet />
          <ScrollRestoration />
          <Scripts />
          <ToastContainer />
        </ThemeProvider>
      </body>
    </html>
  );
}

export { GlobalErrorBoundary as ErrorBoundary };
