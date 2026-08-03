import react from "@astrojs/react";
import netlify from "@astrojs/netlify";
import { defineConfig } from "astro/config";

const isBuild = process.argv.some((argument) => argument === "build");

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
  // Netlify's Vite plugin is needed for the production function, but it also
  // writes a global Netlify config during `astro dev`. That write can fail in
  // local environments and terminate the dev server before client islands
  // hydrate. Use Astro's native dev server locally; keep the adapter for the
  // actual Netlify build.
  adapter: isBuild ? netlify() : undefined,
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
