import react from "@astrojs/react";
import netlify from "@astrojs/netlify";
import { defineConfig } from "astro/config";

const isDev = process.argv.includes("dev");
// `astro dev` does not need Netlify's local emulators. Marking the process as
// Netlify dev makes the Vite plugin a no-op while keeping the Netlify adapter
// available for Astro server islands. This avoids touching the global Netlify
// CLI config (which may be read-only in local sandboxes/CI).
if (isDev) {
  process.env.NETLIFY_DEV = "true";
}

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || undefined,
  integrations: [react()],
  output: "server",
  // The toolbar is useful for Astro debugging, but its dev-only optimized
  // module can become stale while the Convex/React islands are reloaded. Keep
  // it out of this content-focused studio so 504 toolbar requests cannot mask
  // real application errors.
  devToolbar: {
    enabled: false,
  },
  // The home page uses an Astro server island to stream the managed snapshot.
  // The adapter must be present in dev as well as build mode or Astro rejects
  // the `server:defer` boundary before rendering the page.
  // Keep the Netlify runtime available for server islands in local dev, but
  // disable Netlify's optional local emulators. They attempt to persist the
  // CLI token in the user's global AppData directory, which is unavailable in
  // restricted/local environments and prevents Astro from starting at all.
  adapter: netlify({ devFeatures: false }),
  build: {
    inlineStylesheets: "auto",
  },
  vite: {
    // Keep Motion on Vite's source path in dev. A stale optimized Motion chunk
    // can return a 504 and abort the shared interaction bootstrap, which makes
    // otherwise server-rendered cards look inert locally. Production remains
    // fully bundled by Astro/Netlify.
    optimizeDeps: {
      exclude: ["motion"],
    },
    build: {
      cssMinify: "lightningcss",
    },
  },
});
