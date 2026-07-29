import react from "@astrojs/react";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [react()],
  output: "static",
  build: {
    inlineStylesheets: "auto",
  },
  vite: {
    build: {
      cssMinify: "lightningcss",
    },
  },
});
