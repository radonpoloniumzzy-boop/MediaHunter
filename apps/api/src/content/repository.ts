import { randomUUID } from "node:crypto";

import type { Sql } from "postgres";

import type { StoreContentInput, StoredContentResult } from "./types";

export class ContentRepository {
  constructor(private readonly sql: Sql) {}

  async storeContent(input: StoreContentInput): Promise<StoredContentResult> {
    return this.sql.begin(async (transaction) => {
      const tx = transaction as unknown as Sql;
      await tx`select pg_advisory_xact_lock(hashtextextended(${input.canonicalUrl}, 0))`;
      let sourceId: string | null = null;
      if (input.sourceKey) {
        const sourceRows = await tx<Record<string, unknown>[]>`
          insert into content_source (id, source_type, canonical_key, display_name, canonical_url)
          values (
            ${randomUUID()},
            ${"wechat_official_account"},
            ${input.sourceKey},
            ${input.sourceName},
            ${input.sourceUrl ?? null}
          )
          on conflict (source_type, canonical_key) do update
          set display_name = coalesce(excluded.display_name, content_source.display_name),
              canonical_url = coalesce(content_source.canonical_url, excluded.canonical_url),
              updated_at = now()
          returning id
        `;
        if (!sourceRows[0]?.id) throw new Error("Failed to store content source");
        sourceId = String(sourceRows[0].id);
      }

      const existingRows = await tx<Record<string, unknown>[]>`
        select *
        from content_article
        where canonical_url = ${input.canonicalUrl}
        for update
      `;
      let article = existingRows[0];
      const created = !article;

      if (!article) {
        const articleRows = await tx<Record<string, unknown>[]>`
          insert into content_article (
            id, canonical_url, source_id, title, author, publish_time,
            current_snapshot_version, current_content_hash
          )
          values (
            ${randomUUID()}, ${input.canonicalUrl}, ${sourceId}, ${input.snapshot.title},
            ${input.snapshot.author}, ${input.snapshot.publish_time}, 0, null
          )
          returning *
        `;
        article = articleRows[0];
      } else {
        const articleRows = await tx<Record<string, unknown>[]>`
          update content_article
          set source_id = coalesce(${sourceId}, source_id),
              title = ${input.snapshot.title},
              author = ${input.snapshot.author},
              publish_time = ${input.snapshot.publish_time},
              last_seen_at = now(),
              updated_at = now()
          where id = ${String(article.id)}
          returning *
        `;
        article = articleRows[0];
      }

      if (!article) throw new Error("Failed to store content article");

      const duplicateSnapshots = await tx<Record<string, unknown>[]>`
        select id, article_id, version, content_hash, captured_at::text
        from content_snapshot
        where article_id = ${String(article.id)}
          and content_hash = ${input.contentHash}
        limit 1
      `;
      if (duplicateSnapshots[0]) {
        return {
          article,
          snapshot: duplicateSnapshots[0],
          created,
          snapshot_created: false
        };
      }

      const nextVersion = Number(article.current_snapshot_version ?? 0) + 1;
      const snapshotId = randomUUID();
      const snapshotRows = await tx<Record<string, unknown>[]>`
        insert into content_snapshot (
          id, article_id, version, source_url, final_url, http_status, title, author,
          publish_time, summary, cover_url, content_html, content_text, raw_json,
          content_hash, origin, captured_at
        )
        values (
          ${snapshotId}, ${String(article.id)}, ${nextVersion}, ${input.requestedUrl},
          ${input.finalUrl}, ${input.httpStatus}, ${input.snapshot.title}, ${input.snapshot.author},
          ${input.snapshot.publish_time}, ${input.snapshot.summary}, ${input.snapshot.cover_url},
          ${input.snapshot.content_html}, ${input.snapshot.content_text},
          ${tx.json(JSON.parse(JSON.stringify(input.snapshot.raw_json)))}, ${input.contentHash},
          ${input.origin ?? "public_fetch"}, ${input.capturedAt ?? new Date().toISOString()}
        )
        returning id, article_id, version, content_hash, captured_at::text
      `;
      const snapshot = snapshotRows[0];
      if (!snapshot) throw new Error("Failed to store content snapshot");

      const imageReferences = [
        ...(input.snapshot.cover_url
          ? [{ type: "cover", position: 0, url: input.snapshot.cover_url }]
          : []),
        ...input.snapshot.image_urls.map((url, index) => ({ type: "inline", position: index, url }))
      ];
      for (const reference of imageReferences) {
        await tx`
          insert into content_image_reference (id, snapshot_id, reference_type, position, url)
          values (${randomUUID()}, ${snapshotId}, ${reference.type}, ${reference.position}, ${reference.url})
          on conflict do nothing
        `;
      }

      const articleRows = await tx<Record<string, unknown>[]>`
        update content_article
        set current_snapshot_version = ${nextVersion},
            current_content_hash = ${input.contentHash},
            last_seen_at = now(),
            updated_at = now()
        where id = ${String(article.id)}
        returning *
      `;

      return {
        article: articleRows[0] ?? article,
        snapshot,
        created,
        snapshot_created: true
      };
    });
  }

  async getArticleDetail(articleId: string) {
    const articleRows = await this.sql<Record<string, unknown>[]>`
      select
        a.*,
        a.publish_time::text as publish_time,
        a.first_seen_at::text as first_seen_at,
        a.last_seen_at::text as last_seen_at,
        s.display_name as source_name,
        s.source_type
      from content_article a
      left join content_source s on s.id = a.source_id
      where a.id = ${articleId}
      limit 1
    `;
    if (!articleRows[0]) return null;

    const snapshots = await this.sql<Record<string, unknown>[]>`
      select
        id, article_id, version, source_url, final_url, http_status, title, author,
        publish_time::text as publish_time, summary, cover_url, content_hash, origin,
        captured_at::text as captured_at
      from content_snapshot
      where article_id = ${articleId}
      order by version desc
    `;
    const imageReferences = await this.sql<Record<string, unknown>[]>`
      select
        ir.id, ir.snapshot_id, ir.reference_type, ir.position, ir.url, ir.alt_text,
        cs.version as snapshot_version
      from content_image_reference ir
      join content_snapshot cs on cs.id = ir.snapshot_id
      where cs.article_id = ${articleId}
      order by cs.version desc, ir.reference_type, ir.position
    `;

    return {
      article: articleRows[0],
      snapshots,
      image_references: imageReferences
    };
  }

}
