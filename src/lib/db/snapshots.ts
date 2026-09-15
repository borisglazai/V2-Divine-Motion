/**
 * Rollback safety net (docs/DATA_ARCHITECTURE.md "Versioning / Rollback")
 * — NOT a revision system, NOT a source of rendering. `publish.ts` is the
 * only caller. Keeps at most the last 5 snapshots per (entity_type,
 * entity_key), pruned after each insert.
 */
import type { SnapshotEntityType } from "./types";

const KEEP_PER_ENTITY = 5;

/**
 * Prepares (but does not run) the snapshot INSERT — the caller includes
 * this statement in its own `db.batch([...])` alongside the rest of a
 * publish transaction, so the snapshot is atomic with the change it
 * protects against. `payload` must already be a small, controlled object
 * (the entity's own content columns, never `SELECT *` — see publish.ts).
 */
export function buildSnapshotStatement(
  db: D1Database,
  entityType: SnapshotEntityType,
  entityKey: string,
  payload: Record<string, unknown>,
  createdBy: string | undefined,
  createdAt: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO content_snapshots (entity_type, entity_key, language, snapshot_json, created_at, created_by) VALUES (?, ?, 'both', ?, ?, ?)`,
    )
    .bind(entityType, entityKey, JSON.stringify(payload), createdAt, createdBy ?? null);
}

/**
 * Deletes snapshots beyond the most recent `KEEP_PER_ENTITY` for one
 * entity. Called AFTER the batch that inserted the new snapshot commits
 * — not atomic with it, deliberately: pruning is storage hygiene, not a
 * correctness requirement, so a process crash between "insert" and
 * "prune" leaves at worst one extra row, never a lost snapshot.
 */
export async function pruneOldSnapshots(
  db: D1Database,
  entityType: SnapshotEntityType,
  entityKey: string,
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM content_snapshots
       WHERE entity_type = ? AND entity_key = ?
         AND id NOT IN (
           SELECT id FROM content_snapshots
           WHERE entity_type = ? AND entity_key = ?
           ORDER BY created_at DESC, id DESC
           LIMIT ?
         )`,
    )
    .bind(entityType, entityKey, entityType, entityKey, KEEP_PER_ENTITY)
    .run();
}

export async function listSnapshots(
  db: D1Database,
  entityType: SnapshotEntityType,
  entityKey: string,
) {
  const { results } = await db
    .prepare(
      `SELECT * FROM content_snapshots WHERE entity_type = ? AND entity_key = ? ORDER BY created_at DESC, id DESC`,
    )
    .bind(entityType, entityKey)
    .all();
  return results;
}
