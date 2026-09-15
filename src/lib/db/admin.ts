/**
 * Admin dashboard repository (Implementation Brief 012) — one small
 * dedicated read, not a place for the admin UI to run raw SQL itself
 * (Brief 012 §20). Counts only; no mutation, no business logic. Proof
 * that the admin surface reads real D1 through the DAL — see
 * `docs/ADMIN_SECURITY.md` "D1 runtime proof" and
 * `tests/dal/dal.test.ts`'s "admin dashboard" suite.
 */
export interface AdminDashboardSummary {
  mediaCount: number;
  workItemCount: number;
  activeServiceCount: number;
  testimonialCount: number;
  /** Draft shadow rows awaiting publication, across every table ADR-013 covers (work_items/services/testimonials + the 5 page-content tables). */
  pendingDraftCount: number;
}

const DRAFT_SHADOW_TABLES = [
  "work_items",
  "services",
  "testimonials",
  "home_content",
  "work_page_content",
  "services_page_content",
  "about_content",
  "contact_content",
];

export async function getAdminDashboardSummary(db: D1Database): Promise<AdminDashboardSummary> {
  const statements = [
    db.prepare(`SELECT COUNT(*) AS count FROM media WHERE deleted_at IS NULL`),
    db.prepare(`SELECT COUNT(*) AS count FROM work_items WHERE status = 'published'`),
    db.prepare(`SELECT COUNT(*) AS count FROM services WHERE status = 'published' AND is_active = 1`),
    db.prepare(`SELECT COUNT(*) AS count FROM testimonials WHERE status = 'published' AND deleted_at IS NULL`),
    ...DRAFT_SHADOW_TABLES.map((table) => db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE status = 'draft'`)),
  ];

  const results = await db.batch<{ count: number }>(statements);
  const [mediaResult, workResult, servicesResult, testimonialsResult, ...draftResults] = results;
  const pendingDraftCount = draftResults.reduce((sum, r) => sum + r.results[0].count, 0);

  return {
    mediaCount: mediaResult.results[0].count,
    workItemCount: workResult.results[0].count,
    activeServiceCount: servicesResult.results[0].count,
    testimonialCount: testimonialsResult.results[0].count,
    pendingDraftCount,
  };
}
