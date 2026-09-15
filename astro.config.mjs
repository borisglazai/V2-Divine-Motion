import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

// Cloudflare Workers-compatible from day one (Technical Architecture: single
// Worker for render + API). Every page in this foundations phase opts into
// prerender = true (static at build time) — no dynamic route exists yet.
// Phase 4/5 add on-demand routes (contact API, CMS) without reconfiguring.
export default defineConfig({
  output: "server",
  adapter: cloudflare({
    imageService: "passthrough",
  }),
  site: "https://divinemotion.ca",
  trailingSlash: "never",
  vite: {
    define: {
      // Cloudflare's workerd runtime (which the cloudflare adapter renders
      // through, including at prerender time) freezes Date to the Unix
      // epoch for any code evaluated outside of live request handling —
      // so `new Date()` at module scope in src/i18n/ui.ts silently baked
      // "1970" into the static footer. Inject the real value from plain
      // Node (this config file runs outside workerd) instead.
      __BUILD_YEAR__: JSON.stringify(new Date().getFullYear()),
    },
  },
});
