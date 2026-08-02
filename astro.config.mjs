import react from "@astrojs/react";
import node from "@astrojs/node";
import { defineConfig } from "astro/config";

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
  adapter: node({ mode: "standalone" }),
  build: {
    inlineStylesheets: "auto",
  },
  vite: {
    build: {
      cssMinify: "lightningcss",
    },
  },
});
