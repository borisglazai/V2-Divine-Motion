/**
 * Page content repositories — 5 singleton tables (Accueil, Travail,
 * Services, À propos, Contact). Confidentialité is deliberately absent:
 * legal text stays code/doc-driven (docs/DATA_ARCHITECTURE.md
 * "Confidentialité: hors modèle CMS pour le contenu").
 *
 * Each page always has exactly one published row (seeded once, never
 * deleted) — there is no "create a brand-new page" scenario, only
 * "draft an edit of the existing one, then publish or discard it". A
 * small shared factory (`pageRepo`) removes the near-identical
 * get/draft/publish boilerplate across the 5 tables without hiding any
 * SQL behind a generic framework — each page still declares its own
 * typed Input/update function by hand, because their field shapes
 * genuinely differ.
 */
import type {
  AboutApproachItemRow,
  AboutContentRow,
  AboutStoryParagraphRow,
  ContactContentRow,
  HomeContentRow,
  Locale,
  Result,
  ServicesApproachStepRow,
  ServicesPageContentRow,
  WorkPageContentRow,
} from "./types";
import { fail } from "./types";
import { getMedia } from "./media";
import {
  createDraftFromPublished,
  deleteDraft,
  publishDraft,
  replaceDraftChildren,
  setLanguageStatus,
  updateDraft,
  type ChildTableConfig,
  type PublishableConfig,
} from "./publish";

/**
 * Éditeur visuel Phase 1 — `mediaFields` names the columns (if any) whose
 * referenced media must have confirmed publication rights before a
 * language can go live, same ADR-011 pattern as work_items/services/
 * testimonials. Empty for page tables with no media column
 * (`services_page_content`, `work_page_content`, `contact_content`).
 * `home_content` is the only page wired with real triggers so far
 * (migrations/0005_home_content_rights_gate.sql) — `about_content` has
 * media columns too but no real publish path yet (see that migration's
 * header), so it isn't passed here.
 */
function pageRepo<Row extends { id: number }>(config: PublishableConfig, mediaFields: readonly string[] = []) {
  async function mediaRightsConfirmed(db: D1Database, row: Record<string, unknown>): Promise<boolean> {
    for (const field of mediaFields) {
      const mediaId = row[field] as number | null | undefined;
      if (mediaId === null || mediaId === undefined) continue;
      const media = await getMedia(db, mediaId);
      if (!media || media.publication_rights_confirmed !== 1) return false;
    }
    return true;
  }

  return {
    async getPublished(db: D1Database): Promise<Row | null> {
      const row = await db.prepare(`SELECT * FROM ${config.table} WHERE status = 'published'`).first<Row>();
      return row ?? null;
    },
    async getDraft(db: D1Database): Promise<Row | null> {
      const row = await db.prepare(`SELECT * FROM ${config.table} WHERE status = 'draft'`).first<Row>();
      return row ?? null;
    },
    async createDraft(db: D1Database, updatedBy?: string): Promise<Result<{ draftId: number }>> {
      const published = await db.prepare(`SELECT id FROM ${config.table} WHERE status = 'published'`).first<{ id: number }>();
      if (!published) return fail("NOT_FOUND", `${config.table} has no published row`);
      return createDraftFromPublished(db, config, published.id, updatedBy);
    },
    async discardDraft(db: D1Database, draftId: number): Promise<Result<void>> {
      return deleteDraft(db, config.table, draftId);
    },
    /**
     * Content merge (draft -> published). Preflight mirrors publishWorkItem/
     * publishService: only blocks when the merge would make an unrighted
     * media visible on a row that already has a live language — a page's
     * very first publish (nothing live yet) is never blocked here.
     */
    async publish(db: D1Database, draftId: number, updatedBy?: string): Promise<Result<{ publishedId: number }>> {
      return publishDraft(db, config, draftId, {
        updatedBy,
        preflight: async (draft) => {
          if (mediaFields.length === 0) return null;
          const publishedId = draft.draft_of_id as number | null;
          if (publishedId === null) return null;

          const published = await db
            .prepare(`SELECT fr_status, en_status FROM ${config.table} WHERE id = ?`)
            .bind(publishedId)
            .first<{ fr_status: string; en_status: string }>();
          if (!published) return null;

          const anyLanguageLive = published.fr_status === "published" || published.en_status === "published";
          if (!anyLanguageLive) return null;

          if (!(await mediaRightsConfirmed(db, draft))) {
            return {
              code: "PUBLICATION_RIGHTS_REQUIRED",
              message: `${config.table} #${publishedId}: this row has a live language — the draft's media publication rights must be confirmed before publishing`,
            };
          }
          return null;
        },
      });
    },
    /** The independent FR/EN visibility lever — same pattern as setWorkItemLanguageStatus/setServiceLanguageStatus. */
    async setLanguageStatus(db: D1Database, locale: Locale, status: "draft" | "published", updatedBy?: string): Promise<Result<void>> {
      const published = await db.prepare(`SELECT id FROM ${config.table} WHERE status = 'published'`).first<{ id: number }>();
      if (!published) return fail("NOT_FOUND", `${config.table} has no published row`);
      return setLanguageStatus(db, config.table, published.id, locale, status, {
        updatedBy,
        preflight: async (row) => {
          if (status !== "published" || mediaFields.length === 0) return null;
          if (!(await mediaRightsConfirmed(db, row))) {
            return {
              code: "PUBLICATION_RIGHTS_REQUIRED",
              message: `${config.table}: referenced media publication rights are not confirmed`,
            };
          }
          return null;
        },
      });
    },
  };
}

// ---------------------------------------------------------------------------
// HOME
// ---------------------------------------------------------------------------
const HOME_CONFIG: PublishableConfig = {
  table: "home_content",
  copyColumns: [
    "hero_headline_fr",
    "hero_headline_en",
    "hero_subline_fr",
    "hero_subline_en",
    "hero_media_id",
    "hero_image_alt_fr",
    "hero_image_alt_en",
    "work_preview_label_fr",
    "work_preview_label_en",
    "work_preview_link_label_fr",
    "work_preview_link_label_en",
    "brand_statement_fr",
    "brand_statement_en",
    "services_preview_label_fr",
    "services_preview_label_en",
    "editorial_media_id",
    "editorial_image_alt_fr",
    "editorial_image_alt_en",
    "about_preview_label_fr",
    "about_preview_label_en",
    "about_preview_text_fr",
    "about_preview_text_en",
    "about_preview_media_id",
    "about_preview_image_alt_fr",
    "about_preview_image_alt_en",
    "final_cta_headline_fr",
    "final_cta_headline_en",
    "work_preview_visible",
    "brand_statement_visible",
    "services_preview_visible",
    "editorial_visible",
    "about_preview_visible",
  ],
};
export const homeContent = pageRepo<HomeContentRow>(HOME_CONFIG, ["hero_media_id", "editorial_media_id", "about_preview_media_id"]);

/**
 * Public media route's authorization check (src/lib/public-media.ts),
 * home_content's side of the same trust boundary
 * isMediaUsedByPublicWorkItem/Service/Testimonial enforce elsewhere —
 * true only if this media is currently referenced by home_content AND
 * the page is actually live (published row, at least one language live).
 */
export async function isMediaUsedByPublicHomeContent(db: D1Database, mediaId: number): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 FROM home_content WHERE status = 'published' AND (fr_status = 'published' OR en_status = 'published') AND (hero_media_id = ? OR editorial_media_id = ? OR about_preview_media_id = ?) LIMIT 1`,
    )
    .bind(mediaId, mediaId, mediaId)
    .first();
  return row !== null;
}

export async function updateHomeContentDraft(
  db: D1Database,
  draftId: number,
  fields: Partial<Record<(typeof HOME_CONFIG.copyColumns)[number], unknown>>,
  updatedBy?: string,
): Promise<Result<void>> {
  return updateDraft(db, HOME_CONFIG.table, draftId, fields, updatedBy);
}

// ---------------------------------------------------------------------------
// WORK PAGE
// ---------------------------------------------------------------------------
const WORK_PAGE_CONFIG: PublishableConfig = {
  table: "work_page_content",
  copyColumns: ["title_fr", "title_en", "intro_fr", "intro_en", "cta_headline_fr", "cta_headline_en", "gallery_layout"],
};
export const workPageContent = pageRepo<WorkPageContentRow>(WORK_PAGE_CONFIG);

export async function updateWorkPageContentDraft(
  db: D1Database,
  draftId: number,
  fields: Partial<Record<(typeof WORK_PAGE_CONFIG.copyColumns)[number], unknown>>,
  updatedBy?: string,
): Promise<Result<void>> {
  return updateDraft(db, WORK_PAGE_CONFIG.table, draftId, fields, updatedBy);
}

// ---------------------------------------------------------------------------
// SERVICES PAGE (+ approach steps)
// ---------------------------------------------------------------------------
const SERVICES_APPROACH_STEPS_CHILD: ChildTableConfig = {
  table: "services_approach_steps",
  parentColumn: "services_page_id",
  copyColumns: ["position", "title_fr", "title_en", "text_fr", "text_en"],
};
const SERVICES_PAGE_CONFIG: PublishableConfig = {
  table: "services_page_content",
  copyColumns: [
    "title_fr",
    "title_en",
    "intro_fr",
    "intro_en",
    "approach_label_fr",
    "approach_label_en",
    "cta_headline_fr",
    "cta_headline_en",
  ],
  children: [SERVICES_APPROACH_STEPS_CHILD],
};
const servicesPageRepo = pageRepo<ServicesPageContentRow>(SERVICES_PAGE_CONFIG);

export const servicesPageContent = {
  ...servicesPageRepo,
  async getApproachSteps(db: D1Database, servicesPageId: number): Promise<ServicesApproachStepRow[]> {
    const { results } = await db
      .prepare(`SELECT * FROM services_approach_steps WHERE services_page_id = ? ORDER BY position`)
      .bind(servicesPageId)
      .all<ServicesApproachStepRow>();
    return results;
  },
};

export async function updateServicesPageContentDraft(
  db: D1Database,
  draftId: number,
  fields: Partial<Record<(typeof SERVICES_PAGE_CONFIG.copyColumns)[number], unknown>>,
  updatedBy?: string,
): Promise<Result<void>> {
  return updateDraft(db, SERVICES_PAGE_CONFIG.table, draftId, fields, updatedBy);
}

export interface ApproachStepInput {
  position: number;
  titleFr: string;
  titleEn: string;
  textFr: string;
  textEn: string;
}

/** Replaces the draft's approach steps wholesale — the published page's steps are untouched until publish. */
export async function updateServicesPageDraftApproachSteps(
  db: D1Database,
  draftId: number,
  steps: ApproachStepInput[],
): Promise<void> {
  return replaceDraftChildren(
    db,
    SERVICES_APPROACH_STEPS_CHILD,
    draftId,
    steps.map((s) => ({ position: s.position, title_fr: s.titleFr, title_en: s.titleEn, text_fr: s.textFr, text_en: s.textEn })),
  );
}

// ---------------------------------------------------------------------------
// ABOUT (+ story paragraphs, + approach items)
// ---------------------------------------------------------------------------
const ABOUT_STORY_PARAGRAPHS_CHILD: ChildTableConfig = {
  table: "about_story_paragraphs",
  parentColumn: "about_id",
  copyColumns: ["position", "text_fr", "text_en"],
};
const ABOUT_APPROACH_ITEMS_CHILD: ChildTableConfig = {
  table: "about_approach_items",
  parentColumn: "about_id",
  copyColumns: ["position", "word_fr", "word_en", "text_fr", "text_en"],
};
const ABOUT_CONFIG: PublishableConfig = {
  table: "about_content",
  copyColumns: [
    "hero_title_fr",
    "hero_title_en",
    "hero_intro_fr",
    "hero_intro_en",
    "hero_media_id",
    "hero_ratio",
    "hero_image_alt_fr",
    "hero_image_alt_en",
    "story_label_fr",
    "story_label_en",
    "approach_label_fr",
    "approach_label_en",
    "breathing_media_id",
    "breathing_ratio",
    "breathing_image_alt_fr",
    "breathing_image_alt_en",
    "human_note_text_fr",
    "human_note_text_en",
    "human_note_media_id",
    "human_note_ratio",
    "human_note_image_alt_fr",
    "human_note_image_alt_en",
    "final_cta_headline_fr",
    "final_cta_headline_en",
  ],
  children: [ABOUT_STORY_PARAGRAPHS_CHILD, ABOUT_APPROACH_ITEMS_CHILD],
};
/**
 * Éditeur visuel Phase 2 — `about_content` gets its first real publish
 * path (`/admin/site/a-propos`), so it now needs the same rights-gate
 * preflight home_content/services already have (migrations/0006). All 3
 * media columns are listed even though this phase's admin UI only wires
 * `hero_media_id` for editing — breathing_media_id/human_note_media_id
 * stay whatever the seed set them to, but the preflight still protects
 * them, same reasoning as home_content's editorial/about-preview fields.
 */
const aboutRepo = pageRepo<AboutContentRow>(ABOUT_CONFIG, ["hero_media_id", "breathing_media_id", "human_note_media_id"]);

export const aboutContent = {
  ...aboutRepo,
  async getStoryParagraphs(db: D1Database, aboutId: number): Promise<AboutStoryParagraphRow[]> {
    const { results } = await db
      .prepare(`SELECT * FROM about_story_paragraphs WHERE about_id = ? ORDER BY position`)
      .bind(aboutId)
      .all<AboutStoryParagraphRow>();
    return results;
  },
  async getApproachItems(db: D1Database, aboutId: number): Promise<AboutApproachItemRow[]> {
    const { results } = await db
      .prepare(`SELECT * FROM about_approach_items WHERE about_id = ? ORDER BY position`)
      .bind(aboutId)
      .all<AboutApproachItemRow>();
    return results;
  },
};

/**
 * Public media route's authorization check (src/lib/public-media.ts),
 * about_content's side of the same trust boundary
 * isMediaUsedByPublicWorkItem/Service/Testimonial/HomeContent enforce
 * elsewhere — true only if this media is currently referenced by
 * about_content AND the page is actually live.
 */
export async function isMediaUsedByPublicAboutContent(db: D1Database, mediaId: number): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 FROM about_content WHERE status = 'published' AND (fr_status = 'published' OR en_status = 'published') AND (hero_media_id = ? OR breathing_media_id = ? OR human_note_media_id = ?) LIMIT 1`,
    )
    .bind(mediaId, mediaId, mediaId)
    .first();
  return row !== null;
}

export async function updateAboutContentDraft(
  db: D1Database,
  draftId: number,
  fields: Partial<Record<(typeof ABOUT_CONFIG.copyColumns)[number], unknown>>,
  updatedBy?: string,
): Promise<Result<void>> {
  return updateDraft(db, ABOUT_CONFIG.table, draftId, fields, updatedBy);
}

export async function updateAboutDraftStoryParagraphs(
  db: D1Database,
  draftId: number,
  paragraphs: { position: number; textFr: string; textEn: string }[],
): Promise<void> {
  return replaceDraftChildren(
    db,
    ABOUT_STORY_PARAGRAPHS_CHILD,
    draftId,
    paragraphs.map((p) => ({ position: p.position, text_fr: p.textFr, text_en: p.textEn })),
  );
}

export async function updateAboutDraftApproachItems(
  db: D1Database,
  draftId: number,
  items: { position: number; wordFr: string; wordEn: string; textFr: string; textEn: string }[],
): Promise<void> {
  return replaceDraftChildren(
    db,
    ABOUT_APPROACH_ITEMS_CHILD,
    draftId,
    items.map((i) => ({
      position: i.position,
      word_fr: i.wordFr,
      word_en: i.wordEn,
      text_fr: i.textFr,
      text_en: i.textEn,
    })),
  );
}

// ---------------------------------------------------------------------------
// CONTACT
// ---------------------------------------------------------------------------
const CONTACT_CONFIG: PublishableConfig = {
  table: "contact_content",
  copyColumns: [
    "hero_title_fr",
    "hero_title_en",
    "hero_subtext_fr",
    "hero_subtext_en",
    "details_label_fr",
    "details_label_en",
    "closing_note_fr",
    "closing_note_en",
  ],
};
export const contactContent = pageRepo<ContactContentRow>(CONTACT_CONFIG);

export async function updateContactContentDraft(
  db: D1Database,
  draftId: number,
  fields: Partial<Record<(typeof CONTACT_CONFIG.copyColumns)[number], unknown>>,
  updatedBy?: string,
): Promise<Result<void>> {
  return updateDraft(db, CONTACT_CONFIG.table, draftId, fields, updatedBy);
}
