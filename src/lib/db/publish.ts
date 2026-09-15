/**
 * Generic draft/publish engine (ADR-013) — the one mechanism shared by
 * every publicly-editable entity: work_items, services, testimonials,
 * and the 5 page-content tables. Each entity module (work.ts, services.ts,
 * ...) is a thin, typed wrapper around the functions here; this file is
 * the only place the actual transaction shape is written down.
 *
 * `status` vs `fr_status`/`en_status` — two DELIBERATELY separate levers:
 *   - `status` ('draft' | 'published') says whether THIS ROW is the live
 *     published row or a pending draft shadow (`draft_of_id` points at
 *     its published parent when it is). That's what this file manages.
 *   - `fr_status`/`en_status` say whether each language is ready/live on
 *     the PUBLISHED row. They are NOT touched by `publishDraft` here —
 *     see `setLanguageStatus` below. This keeps "safely edit content"
 *     and "toggle a language live" as two independent, single-purpose
 *     actions rather than one action doing two things. See
 *     docs/DATA_ARCHITECTURE.md "DAL: draft/publish vs language status".
 *
 * D1 transactions (Brief 011 §21) — `D1Database.batch()` is the only
 * atomicity primitive D1 exposes (confirmed against the generated
 * `worker-configuration.d.ts`: no BEGIN/COMMIT, no interactive
 * transactions in the public binding API). `batch()` runs a FIXED array
 * of prepared statements atomically (all-or-nothing) but a later
 * statement can never depend on an earlier statement's *result* within
 * the same batch (e.g. an auto-generated id).
 *
 *   - `publishDraft` is FULLY atomic: both the draft row's id and the
 *     published row's id are already known before it starts, so the
 *     entire merge (snapshot insert, published-row update, child
 *     replace, draft delete) is one `batch()` call.
 *   - `createDraftFromPublished` / `createNewDraft` are NOT fully atomic
 *     end-to-end when the entity has children: the new draft row must be
 *     INSERTed first (to learn its auto-generated id via `RETURNING id`)
 *     before its children can be copied with that id as their parent —
 *     two round-trips, not one `batch()`. The window between them is a
 *     draft row that briefly has no children. This is an accepted,
 *     documented tradeoff for a single-admin, low-concurrency CMS — see
 *     docs/DATA_ARCHITECTURE.md.
 */
import type { DbError, Publishable, Result, SnapshotEntityType } from "./types";
import { fail, ok } from "./types";
import { nowMs } from "./mappers";
import { buildSnapshotStatement, pruneOldSnapshots } from "./snapshots";

export interface ChildTableConfig {
  table: string;
  /** FK column on the child table pointing back at the parent row's id. */
  parentColumn: string;
  /** Child columns copied verbatim, in this exact order (never includes id/parentColumn). */
  copyColumns: readonly string[];
}

export interface PublishableConfig {
  table: string;
  /**
   * Columns copied draft -> published when merging. Never includes id,
   * status, draft_of_id, created_at, created_by, fr_status, en_status,
   * fr_published_at, en_published_at (see header comment).
   */
  copyColumns: readonly string[];
  children?: readonly ChildTableConfig[];
}

type Row = Record<string, unknown> & Publishable;

async function getRow(db: D1Database, table: string, id: number): Promise<Row | null> {
  const row = await db.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<Row>();
  return row ?? null;
}

async function getChildren(db: D1Database, child: ChildTableConfig, parentId: number) {
  const { results } = await db
    .prepare(`SELECT * FROM ${child.table} WHERE ${child.parentColumn} = ? ORDER BY position`)
    .bind(parentId)
    .all();
  return results;
}

function insertStatement(db: D1Database, table: string, fields: Record<string, unknown>) {
  const columns = Object.keys(fields);
  const placeholders = columns.map(() => "?").join(", ");
  return db
    .prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders}) RETURNING id`)
    .bind(...columns.map((c) => fields[c]));
}

/** Finds the existing draft shadow of a published row, if any. */
export async function getDraftOf(
  db: D1Database,
  table: string,
  publishedId: number,
): Promise<Row | null> {
  const row = await db
    .prepare(`SELECT * FROM ${table} WHERE draft_of_id = ? AND status = 'draft'`)
    .bind(publishedId)
    .first<Row>();
  return row ?? null;
}

/**
 * Copies a published row into a new draft shadow (`draft_of_id` set),
 * including its children. Fails with DRAFT_ALREADY_EXISTS if one exists
 * already (the partial unique index on `draft_of_id` would reject a
 * second one anyway — this check gives a clear business error instead of
 * a raw SQL constraint message).
 */
export async function createDraftFromPublished(
  db: D1Database,
  config: PublishableConfig,
  publishedId: number,
  updatedBy?: string,
): Promise<Result<{ draftId: number }>> {
  const published = await getRow(db, config.table, publishedId);
  if (!published || published.status !== "published") {
    return fail("NOT_FOUND", `${config.table} #${publishedId} is not a published row`);
  }
  const existingDraft = await getDraftOf(db, config.table, publishedId);
  if (existingDraft) {
    return fail(
      "DRAFT_ALREADY_EXISTS",
      `${config.table} #${publishedId} already has a draft (#${existingDraft.id})`,
    );
  }

  const now = nowMs();
  const fields: Record<string, unknown> = { status: "draft", draft_of_id: publishedId };
  for (const col of config.copyColumns) fields[col] = published[col];
  // The draft row still needs schema-valid fr_status/en_status (NOT NULL)
  // even though publishDraft() never copies them onward — see header.
  fields.fr_status = published.fr_status;
  fields.en_status = published.en_status;
  fields.fr_published_at = null;
  fields.en_published_at = null;
  fields.created_at = now;
  fields.updated_at = now;
  fields.created_by = updatedBy ?? null;
  fields.updated_by = updatedBy ?? null;

  const insertResult = await insertStatement(db, config.table, fields).run<{ id: number }>();
  const draftId = insertResult.results[0].id;

  if (config.children?.length) {
    const copyChildStatements = config.children.map((child) =>
      db
        .prepare(
          `INSERT INTO ${child.table} (${child.parentColumn}, ${child.copyColumns.join(", ")}) ` +
            `SELECT ?, ${child.copyColumns.join(", ")} FROM ${child.table} WHERE ${child.parentColumn} = ?`,
        )
        .bind(draftId, publishedId),
    );
    await db.batch(copyChildStatements);
  }

  return ok({ draftId });
}

/** Creates a brand-new item, never published before: status='draft', draft_of_id=NULL. */
export async function createNewDraft(
  db: D1Database,
  config: PublishableConfig,
  fields: Record<string, unknown>,
  children: Record<string, Record<string, unknown>[]> = {},
  updatedBy?: string,
): Promise<Result<{ draftId: number }>> {
  const now = nowMs();
  const insertFields: Record<string, unknown> = {
    status: "draft",
    draft_of_id: null,
    ...fields,
    created_at: now,
    updated_at: now,
    created_by: updatedBy ?? null,
    updated_by: updatedBy ?? null,
  };

  const insertResult = await insertStatement(db, config.table, insertFields).run<{ id: number }>();
  const draftId = insertResult.results[0].id;

  const childConfigs = config.children ?? [];
  const childStatements = childConfigs.flatMap((child) => {
    const rows = children[child.table] ?? [];
    return rows.map((row) => {
      const cols = [child.parentColumn, ...child.copyColumns];
      const placeholders = cols.map(() => "?").join(", ");
      return db
        .prepare(`INSERT INTO ${child.table} (${cols.join(", ")}) VALUES (${placeholders})`)
        .bind(draftId, ...child.copyColumns.map((c) => row[c]));
    });
  });
  if (childStatements.length) await db.batch(childStatements);

  return ok({ draftId });
}

/**
 * Updates a draft's own fields. Deliberately scoped to `WHERE id = ? AND
 * status = 'draft'` — updating a published row's content through this
 * function is structurally impossible, not just discouraged (Brief 011
 * §19: "rendre le mauvais usage difficile").
 */
export async function updateDraft(
  db: D1Database,
  table: string,
  draftId: number,
  fields: Record<string, unknown>,
  updatedBy?: string,
): Promise<Result<void>> {
  const columns = Object.keys(fields);
  if (columns.length === 0) return ok(undefined);
  const setClause = columns.map((c) => `${c} = ?`).join(", ");
  const result = await db
    .prepare(`UPDATE ${table} SET ${setClause}, updated_at = ?, updated_by = ? WHERE id = ? AND status = 'draft'`)
    .bind(...columns.map((c) => fields[c]), nowMs(), updatedBy ?? null, draftId)
    .run();
  if (result.meta.changes === 0) {
    return fail("NO_DRAFT", `No draft row #${draftId} to update`);
  }
  return ok(undefined);
}

/** Replaces a draft's children wholesale (delete all, insert the new list) — draftId is already known, so this is one atomic batch(). */
export async function replaceDraftChildren(
  db: D1Database,
  child: ChildTableConfig,
  draftId: number,
  rows: Record<string, unknown>[],
): Promise<void> {
  const stmts = [db.prepare(`DELETE FROM ${child.table} WHERE ${child.parentColumn} = ?`).bind(draftId)];
  for (const row of rows) {
    const cols = [child.parentColumn, ...child.copyColumns];
    const placeholders = cols.map(() => "?").join(", ");
    stmts.push(
      db
        .prepare(`INSERT INTO ${child.table} (${cols.join(", ")}) VALUES (${placeholders})`)
        .bind(draftId, ...child.copyColumns.map((c) => row[c])),
    );
  }
  await db.batch(stmts);
}

/** Discards a draft (never the published row — the WHERE clause enforces this). */
export async function deleteDraft(db: D1Database, table: string, draftId: number): Promise<Result<void>> {
  const result = await db
    .prepare(`DELETE FROM ${table} WHERE id = ? AND status = 'draft'`)
    .bind(draftId)
    .run();
  if (result.meta.changes === 0) {
    return fail("NO_DRAFT", `No draft row #${draftId} to delete`);
  }
  return ok(undefined);
}

export interface PublishOptions {
  /** App-level business check run BEFORE any SQL — e.g. media publication rights (Brief 011 §24). Return a DbError to abort, or null to proceed. */
  preflight?: (draft: Row) => Promise<DbError | null>;
  /** Who performed the publish, recorded on the published row's updated_by. */
  updatedBy?: string;
}

/**
 * Publishes a draft. See header comment: this is the one fully atomic
 * operation in this file — both ids are known upfront.
 *
 * Case A — draft_of_id is set (editing existing content): snapshot the
 * published row's current copyColumns + children, copy the draft's
 * copyColumns onto the published row, replace the published row's
 * children with the draft's children, delete the draft. fr_status/
 * en_status on the published row are untouched (see header).
 *
 * Case B — draft_of_id is NULL (first-ever publish of new content): no
 * prior published state to snapshot or diff against — the draft row is
 * simply flipped to status='published' in place, keeping its own id and
 * its own already-correctly-parented children.
 */
export async function publishDraft(
  db: D1Database,
  config: PublishableConfig,
  draftId: number,
  options: PublishOptions = {},
): Promise<Result<{ publishedId: number }>> {
  const draft = await getRow(db, config.table, draftId);
  if (!draft || draft.status !== "draft") {
    return fail("NO_DRAFT", `No draft row #${draftId} to publish`);
  }

  if (options.preflight) {
    const error = await options.preflight(draft);
    if (error) return { ok: false, error };
  }

  const now = nowMs();

  // Case B — brand-new content, nothing published before.
  if (draft.draft_of_id === null) {
    await db.batch([
      db
        .prepare(`UPDATE ${config.table} SET status = 'published', updated_at = ?, updated_by = ? WHERE id = ? AND status = 'draft'`)
        .bind(now, options.updatedBy ?? null, draftId),
    ]);
    return ok({ publishedId: draftId });
  }

  // Case A — merging into an existing published row.
  const publishedId = draft.draft_of_id as number;
  const published = await getRow(db, config.table, publishedId);
  if (!published) {
    return fail("INVALID_STATE", `Draft #${draftId} points at missing published row #${publishedId}`);
  }

  const snapshotPayload: Record<string, unknown> = { id: publishedId };
  for (const col of config.copyColumns) snapshotPayload[col] = published[col];

  const statements = [];

  if (config.children?.length) {
    const childSnapshots: Record<string, unknown[]> = {};
    for (const child of config.children) {
      childSnapshots[child.table] = await getChildren(db, child, publishedId);
    }
    snapshotPayload.children = childSnapshots;
  }

  const entityType = snapshotEntityType(config.table);
  statements.push(
    buildSnapshotStatement(db, entityType, String(publishedId), snapshotPayload, options.updatedBy, now),
  );

  const setClause = config.copyColumns.map((c) => `${c} = ?`).join(", ");
  statements.push(
    db
      .prepare(`UPDATE ${config.table} SET ${setClause}, updated_at = ?, updated_by = ? WHERE id = ? AND status = 'published'`)
      .bind(...config.copyColumns.map((c) => draft[c]), now, options.updatedBy ?? null, publishedId),
  );

  for (const child of config.children ?? []) {
    statements.push(db.prepare(`DELETE FROM ${child.table} WHERE ${child.parentColumn} = ?`).bind(publishedId));
    statements.push(
      db.prepare(
        `INSERT INTO ${child.table} (${child.parentColumn}, ${child.copyColumns.join(", ")}) ` +
          `SELECT ?, ${child.copyColumns.join(", ")} FROM ${child.table} WHERE ${child.parentColumn} = ?`,
      ).bind(publishedId, draftId),
    );
  }

  statements.push(db.prepare(`DELETE FROM ${config.table} WHERE id = ? AND status = 'draft'`).bind(draftId));

  await db.batch(statements);
  // Pruning runs after the batch commits, deliberately not atomic with it
  // — see snapshots.ts header comment.
  await pruneOldSnapshots(db, entityType, String(publishedId));

  return ok({ publishedId });
}

export interface LanguageStatusOptions {
  /** App-level business check run BEFORE the SQL — e.g. media publication rights. Return a DbError to abort. */
  preflight?: (row: Row) => Promise<DbError | null>;
  updatedBy?: string;
}

/**
 * Sets `fr_status`/`en_status` directly on a PUBLISHED row — the
 * independent lever described in the header comment, never routed
 * through a draft. Setting to 'published' stamps `{locale}_published_at`;
 * any other value clears it. The D1 rights-gate triggers (ADR-011) still
 * apply as the last line of defense; `preflight` lets the caller return a
 * clear business error before the trigger would raise a raw SQL abort.
 */
export async function setLanguageStatus(
  db: D1Database,
  table: string,
  publishedId: number,
  locale: "fr" | "en",
  status: "draft" | "published" | "archived",
  options: LanguageStatusOptions = {},
): Promise<Result<void>> {
  const row = await getRow(db, table, publishedId);
  if (!row || row.status !== "published") {
    return fail("NOT_FOUND", `${table} #${publishedId} is not a published row`);
  }

  if (options.preflight) {
    const error = await options.preflight(row);
    if (error) return { ok: false, error };
  }

  const statusCol = `${locale}_status`;
  const publishedAtCol = `${locale}_published_at`;
  const now = nowMs();
  const result = await db
    .prepare(
      `UPDATE ${table} SET ${statusCol} = ?, ${publishedAtCol} = ?, updated_at = ?, updated_by = ? WHERE id = ? AND status = 'published'`,
    )
    .bind(status, status === "published" ? now : null, now, options.updatedBy ?? null, publishedId)
    .run();

  if (result.meta.changes === 0) {
    return fail("NOT_FOUND", `${table} #${publishedId} is not a published row`);
  }
  return ok(undefined);
}

function snapshotEntityType(table: string): SnapshotEntityType {
  // work_items -> work_item, services -> service, testimonials -> testimonial,
  // *_content -> itself (already matches the CHECK-constrained list in
  // migrations/0001_initial.sql).
  const map: Record<string, SnapshotEntityType> = {
    work_items: "work_item",
    services: "service",
    testimonials: "testimonial",
    home_content: "home_content",
    work_page_content: "work_page_content",
    services_page_content: "services_page_content",
    about_content: "about_content",
    contact_content: "contact_content",
  };
  return map[table];
}
