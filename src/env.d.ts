/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

// Set by src/middleware.ts after a successful Cloudflare Access JWT
// verification (Brief 012) — only ever present on /admin requests that
// passed requireAdmin(); never set, never trusted, elsewhere.
declare namespace App {
  interface Locals {
    adminIdentity?: import("./lib/auth/access").AdminIdentity;
  }
}
