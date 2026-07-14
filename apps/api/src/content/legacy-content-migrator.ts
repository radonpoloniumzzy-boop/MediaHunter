import { createHash, randomUUID } from "node:crypto";

import type { Sql } from "postgres";

import { ContentRepository } from "./repository";
import { canonicalizeContentUrl } from "./canonical-url";

function stringOrNull(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : String(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export class LegacyContentMigrator {
  constructor(
    private readonly sql: Sql,
    private readonly content: ContentRepository
  ) {}

  async getReadiness() {
    const rows = await this.sql<Record<string, unknown>[]>`
      select
        (select count(*)::int from article) as legacy_article_count,
        (select count(*)::int from article_snapshot) as legacy_snapshot_count,
        (select count(*)::int from content_legacy_article_link) as linked_article_count,
        (select count(*)::int from content_legacy_snapshot_link) as linked_snapshot_count,
        (select count(*)::int from content_article) as content_article_count,
        (select count(*)::int from content_snapshot) as content_snapshot_count
    `;
    const runs = await this.sql<Record<string, unknown>[]>`
      select
        id, migration_name, status, source_article_count, source_snapshot_count,
        migrated_article_count, migrated_snapshot_count, detail,
        started_at::text, completed_at::text
      from content_migration_run
      where migration_name = ${"legacy-article-v1"}
      order by started_at desc
      limit 1
    `;
    const counts = rows[0] ?? {};
    return {
      legacy_article_count: Number(counts.legacy_article_count ?? 0),
      legacy_snapshot_count: Number(counts.legacy_snapshot_count ?? 0),
      linked_article_count: Number(counts.linked_article_count ?? 0),
      linked_snapshot_count: Number(counts.linked_snapshot_count ?? 0),
      content_article_count: Number(counts.content_article_count ?? 0),
      content_snapshot_count: Number(counts.content_snapshot_count ?? 0),
      legacy_data_untouched: true,
      recovery_strategy: "The legacy article tables remain authoritative and are not modified by this migration.",
      latest_run: runs[0] ?? null
    };
  }

  async run() {
    const readiness = await this.getReadiness();
    const runId = randomUUID();
    await this.sql`
      insert into content_migration_run (
        id, migration_name, status, source_article_count, source_snapshot_count, detail
      )
      values (
        ${runId}, ${"legacy-article-v1"}, ${"running"},
        ${readiness.legacy_article_count}, ${readiness.legacy_snapshot_count},
        ${this.sql.json({ legacy_data_untouched: true })}
      )
    `;

    let migratedArticleCount = 0;
    let migratedSnapshotCount = 0;
    try {
      const articles = await this.sql<Record<string, unknown>[]>`
        select
          a.*,
          a.publish_time::text as publish_time_text,
          s.wechat_id,
          s.biz_id,
          s.entry_url
        from article a
        left join account_source s on s.id = a.source_id
        order by a.created_at asc
      `;

      for (const legacy of articles) {
        const snapshots = await this.sql<Record<string, unknown>[]>`
          select
            id, version, content_html, content_text, raw_json, content_hash,
            captured_at::text as captured_at
          from article_snapshot
          where article_id = ${String(legacy.id)}
          order by version asc
        `;
        const sourceSnapshots = snapshots.length
          ? snapshots
          : [
              {
                id: null,
                version: 1,
                captured_at: null,
                content_html: legacy.content_html,
                content_text: legacy.content_text,
                raw_json: legacy.raw_json,
                content_hash: legacy.content_hash
              }
            ];

        let contentArticleId: string | null = null;
        for (const legacySnapshot of sourceSnapshots) {
          const contentText = String(legacySnapshot.content_text ?? "");
          const contentHash =
            stringOrNull(legacySnapshot.content_hash) ??
            createHash("sha256").update(`${String(legacy.title)}\n${contentText}`).digest("hex");
          const stored = await this.content.storeContent({
            requestedUrl: String(legacy.article_url),
            finalUrl: String(legacy.article_url),
            httpStatus: 200,
            canonicalUrl: canonicalizeContentUrl(String(legacy.article_url)),
            sourceKey:
              stringOrNull(legacy.biz_id) ??
              stringOrNull(legacy.wechat_id) ??
              (legacy.source_id ? `legacy:${String(legacy.source_id)}` : null),
            sourceName: stringOrNull(legacy.source_name),
            sourceUrl: stringOrNull(legacy.entry_url),
            snapshot: {
              title: String(legacy.title),
              author: stringOrNull(legacy.author),
              publish_time: stringOrNull(legacy.publish_time_text),
              summary: stringOrNull(legacy.summary),
              cover_url: stringOrNull(legacy.cover_url),
              content_html: String(legacySnapshot.content_html ?? ""),
              content_text: contentText,
              image_urls: stringArray(legacy.images),
              has_video: Boolean(legacy.has_video),
              has_audio: Boolean(legacy.has_audio),
              raw_json: recordValue(legacySnapshot.raw_json)
            },
            contentHash,
            origin: "legacy_migration",
            capturedAt: stringOrNull(legacySnapshot.captured_at)
          });
          contentArticleId = String(stored.article.id);
          if (stored.snapshot_created) migratedSnapshotCount += 1;
          if (legacySnapshot.id) {
            await this.sql`
              insert into content_legacy_snapshot_link (legacy_snapshot_id, content_snapshot_id)
              values (${String(legacySnapshot.id)}, ${String(stored.snapshot.id)})
              on conflict (legacy_snapshot_id) do update
              set content_snapshot_id = excluded.content_snapshot_id,
                  migrated_at = now()
            `;
          }
        }

        if (contentArticleId) {
          await this.sql`
            insert into content_legacy_article_link (legacy_article_id, content_article_id)
            values (${String(legacy.id)}, ${contentArticleId})
            on conflict (legacy_article_id) do update
            set content_article_id = excluded.content_article_id,
                migrated_at = now()
          `;
          migratedArticleCount += 1;
        }
      }

      await this.sql`
        update content_migration_run
        set status = ${"success"},
            migrated_article_count = ${migratedArticleCount},
            migrated_snapshot_count = ${migratedSnapshotCount},
            completed_at = now()
        where id = ${runId}
      `;
      return {
        run_id: runId,
        status: "success",
        migrated_article_count: migratedArticleCount,
        newly_created_snapshot_count: migratedSnapshotCount
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown migration failure";
      await this.sql`
        update content_migration_run
        set status = ${"failed"},
            migrated_article_count = ${migratedArticleCount},
            migrated_snapshot_count = ${migratedSnapshotCount},
            detail = ${this.sql.json({ legacy_data_untouched: true, error: message })},
            completed_at = now()
        where id = ${runId}
      `;
      throw error;
    }
  }
}
