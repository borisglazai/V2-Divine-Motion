/**
 * Éditeur visuel Phase 2 — À propos (`about_content` + its 2 child tables:
 * `about_story_paragraphs`, `about_approach_items`). Same singleton
 * draft/publish shape as home-editor-actions.ts, extended with the
 * fixed-count children merge below.
 *
 * `about_story_paragraphs`/`about_approach_items` are edited IN PLACE —
 * this phase never adds/removes a paragraph or an approach item, only
 * their existing text (Boris's brief: "les éléments de l'approche déjà
 * présents dans le schéma"). Since AboutView.astro only ever renders ONE
 * locale's Editable field per paragraph/item (same convention as every
 * other bilingual field on this site — see HomeView.astro), a save
 * request only ever carries the CURRENT locale's edited text. Writing
 * that straight into replaceDraftChildren (a wholesale delete+reinsert)
 * would silently blank the OTHER locale's text, so this module always
 * reads the draft's current children first and merges the edited locale
 * onto them before replacing — never trusts the form to carry the full
 * bilingual row.
 */
import * as pages from "@/lib/db/pages";
import { adminErrorMessage } from "./errors";
import { withFlash } from "./flash";
import { ensureSiteEditorDraft, publishSiteEditorPage, setSiteEditorLanguageStatusAction, siteEditorMediaIsUsable } from "./site-editor-shared";
import type { Locale } from "@/lib/db/types";

const REDIRECT_BASE = "/admin/site/a-propos";

export interface AboutEditorFields {
  heroTitleFr?: string;
  heroTitleEn?: string;
  heroIntroFr?: string;
  heroIntroEn?: string;
  heroMediaId?: number;
  storyLabelFr?: string;
  storyLabelEn?: string;
  approachLabelFr?: string;
  approachLabelEn?: string;
  finalCtaHeadlineFr?: string;
  finalCtaHeadlineEn?: string;
}

export interface ChildTextEdit {
  index: number;
  locale: Locale;
  text: string;
}

export interface ApproachItemEdit {
  index: number;
  locale: Locale;
  word?: string;
  text?: string;
}

function toRow(fields: AboutEditorFields): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (fields.heroTitleFr !== undefined) row.hero_title_fr = fields.heroTitleFr;
  if (fields.heroTitleEn !== undefined) row.hero_title_en = fields.heroTitleEn;
  if (fields.heroIntroFr !== undefined) row.hero_intro_fr = fields.heroIntroFr;
  if (fields.heroIntroEn !== undefined) row.hero_intro_en = fields.heroIntroEn;
  if (fields.heroMediaId !== undefined) row.hero_media_id = fields.heroMediaId;
  if (fields.storyLabelFr !== undefined) row.story_label_fr = fields.storyLabelFr;
  if (fields.storyLabelEn !== undefined) row.story_label_en = fields.storyLabelEn;
  if (fields.approachLabelFr !== undefined) row.approach_label_fr = fields.approachLabelFr;
  if (fields.approachLabelEn !== undefined) row.approach_label_en = fields.approachLabelEn;
  if (fields.finalCtaHeadlineFr !== undefined) row.final_cta_headline_fr = fields.finalCtaHeadlineFr;
  if (fields.finalCtaHeadlineEn !== undefined) row.final_cta_headline_en = fields.finalCtaHeadlineEn;
  return row;
}

export async function saveAboutEditorAction(
  db: D1Database,
  fields: AboutEditorFields,
  storyParagraphEdits: ChildTextEdit[],
  approachItemEdits: ApproachItemEdit[],
  updatedBy: string,
): Promise<{ redirect: string }> {
  if (fields.heroMediaId !== undefined && !(await siteEditorMediaIsUsable(db, fields.heroMediaId))) {
    return { redirect: withFlash(REDIRECT_BASE, "error", "Ce média n'est pas disponible (supprimé ou non prêt).") };
  }

  const draftResult = await ensureSiteEditorDraft(db, pages.aboutContent, updatedBy);
  if (!draftResult.ok) {
    return { redirect: withFlash(REDIRECT_BASE, "error", adminErrorMessage(draftResult.error)) };
  }
  const draftId = draftResult.data.draftId;

  const updated = await pages.updateAboutContentDraft(db, draftId, toRow(fields), updatedBy);
  if (!updated.ok) {
    return { redirect: withFlash(REDIRECT_BASE, "error", adminErrorMessage(updated.error)) };
  }

  if (storyParagraphEdits.length > 0) {
    const existing = await pages.aboutContent.getStoryParagraphs(db, draftId);
    const merged = existing.map((p, i) => {
      const edit = storyParagraphEdits.find((e) => e.index === i);
      if (!edit) return { position: p.position, textFr: p.text_fr, textEn: p.text_en };
      return {
        position: p.position,
        textFr: edit.locale === "fr" ? edit.text : p.text_fr,
        textEn: edit.locale === "en" ? edit.text : p.text_en,
      };
    });
    await pages.updateAboutDraftStoryParagraphs(db, draftId, merged);
  }

  if (approachItemEdits.length > 0) {
    const existing = await pages.aboutContent.getApproachItems(db, draftId);
    const merged = existing.map((item, i) => {
      const edit = approachItemEdits.find((e) => e.index === i);
      if (!edit) return { position: item.position, wordFr: item.word_fr, wordEn: item.word_en, textFr: item.text_fr, textEn: item.text_en };
      return {
        position: item.position,
        wordFr: edit.locale === "fr" && edit.word !== undefined ? edit.word : item.word_fr,
        wordEn: edit.locale === "en" && edit.word !== undefined ? edit.word : item.word_en,
        textFr: edit.locale === "fr" && edit.text !== undefined ? edit.text : item.text_fr,
        textEn: edit.locale === "en" && edit.text !== undefined ? edit.text : item.text_en,
      };
    });
    await pages.updateAboutDraftApproachItems(db, draftId, merged);
  }

  return { redirect: withFlash(REDIRECT_BASE, "success", "Brouillon enregistré.") };
}

export async function publishAboutEditorAction(db: D1Database, updatedBy: string): Promise<{ redirect: string }> {
  return publishSiteEditorPage(db, pages.aboutContent, REDIRECT_BASE, updatedBy);
}

export async function setAboutEditorLanguageStatusAction(
  db: D1Database,
  locale: Locale,
  status: "draft" | "published",
  updatedBy: string,
): Promise<{ redirect: string }> {
  return setSiteEditorLanguageStatusAction(db, pages.aboutContent, REDIRECT_BASE, locale, status, updatedBy);
}
