import { randomUUID } from "node:crypto";

import type { Sql } from "postgres";

import type { AuthUser } from "../research/types";
import type { IncubationEntity } from "./types";

function asJson<T>(sql: Sql, value: T) {
  return sql.json(JSON.parse(JSON.stringify(value)));
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNullableString(value: unknown) {
  const text = asString(value);
  return text || null;
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function asBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "1", "yes", "是"].includes(value.toLowerCase());
  return fallback;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[,\n|]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

const ENTITY_TABLE: Record<IncubationEntity, { table: string; orderBy: string; exportColumns: string[] }> = {
  platforms: {
    table: "incubation_platform",
    orderBy: "updated_at desc",
    exportColumns: ["id", "name", "code", "status", "created_at", "updated_at"]
  },
  tracks: {
    table: "incubation_track",
    orderBy: "total_score desc, updated_at desc",
    exportColumns: [
      "id",
      "name",
      "category",
      "target_user",
      "core_need",
      "status",
      "total_score",
      "market_demand_score",
      "monetization_score",
      "content_supply_score",
      "benchmark_copy_score",
      "platform_fit_score",
      "compliance_risk_score",
      "created_at",
      "updated_at"
    ]
  },
  keywords: {
    table: "incubation_keyword",
    orderBy: "updated_at desc",
    exportColumns: ["id", "keyword", "platform_id", "track_id", "keyword_type", "status", "notes", "created_at", "updated_at"]
  },
  "information-sources": {
    table: "incubation_information_source",
    orderBy: "importance asc, updated_at desc",
    exportColumns: ["id", "name", "source_type", "platform_id", "track_id", "url", "rss_url", "frequency_minutes", "importance", "status", "last_success_at", "last_error"]
  },
  tasks: {
    table: "incubation_task",
    orderBy: "created_at desc",
    exportColumns: ["id", "task_name", "task_type", "entity_type", "status", "source_count", "item_count", "result_count", "rate_limit_per_hour", "created_at", "updated_at"]
  },
  "benchmark-accounts": {
    table: "incubation_benchmark_account",
    orderBy: "updated_at desc",
    exportColumns: ["id", "name", "platform_id", "track_id", "url", "follower_count", "account_level", "content_line", "posts_30d", "viral_posts_30d", "viral_rate"]
  },
  "content-samples": {
    table: "incubation_content_sample",
    orderBy: "is_viral desc, collected_at desc",
    exportColumns: ["id", "title", "platform_id", "track_id", "author_name", "original_url", "likes", "collects", "comments", "shares", "plays", "follower_count", "interaction_rate", "is_viral", "is_low_follower_viral"]
  },
  comments: {
    table: "incubation_comment_need",
    orderBy: "intent_score desc, updated_at desc",
    exportColumns: ["id", "comment_text", "platform_id", "track_id", "source_account", "source_url", "like_count", "need_type", "sentiment", "intent_score", "cluster_key"]
  },
  topics: {
    table: "incubation_topic",
    orderBy: "case priority when 'A' then 1 when 'B' then 2 else 3 end, updated_at desc",
    exportColumns: ["id", "title", "track_id", "topic_type", "priority", "difficulty", "risk_level", "status", "suggestion_reason", "created_at", "updated_at"]
  },
  "owned-accounts": {
    table: "incubation_owned_account",
    orderBy: "case account_level when 'S' then 1 when 'A' then 2 when 'B' then 3 when 'C' then 4 else 5 end, updated_at desc",
    exportColumns: [
      "id",
      "name",
      "platform_id",
      "track_id",
      "account_type",
      "stage",
      "owner_name",
      "follower_count",
      "posts_7d",
      "growth_30d",
      "viral_posts_30d",
      "account_level",
      "risk_status",
      "updated_at"
    ]
  },
  materials: {
    table: "incubation_material_asset",
    orderBy: "uploaded_at desc, updated_at desc",
    exportColumns: [
      "id",
      "name",
      "asset_type",
      "file_url",
      "source_platform_id",
      "source_url",
      "source_account",
      "track_id",
      "owned_account_id",
      "tags",
      "is_original",
      "is_commercial_allowed",
      "copyright_status",
      "risk_level",
      "uploaded_at"
    ]
  }
};

export class IncubationRepository {
  constructor(private readonly sql: Sql) {}

  async logOperation(actor: AuthUser | null, action: string, targetType: string, targetId: string | null, detail: Record<string, unknown>) {
    await this.sql`
      insert into operation_log (id, actor_user_id, actor_username, action, target_type, target_id, detail)
      values (${randomUUID()}, ${actor?.id ?? null}, ${actor?.username ?? null}, ${action}, ${targetType}, ${targetId}, ${asJson(this.sql, detail)})
    `;
  }

  async listEntity(entity: IncubationEntity, filters: Record<string, unknown> = {}) {
    const config = ENTITY_TABLE[entity];
    const clauses = ["1 = 1"];
    const params: Array<string | number | boolean> = [];
    const pushParam = (value: string | number | boolean) => {
      params.push(value);
      return `$${params.length}`;
    };

    const columns = await this.describeColumns(config.table);
    if (filters.track_id && "track_id" in columns) clauses.push(`track_id = ${pushParam(String(filters.track_id))}`);
    if (filters.platform_id && "platform_id" in columns) clauses.push(`platform_id = ${pushParam(String(filters.platform_id))}`);
    if (filters.status && "status" in columns) clauses.push(`status = ${pushParam(String(filters.status))}`);
    if (filters.keyword) {
      const like = `%${String(filters.keyword)}%`;
      if (entity === "tracks") clauses.push(`(name ilike ${pushParam(like)} or coalesce(core_need, '') ilike ${pushParam(like)})`);
      if (entity === "content-samples") clauses.push(`(title ilike ${pushParam(like)} or coalesce(author_name, '') ilike ${pushParam(like)})`);
      if (entity === "comments") clauses.push(`comment_text ilike ${pushParam(like)}`);
      if (entity === "topics") clauses.push(`title ilike ${pushParam(like)}`);
      if (entity === "owned-accounts") clauses.push(`(name ilike ${pushParam(like)} or coalesce(content_line, '') ilike ${pushParam(like)})`);
      if (entity === "materials") clauses.push(`(name ilike ${pushParam(like)} or coalesce(source_account, '') ilike ${pushParam(like)})`);
    }

    const limit = Math.min(Math.max(asNumber(filters.limit, 100), 1), 500);
    const offset = Math.max(asNumber(filters.offset, 0), 0);
    const limitSlot = pushParam(limit);
    const offsetSlot = pushParam(offset);

    return this.sql.unsafe<Record<string, unknown>[]>(
      `
        select *
        from ${config.table}
        where ${clauses.join(" and ")}
        order by ${config.orderBy}
        limit ${limitSlot}
        offset ${offsetSlot}
      `,
      params as never[]
    );
  }

  private columnCache = new Map<string, Record<string, true>>();

  private async describeColumns(table: string) {
    const cached = this.columnCache.get(table);
    if (cached) return cached;
    const rows = await this.sql<Record<string, unknown>[]>`
      select column_name
      from information_schema.columns
      where table_name = ${table}
    `;
    const columns = Object.fromEntries(rows.map((row) => [String(row.column_name), true as const]));
    this.columnCache.set(table, columns);
    return columns;
  }

  async countEntity(entity: IncubationEntity, filters: Record<string, unknown> = {}) {
    const items = await this.listEntity(entity, { ...filters, limit: 500, offset: 0 });
    return items.length;
  }

  async listRowsForExport(entity: IncubationEntity, filters: Record<string, unknown> = {}) {
    const rows = await this.listEntity(entity, { ...filters, limit: 500, offset: 0 });
    return rows.map((row) => {
      const output: Record<string, unknown> = {};
      for (const column of ENTITY_TABLE[entity].exportColumns) output[column] = row[column];
      return output;
    });
  }

  getExportColumns(entity: IncubationEntity) {
    return ENTITY_TABLE[entity].exportColumns;
  }

  async createExportRecord(user: AuthUser, entity: IncubationEntity, format: string, filters: Record<string, unknown>, rowCount: number) {
    await this.sql`
      insert into incubation_export_record (id, entity_type, format, filters, row_count, requested_by)
      values (${randomUUID()}, ${entity}, ${format}, ${asJson(this.sql, filters)}, ${rowCount}, ${user.id})
    `;
    await this.logOperation(user, "incubation.export", "incubation_export_record", null, { entity, format, row_count: rowCount });
  }

  async upsertPlatform(user: AuthUser, input: Record<string, unknown>) {
    const id = asString(input.id, randomUUID());
    await this.sql`
      insert into incubation_platform (id, name, code, status, created_by)
      values (${id}, ${asString(input.name)}, ${asString(input.code)}, ${asString(input.status, "active")}, ${user.id})
      on conflict (id) do update
      set name = excluded.name,
          code = excluded.code,
          status = excluded.status,
          updated_at = now()
    `;
    await this.logOperation(user, input.id ? "incubation.platform.update" : "incubation.platform.create", "incubation_platform", id, input);
    return id;
  }

  async upsertTrack(user: AuthUser, input: Record<string, unknown>) {
    const id = asString(input.id, randomUUID());
    await this.sql`
      insert into incubation_track (
        id, name, category, sub_category, target_user, core_need, primary_platform_id,
        monetization_path, content_supply_difficulty, compliance_risk_level, status,
        evidence_links, notes, created_by
      )
      values (
        ${id},
        ${asString(input.name)},
        ${asNullableString(input.category)},
        ${asNullableString(input.sub_category)},
        ${asNullableString(input.target_user)},
        ${asNullableString(input.core_need)},
        ${asNullableString(input.primary_platform_id)},
        ${asNullableString(input.monetization_path)},
        ${asNullableString(input.content_supply_difficulty)},
        ${asString(input.compliance_risk_level, "medium")},
        ${asString(input.status, "observing")},
        ${asJson(this.sql, asStringArray(input.evidence_links))},
        ${asNullableString(input.notes)},
        ${user.id}
      )
      on conflict (id) do update
      set name = excluded.name,
          category = excluded.category,
          sub_category = excluded.sub_category,
          target_user = excluded.target_user,
          core_need = excluded.core_need,
          primary_platform_id = excluded.primary_platform_id,
          monetization_path = excluded.monetization_path,
          content_supply_difficulty = excluded.content_supply_difficulty,
          compliance_risk_level = excluded.compliance_risk_level,
          status = excluded.status,
          evidence_links = excluded.evidence_links,
          notes = excluded.notes,
          updated_at = now()
    `;
    await this.logOperation(user, input.id ? "incubation.track.update" : "incubation.track.create", "incubation_track", id, input);
    return id;
  }

  async updateTrackScore(user: AuthUser, trackId: string, score: Record<string, unknown>) {
    await this.sql`
      update incubation_track
      set market_demand_score = ${asNumber(score.market_demand_score)},
          monetization_score = ${asNumber(score.monetization_score)},
          content_supply_score = ${asNumber(score.content_supply_score)},
          benchmark_copy_score = ${asNumber(score.benchmark_copy_score)},
          platform_fit_score = ${asNumber(score.platform_fit_score)},
          compliance_risk_score = ${asNumber(score.compliance_risk_score)},
          total_score = ${asNumber(score.total_score)},
          updated_at = now()
      where id = ${trackId}
    `;
    await this.logOperation(user, "incubation.track.score", "incubation_track", trackId, score);
  }

  async upsertKeyword(user: AuthUser, input: Record<string, unknown>) {
    const id = asString(input.id, randomUUID());
    await this.sql`
      insert into incubation_keyword (id, keyword, platform_id, track_id, keyword_type, status, notes, created_by)
      values (${id}, ${asString(input.keyword)}, ${asNullableString(input.platform_id)}, ${asNullableString(input.track_id)}, ${asString(input.keyword_type, "seed")}, ${asString(input.status, "active")}, ${asNullableString(input.notes)}, ${user.id})
      on conflict (id) do update
      set keyword = excluded.keyword,
          platform_id = excluded.platform_id,
          track_id = excluded.track_id,
          keyword_type = excluded.keyword_type,
          status = excluded.status,
          notes = excluded.notes,
          updated_at = now()
    `;
    await this.logOperation(user, input.id ? "incubation.keyword.update" : "incubation.keyword.create", "incubation_keyword", id, input);
    return id;
  }

  async upsertInformationSource(user: AuthUser, input: Record<string, unknown>) {
    const id = asString(input.id, randomUUID());
    await this.sql`
      insert into incubation_information_source (
        id, name, source_type, platform_id, track_id, url, rss_url, frequency_minutes,
        importance, status, last_error, notes, created_by
      )
      values (
        ${id},
        ${asString(input.name)},
        ${asString(input.source_type, "rss")},
        ${asNullableString(input.platform_id)},
        ${asNullableString(input.track_id)},
        ${asNullableString(input.url)},
        ${asNullableString(input.rss_url)},
        ${asNumber(input.frequency_minutes, 1440)},
        ${asString(input.importance, "B")},
        ${asString(input.status, "active")},
        ${asNullableString(input.last_error)},
        ${asNullableString(input.notes)},
        ${user.id}
      )
      on conflict (id) do update
      set name = excluded.name,
          source_type = excluded.source_type,
          platform_id = excluded.platform_id,
          track_id = excluded.track_id,
          url = excluded.url,
          rss_url = excluded.rss_url,
          frequency_minutes = excluded.frequency_minutes,
          importance = excluded.importance,
          status = excluded.status,
          last_error = excluded.last_error,
          notes = excluded.notes,
          updated_at = now()
    `;
    await this.logOperation(user, input.id ? "incubation.source.update" : "incubation.source.create", "incubation_information_source", id, input);
    return id;
  }

  async upsertTask(user: AuthUser, input: Record<string, unknown>) {
    const id = asString(input.id, randomUUID());
    await this.sql`
      insert into incubation_task (
        id, task_name, task_type, entity_type, status, source_id, track_id,
        source_count, item_count, result_count, rate_limit_per_hour, random_delay_seconds,
        error_summary, logs_json, created_by
      )
      values (
        ${id},
        ${asString(input.task_name)},
        ${asString(input.task_type, "manual_import")},
        ${asString(input.entity_type, "content-samples")},
        ${asString(input.status, "pending")},
        ${asNullableString(input.source_id)},
        ${asNullableString(input.track_id)},
        ${asNumber(input.source_count, 0)},
        ${asNumber(input.item_count, 0)},
        ${asNumber(input.result_count, 0)},
        ${asNumber(input.rate_limit_per_hour, 30)},
        ${asNumber(input.random_delay_seconds, 0)},
        ${asNullableString(input.error_summary)},
        ${asJson(this.sql, Array.isArray(input.logs_json) ? input.logs_json : [])},
        ${user.id}
      )
      on conflict (id) do update
      set task_name = excluded.task_name,
          task_type = excluded.task_type,
          entity_type = excluded.entity_type,
          status = excluded.status,
          source_id = excluded.source_id,
          track_id = excluded.track_id,
          source_count = excluded.source_count,
          item_count = excluded.item_count,
          result_count = excluded.result_count,
          rate_limit_per_hour = excluded.rate_limit_per_hour,
          random_delay_seconds = excluded.random_delay_seconds,
          error_summary = excluded.error_summary,
          logs_json = excluded.logs_json,
          updated_at = now()
    `;
    await this.logOperation(user, input.id ? "incubation.task.update" : "incubation.task.create", "incubation_task", id, input);
    return id;
  }

  async upsertBenchmarkAccount(user: AuthUser, input: Record<string, unknown>) {
    const id = asString(input.id, randomUUID());
    const posts30d = asNumber(input.posts_30d, 0);
    const viral30d = asNumber(input.viral_posts_30d, 0);
    const viralRate = posts30d > 0 ? Number((viral30d / posts30d).toFixed(4)) : asNumber(input.viral_rate, 0);
    await this.sql`
      insert into incubation_benchmark_account (
        id, platform_id, track_id, name, url, follower_count, account_level,
        content_line, posts_30d, viral_posts_30d, viral_rate, title_structure,
        cover_structure, script_structure, comment_questions, monetization_path,
        copyable_points, noncopyable_points, analysis_json, created_by
      )
      values (
        ${id}, ${asNullableString(input.platform_id)}, ${asNullableString(input.track_id)}, ${asString(input.name)},
        ${asNullableString(input.url)}, ${asNumber(input.follower_count)}, ${asString(input.account_level, "腰部")},
        ${asNullableString(input.content_line)}, ${posts30d}, ${viral30d}, ${viralRate},
        ${asNullableString(input.title_structure)}, ${asNullableString(input.cover_structure)}, ${asNullableString(input.script_structure)},
        ${asNullableString(input.comment_questions)}, ${asNullableString(input.monetization_path)}, ${asNullableString(input.copyable_points)},
        ${asNullableString(input.noncopyable_points)}, ${asJson(this.sql, input.analysis_json ?? {})}, ${user.id}
      )
      on conflict (id) do update
      set platform_id = excluded.platform_id,
          track_id = excluded.track_id,
          name = excluded.name,
          url = excluded.url,
          follower_count = excluded.follower_count,
          account_level = excluded.account_level,
          content_line = excluded.content_line,
          posts_30d = excluded.posts_30d,
          viral_posts_30d = excluded.viral_posts_30d,
          viral_rate = excluded.viral_rate,
          title_structure = excluded.title_structure,
          cover_structure = excluded.cover_structure,
          script_structure = excluded.script_structure,
          comment_questions = excluded.comment_questions,
          monetization_path = excluded.monetization_path,
          copyable_points = excluded.copyable_points,
          noncopyable_points = excluded.noncopyable_points,
          analysis_json = excluded.analysis_json,
          updated_at = now()
    `;
    await this.logOperation(user, input.id ? "incubation.benchmark.update" : "incubation.benchmark.create", "incubation_benchmark_account", id, input);
    return id;
  }

  async upsertContentSample(user: AuthUser, input: Record<string, unknown>) {
    const id = asString(input.id, randomUUID());
    await this.sql`
      insert into incubation_content_sample (
        id, platform_id, benchmark_account_id, track_id, title, original_url, author_name,
        content_type, content_line, keywords, likes, collects, comments, shares, plays,
        follower_count, interaction_rate, is_low_follower_viral, is_viral, title_structure,
        hook, cover_type, script_structure, comment_need_summary, copy_level, risk_level,
        analysis_json, created_by
      )
      values (
        ${id}, ${asNullableString(input.platform_id)}, ${asNullableString(input.benchmark_account_id)}, ${asNullableString(input.track_id)},
        ${asString(input.title)}, ${asNullableString(input.original_url)}, ${asNullableString(input.author_name)},
        ${asString(input.content_type, "unknown")}, ${asNullableString(input.content_line)}, ${asJson(this.sql, asStringArray(input.keywords))},
        ${asNumber(input.likes)}, ${asNumber(input.collects)}, ${asNumber(input.comments)}, ${asNumber(input.shares)}, ${asNumber(input.plays)},
        ${asNumber(input.follower_count)}, ${asNumber(input.interaction_rate)}, ${asBoolean(input.is_low_follower_viral)}, ${asBoolean(input.is_viral)},
        ${asNullableString(input.title_structure)}, ${asNullableString(input.hook)}, ${asNullableString(input.cover_type)}, ${asNullableString(input.script_structure)},
        ${asNullableString(input.comment_need_summary)}, ${asNullableString(input.copy_level)}, ${asString(input.risk_level, "medium")},
        ${asJson(this.sql, input.analysis_json ?? {})}, ${user.id}
      )
      on conflict (id) do update
      set platform_id = excluded.platform_id,
          benchmark_account_id = excluded.benchmark_account_id,
          track_id = excluded.track_id,
          title = excluded.title,
          original_url = excluded.original_url,
          author_name = excluded.author_name,
          content_type = excluded.content_type,
          content_line = excluded.content_line,
          keywords = excluded.keywords,
          likes = excluded.likes,
          collects = excluded.collects,
          comments = excluded.comments,
          shares = excluded.shares,
          plays = excluded.plays,
          follower_count = excluded.follower_count,
          interaction_rate = excluded.interaction_rate,
          is_low_follower_viral = excluded.is_low_follower_viral,
          is_viral = excluded.is_viral,
          title_structure = excluded.title_structure,
          hook = excluded.hook,
          cover_type = excluded.cover_type,
          script_structure = excluded.script_structure,
          comment_need_summary = excluded.comment_need_summary,
          copy_level = excluded.copy_level,
          risk_level = excluded.risk_level,
          analysis_json = excluded.analysis_json,
          updated_at = now()
    `;
    await this.logOperation(user, input.id ? "incubation.content.update" : "incubation.content.create", "incubation_content_sample", id, input);
    return id;
  }

  async upsertComment(user: AuthUser, input: Record<string, unknown>) {
    const id = asString(input.id, randomUUID());
    await this.sql`
      insert into incubation_comment_need (
        id, content_sample_id, platform_id, track_id, source_account, source_url, comment_text,
        commenter_name, like_count, is_reply, need_type, sentiment, intent_score,
        can_convert_topic, can_convert_faq, can_convert_script, cluster_key, created_by
      )
      values (
        ${id}, ${asNullableString(input.content_sample_id)}, ${asNullableString(input.platform_id)}, ${asNullableString(input.track_id)},
        ${asNullableString(input.source_account)}, ${asNullableString(input.source_url)}, ${asString(input.comment_text)},
        ${asNullableString(input.commenter_name)}, ${asNumber(input.like_count)}, ${asBoolean(input.is_reply)},
        ${asString(input.need_type, "共鸣")}, ${asString(input.sentiment, "neutral")}, ${asNumber(input.intent_score)},
        ${asBoolean(input.can_convert_topic, true)}, ${asBoolean(input.can_convert_faq)}, ${asBoolean(input.can_convert_script)},
        ${asNullableString(input.cluster_key)}, ${user.id}
      )
      on conflict (id) do update
      set content_sample_id = excluded.content_sample_id,
          platform_id = excluded.platform_id,
          track_id = excluded.track_id,
          source_account = excluded.source_account,
          source_url = excluded.source_url,
          comment_text = excluded.comment_text,
          commenter_name = excluded.commenter_name,
          like_count = excluded.like_count,
          is_reply = excluded.is_reply,
          need_type = excluded.need_type,
          sentiment = excluded.sentiment,
          intent_score = excluded.intent_score,
          can_convert_topic = excluded.can_convert_topic,
          can_convert_faq = excluded.can_convert_faq,
          can_convert_script = excluded.can_convert_script,
          cluster_key = excluded.cluster_key,
          updated_at = now()
    `;
    await this.logOperation(user, input.id ? "incubation.comment.update" : "incubation.comment.create", "incubation_comment_need", id, input);
    return id;
  }

  async upsertTopic(user: AuthUser, input: Record<string, unknown>) {
    const id = asString(input.id, randomUUID());
    await this.sql`
      insert into incubation_topic (
        id, title, platform_targets, track_id, content_line, target_account, target_audience,
        pain_point, benchmark_source_id, content_sample_id, comment_need_id, hot_source_id,
        keywords, content_format, topic_type, priority, difficulty, risk_level, status,
        source_trace, suggestion_reason, created_by
      )
      values (
        ${id}, ${asString(input.title)}, ${asJson(this.sql, asStringArray(input.platform_targets))}, ${asNullableString(input.track_id)},
        ${asNullableString(input.content_line)}, ${asNullableString(input.target_account)}, ${asNullableString(input.target_audience)},
        ${asNullableString(input.pain_point)}, ${asNullableString(input.benchmark_source_id)}, ${asNullableString(input.content_sample_id)},
        ${asNullableString(input.comment_need_id)}, ${asNullableString(input.hot_source_id)}, ${asJson(this.sql, asStringArray(input.keywords))},
        ${asNullableString(input.content_format)}, ${asString(input.topic_type, "manual")}, ${asString(input.priority, "B")},
        ${asString(input.difficulty, "medium")}, ${asString(input.risk_level, "medium")}, ${asString(input.status, "pending_review")},
        ${asJson(this.sql, input.source_trace ?? {})}, ${asNullableString(input.suggestion_reason)}, ${user.id}
      )
      on conflict (id) do update
      set title = excluded.title,
          platform_targets = excluded.platform_targets,
          track_id = excluded.track_id,
          content_line = excluded.content_line,
          target_account = excluded.target_account,
          target_audience = excluded.target_audience,
          pain_point = excluded.pain_point,
          benchmark_source_id = excluded.benchmark_source_id,
          content_sample_id = excluded.content_sample_id,
          comment_need_id = excluded.comment_need_id,
          hot_source_id = excluded.hot_source_id,
          keywords = excluded.keywords,
          content_format = excluded.content_format,
          topic_type = excluded.topic_type,
          priority = excluded.priority,
          difficulty = excluded.difficulty,
          risk_level = excluded.risk_level,
          status = excluded.status,
          source_trace = excluded.source_trace,
          suggestion_reason = excluded.suggestion_reason,
          updated_at = now()
    `;
    await this.logOperation(user, input.id ? "incubation.topic.update" : "incubation.topic.create", "incubation_topic", id, input);
    return id;
  }

  async upsertOwnedAccount(user: AuthUser, input: Record<string, unknown>) {
    const id = asString(input.id, randomUUID());
    await this.sql`
      insert into incubation_owned_account (
        id, name, platform_id, account_url, account_type, track_id, content_line, owner_name,
        stage, follower_count, posts_7d, growth_30d, viral_posts_30d, account_level,
        risk_status, project_card, notes, created_by
      )
      values (
        ${id}, ${asString(input.name)}, ${asNullableString(input.platform_id)}, ${asNullableString(input.account_url)},
        ${asString(input.account_type, "知识号")}, ${asNullableString(input.track_id)}, ${asNullableString(input.content_line)},
        ${asNullableString(input.owner_name)}, ${asString(input.stage, "立项")},
        ${asNumber(input.follower_count)}, ${asNumber(input.posts_7d)}, ${asNumber(input.growth_30d)}, ${asNumber(input.viral_posts_30d)},
        ${asString(input.account_level, "C")}, ${asString(input.risk_status, "low")},
        ${asJson(this.sql, input.project_card ?? {})}, ${asNullableString(input.notes)}, ${user.id}
      )
      on conflict (id) do update
      set name = excluded.name,
          platform_id = excluded.platform_id,
          account_url = excluded.account_url,
          account_type = excluded.account_type,
          track_id = excluded.track_id,
          content_line = excluded.content_line,
          owner_name = excluded.owner_name,
          stage = excluded.stage,
          follower_count = excluded.follower_count,
          posts_7d = excluded.posts_7d,
          growth_30d = excluded.growth_30d,
          viral_posts_30d = excluded.viral_posts_30d,
          account_level = excluded.account_level,
          risk_status = excluded.risk_status,
          project_card = excluded.project_card,
          notes = excluded.notes,
          updated_at = now()
    `;
    await this.logOperation(user, input.id ? "incubation.owned_account.update" : "incubation.owned_account.create", "incubation_owned_account", id, input);
    return id;
  }

  async upsertMaterial(user: AuthUser, input: Record<string, unknown>) {
    const id = asString(input.id, randomUUID());
    await this.sql`
      insert into incubation_material_asset (
        id, name, asset_type, file_url, preview_url, source_platform_id, source_url,
        source_account, uploader_name, track_id, owned_account_id, tags, is_original,
        is_commercial_allowed, copyright_status, file_hash, similar_asset_ids,
        risk_level, notes, created_by
      )
      values (
        ${id}, ${asString(input.name)}, ${asString(input.asset_type, "图片")},
        ${asNullableString(input.file_url)}, ${asNullableString(input.preview_url)}, ${asNullableString(input.source_platform_id)},
        ${asNullableString(input.source_url)}, ${asNullableString(input.source_account)}, ${asNullableString(input.uploader_name)},
        ${asNullableString(input.track_id)}, ${asNullableString(input.owned_account_id)}, ${asJson(this.sql, asStringArray(input.tags))},
        ${asBoolean(input.is_original)}, ${asBoolean(input.is_commercial_allowed)}, ${asString(input.copyright_status, "unknown")},
        ${asNullableString(input.file_hash)}, ${asJson(this.sql, asStringArray(input.similar_asset_ids))},
        ${asString(input.risk_level, "medium")}, ${asNullableString(input.notes)}, ${user.id}
      )
      on conflict (id) do update
      set name = excluded.name,
          asset_type = excluded.asset_type,
          file_url = excluded.file_url,
          preview_url = excluded.preview_url,
          source_platform_id = excluded.source_platform_id,
          source_url = excluded.source_url,
          source_account = excluded.source_account,
          uploader_name = excluded.uploader_name,
          track_id = excluded.track_id,
          owned_account_id = excluded.owned_account_id,
          tags = excluded.tags,
          is_original = excluded.is_original,
          is_commercial_allowed = excluded.is_commercial_allowed,
          copyright_status = excluded.copyright_status,
          file_hash = excluded.file_hash,
          similar_asset_ids = excluded.similar_asset_ids,
          risk_level = excluded.risk_level,
          notes = excluded.notes,
          updated_at = now()
    `;
    await this.logOperation(user, input.id ? "incubation.material.update" : "incubation.material.create", "incubation_material_asset", id, input);
    return id;
  }

  async resolvePlatformId(value: unknown) {
    const raw = asString(value);
    if (!raw) return null;
    const [row] = await this.sql<Record<string, unknown>[]>`
      select id
      from incubation_platform
      where id = ${raw} or name = ${raw} or code = ${raw}
      order by updated_at desc
      limit 1
    `;
    return row ? String(row.id) : null;
  }

  async resolveTrackId(value: unknown) {
    const raw = asString(value);
    if (!raw) return null;
    const [row] = await this.sql<Record<string, unknown>[]>`
      select id
      from incubation_track
      where id = ${raw} or name = ${raw}
      order by updated_at desc
      limit 1
    `;
    return row ? String(row.id) : null;
  }

  async resolveBenchmarkAccountId(value: unknown) {
    const raw = asString(value);
    if (!raw) return null;
    const [row] = await this.sql<Record<string, unknown>[]>`
      select id
      from incubation_benchmark_account
      where id = ${raw} or name = ${raw} or url = ${raw}
      order by updated_at desc
      limit 1
    `;
    return row ? String(row.id) : null;
  }

  async resolveOwnedAccountId(value: unknown) {
    const raw = asString(value);
    if (!raw) return null;
    const [row] = await this.sql<Record<string, unknown>[]>`
      select id
      from incubation_owned_account
      where id = ${raw} or name = ${raw} or account_url = ${raw}
      order by updated_at desc
      limit 1
    `;
    return row ? String(row.id) : null;
  }

  async resolveContentSampleId(value: unknown) {
    const raw = asString(value);
    if (!raw) return null;
    const [row] = await this.sql<Record<string, unknown>[]>`
      select id
      from incubation_content_sample
      where id = ${raw} or title = ${raw} or original_url = ${raw}
      order by updated_at desc
      limit 1
    `;
    return row ? String(row.id) : null;
  }

  async getTrackScoreInputs(trackId: string) {
    const [track] = await this.sql<Record<string, unknown>[]>`
      select *
      from incubation_track
      where id = ${trackId}
      limit 1
    `;
    const [counts] = await this.sql<Record<string, unknown>[]>`
      select
        (select count(*)::int from incubation_keyword where track_id = ${trackId} and status = 'active') as keyword_count,
        (select count(*)::int from incubation_content_sample where track_id = ${trackId}) as content_count,
        (select count(*)::int from incubation_content_sample where track_id = ${trackId} and is_viral = true) as viral_content_count,
        (select count(*)::int from incubation_content_sample where track_id = ${trackId} and is_low_follower_viral = true) as low_follower_viral_count,
        (select count(*)::int from incubation_benchmark_account where track_id = ${trackId}) as benchmark_count,
        (select count(*)::int from incubation_comment_need where track_id = ${trackId}) as comment_count
    `;
    return { track: track ?? null, counts: counts ?? {} };
  }

  async createSuggestionRecord(user: AuthUser, suggestionType: string, targetType: string, targetId: string | null, input: Record<string, unknown>, output: Record<string, unknown>) {
    await this.sql`
      insert into incubation_suggestion_record (id, suggestion_type, target_type, target_id, input_json, output_json, created_by)
      values (${randomUUID()}, ${suggestionType}, ${targetType}, ${targetId}, ${asJson(this.sql, input)}, ${asJson(this.sql, output)}, ${user.id})
    `;
  }

  async getTopicGenerationInputs(trackId?: string | null, limit = 20) {
    const trackClause = trackId ? this.sql`and track_id = ${trackId}` : this.sql``;
    const contentSamples = await this.sql<Record<string, unknown>[]>`
      select *
      from incubation_content_sample
      where is_viral = true
        ${trackClause}
      order by is_low_follower_viral desc, interaction_rate desc, updated_at desc
      limit ${limit}
    `;
    const comments = await this.sql<Record<string, unknown>[]>`
      select *
      from incubation_comment_need
      where can_convert_topic = true
        ${trackClause}
      order by intent_score desc, like_count desc, updated_at desc
      limit ${limit}
    `;
    const sources = await this.sql<Record<string, unknown>[]>`
      select *
      from incubation_information_source
      where status = 'active'
        ${trackClause}
      order by case importance when 'A' then 1 when 'B' then 2 else 3 end, updated_at desc
      limit ${limit}
    `;
    return { contentSamples, comments, sources };
  }

  async getDashboardSummary() {
    const [tracks] = await this.sql<Record<string, unknown>[]>`
      select
        count(*)::int as total_tracks,
        sum(case when status in ('重点孵化', 'scale', 'active', 'approved') then 1 else 0 end)::int as active_tracks,
        coalesce(round(avg(total_score), 2), 0) as avg_track_score
      from incubation_track
    `;
    const [assets] = await this.sql<Record<string, unknown>[]>`
      select
        (select count(*)::int from incubation_information_source where status = 'active') as active_sources,
        (select count(*)::int from incubation_benchmark_account) as benchmark_accounts,
        (select count(*)::int from incubation_content_sample) as content_samples,
        (select count(*)::int from incubation_content_sample where is_viral = true) as viral_samples,
        (select count(*)::int from incubation_comment_need) as comment_needs,
        (select count(*)::int from incubation_topic) as topics,
        (select count(*)::int from incubation_topic where status = 'pending_review') as pending_topics,
        (select count(*)::int from incubation_task where status in ('failed', 'waiting_manual')) as task_alerts,
        (select count(*)::int from incubation_owned_account) as owned_accounts,
        (select count(*)::int from incubation_material_asset) as materials
    `;
    const tasks = await this.sql<Record<string, unknown>[]>`
      select status, count(*)::int as count
      from incubation_task
      group by status
      order by status
    `;
    const topTracks = await this.sql<Record<string, unknown>[]>`
      select id, name, total_score, status
      from incubation_track
      order by total_score desc, updated_at desc
      limit 5
    `;
    const needClusters = await this.sql<Record<string, unknown>[]>`
      select need_type, count(*)::int as count, round(avg(intent_score), 2) as avg_intent
      from incubation_comment_need
      group by need_type
      order by count desc, avg_intent desc
      limit 6
    `;
    return { tracks, assets, tasks, top_tracks: topTracks, need_clusters: needClusters };
  }
}
