/**
 * The ONE file in src/lib/auth/ allowed to reach for the live Cloudflare
 * Access configuration — mirrors `src/lib/db/client.ts` exactly (same
 * `cloudflare:workers` `env` export, same reasoning: every other function
 * takes its config as an explicit parameter instead of a hidden global).
 */
import { env } from "cloudflare:workers";
import type { AccessConfig } from "./access";

const PLACEHOLDER_PREFIX = "REPLACE_WITH_";

/**
 * Returns the real Access config from `wrangler.toml` `[vars]` (or
 * environment-specific overrides), or `null` if it's missing or still a
 * committed placeholder (see wrangler.toml) — callers must fail closed on
 * `null`, never fall back to a default identity.
 */
export function getAccessConfig(): Pick<AccessConfig, "teamDomain" | "audience"> | null {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN;
  const audience = env.CF_ACCESS_AUD;
  if (!teamDomain || !audience) return null;
  if (teamDomain.startsWith(PLACEHOLDER_PREFIX) || audience.startsWith(PLACEHOLDER_PREFIX)) return null;
  return { teamDomain, audience };
}
