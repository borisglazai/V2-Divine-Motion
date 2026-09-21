/**
 * `src/i18n/ui.ts` reads `__BUILD_YEAR__` — a compile-time constant that
 * astro.config.mjs's `vite.define` injects for the real Astro/Vite build
 * (see that file's own comment: workerd freezes `Date` outside live
 * request handling, so `new Date()` at module scope can't be used
 * directly). Plain `node --test`/tsx never runs through Vite, so that
 * define never exists — this `--import`-loaded shim provides the same
 * global ahead of any test module that transitively imports `t()` from
 * src/i18n/ui.ts (Production Readiness Step 1: src/lib/contact/submit-action.ts
 * is the first pure-TS module under test to need public UI copy directly).
 */
globalThis.__BUILD_YEAR__ = new Date().getFullYear();
