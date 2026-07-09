import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";
import path from "node:path";

declare module "@remix-run/node" {
  interface Future {
    v3_singleFetch: true;
  }
}

export default defineConfig({
  plugins: [
    // -----------------------------------------------------------------------
    // Prisma v7 CJS/ESM interop fix for Vite SSR
    // -----------------------------------------------------------------------
    // The @prisma/client package exports map has a "node" condition that
    // resolves @prisma/client/runtime/client to client.js (CJS). Vite SSR
    // includes "node" in its resolve conditions by default (hardcoded in the
    // package entry resolution), so it picks the CJS file, which uses the
    // "module" global — not available in Vite's SSR evaluator.
    //
    // This plugin runs BEFORE vite:resolve to intercept the import and
    // redirect it to the ESM (.mjs) variant directly, bypassing the
    // conditional exports resolution entirely.
    {
      name: "fix-prisma-ssr-resolution",
      enforce: "pre",
      resolveId(id) {
        if (id === "@prisma/client/runtime/client") {
          // Resolve to the ESM .mjs file directly, bypassing the conditional
          // exports resolution that picks the CJS version via the "node" condition.
          return {
            id: path.resolve(
              __dirname,
              "node_modules/@prisma/client/runtime/client.mjs"
            ),
            external: false,
          };
        }
        return null;
      },
    },
    remix({
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_singleFetch: true,
        v3_lazyRouteDiscovery: true,
      },
    }),
  ],
  define: {
    // Polyfill crypto for browser environments (needed by some dependencies)
    global: "globalThis",
  },
  ssr: {
    noExternal: [
      /@prisma\/client/,
      /@prisma\/adapter-pg/,
      /@prisma\/driver-adapter-utils/,
    ],
  },
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "app"),
    },
  },
});
