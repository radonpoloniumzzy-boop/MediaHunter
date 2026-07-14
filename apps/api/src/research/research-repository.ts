import { randomUUID } from "node:crypto";

import type { Sql } from "postgres";

import { deriveTaskProgress } from "./task-progress";
import { deriveTaskStatus } from "./task-status";
import { getArticleOrderClause } from "./article-sort";
import type { AuthUser, ArticleListFilters, RoleName, RuleHit, TaskStatus, WeChatArticleSnapshot } from "./types";

function asJson<T>(sql: Sql, value: T) {
  return sql.json(JSON.parse(JSON.stringify(value)));
}

function mapRoles(value: unknown): RoleName[] {
  return Array.isArray(value) ? (value as RoleName[]) : [];
}

function mapUser(row: Record<string, unknown>): AuthUser & { password_hash?: string } {
  return {
    id: row.id as string,
    username: row.username as string,
    display_name: row.display_name as string,
    status: row.status as string,
    roles: mapRoles(row.roles),
    password_hash: row.password_hash as string | undefined
  };
}

function normalizeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export interface TaskItemClaim {
  id: string;
  task_id: string;
  task_type: string;
  months_back: number | null;
  source_id: string | null;
  target_url: string | null;
  retry_count: number;
  account_name: string | null;
  entry_url: string | null;
  manual_article_urls: string[];
  priority: string | null;
}

export class ResearchRepository {
  constructor(private readonly sql: Sql) {}

  async deleteExpiredSessions(): Promise<void> {
    await this.sql`delete from auth_sessions where expires_at < now()`;
  }

  async getUserByUsername(username: string) {
    const rows = await this.sql<Record<string, unknown>[]>`
      select
        u.id,
        u.username,
        u.display_name,
        u.password_hash,
        u.status,
        coalesce(json_agg(r.name order by r.name) filter (where r.name is not null), '[]'::json) as roles
      from users u
      left join user_roles ur on ur.user_id = u.id
      left join roles r on r.id = ur.role_id
      where u.username = ${username}
      group by u.id
      limit 1
    `;

    return rows[0] ? mapUser(rows[0]) : null;
  }

  async createSession(userId: string, token: string, expiresAt: string): Promise<void> {
    await this.sql`
      insert into auth_sessions (token, user_id, expires_at)
      values (${token}, ${userId}, ${expiresAt})
    `;
  }

  async deleteSession(token: string): Promise<void> {
    await this.sql`delete from auth_sessions where token = ${token}`;
  }

  async getUserBySessionToken(token: string): Promise<AuthUser | null> {
    await this.deleteExpiredSessions();

    const rows = await this.sql<Record<string, unknown>[]>`
      select
        u.id,
        u.username,
        u.display_name,
        u.status,
        coalesce(json_agg(r.name order by r.name) filter (where r.name is not null), '[]'::json) as roles
      from auth_sessions s
      join users u on u.id = s.user_id
      left join user_roles ur on ur.user_id = u.id
      left join roles r on r.id = ur.role_id
      where s.token = ${token}
        and s.expires_at >= now()
      group by u.id
      limit 1
    `;

    return rows[0] ? mapUser(rows[0]) : null;
  }

  async logOperation(
    actor: AuthUser | null,
    action: string,
    targetType: string,
    targetId: string | null,
    detail: Record<string, unknown>
  ): Promise<void> {
    await this.sql`
      insert into operation_log (id, actor_user_id, actor_username, action, target_type, target_id, detail)
      values (
        ${randomUUID()},
        ${actor?.id ?? null},
        ${actor?.username ?? null},
        ${action},
        ${targetType},
        ${targetId},
        ${asJson(this.sql, detail)}
      )
    `;
  }

  async listGroups() {
    return this.sql<Record<string, unknown>[]>`
      select id, name, description, created_at::text, updated_at::text
      from account_group
      order by name asc
    `;
  }

  async createGroup(user: AuthUser, input: { name: string; description?: string }) {
    const id = randomUUID();
    await this.sql`
      insert into account_group (id, name, description, created_by)
      values (${id}, ${input.name}, ${input.description ?? null}, ${user.id})
    `;
    await this.logOperation(user, "group.create", "account_group", id, input);
    return id;
  }

  async listAccounts() {
    return this.sql<Record<string, unknown>[]>`
      select
        a.id,
        a.name,
        a.source_type,
        a.wechat_id,
        a.biz_id,
        a.source_category,
        a.sub_type,
        a.group_id,
        g.name as group_name,
        a.entry_url,
        a.manual_article_urls,
        a.priority,
        a.status,
        a.notes,
        a.last_crawled_at::text,
        a.last_success_at::text,
        a.fail_count,
        a.created_at::text,
        a.updated_at::text
      from account_source a
      left join account_group g on g.id = a.group_id
      order by
        case a.priority when 'A' then 1 when 'B' then 2 else 3 end,
        a.updated_at desc
    `;
  }

  async upsertAccount(
    user: AuthUser,
    input: {
      id?: string;
      name: string;
      wechat_id?: string | null;
      biz_id?: string | null;
      source_category?: string | null;
      sub_type?: string | null;
      group_id?: string | null;
      entry_url?: string | null;
      manual_article_urls?: string[];
      priority?: string;
      status?: string;
      notes?: string | null;
    }
  ) {
    const id = input.id ?? randomUUID();
    await this.sql`
      insert into account_source (
        id,
        name,
        wechat_id,
        biz_id,
        source_category,
        sub_type,
        group_id,
        entry_url,
        manual_article_urls,
        priority,
        status,
        notes,
        created_by
      )
      values (
        ${id},
        ${input.name},
        ${input.wechat_id ?? null},
        ${input.biz_id ?? null},
        ${input.source_category ?? null},
        ${input.sub_type ?? null},
        ${input.group_id ?? null},
        ${input.entry_url ?? null},
        ${asJson(this.sql, input.manual_article_urls ?? [])},
        ${input.priority ?? "B"},
        ${input.status ?? "active"},
        ${input.notes ?? null},
        ${user.id}
      )
      on conflict (id) do update
      set name = excluded.name,
          wechat_id = excluded.wechat_id,
          biz_id = excluded.biz_id,
          source_category = excluded.source_category,
          sub_type = excluded.sub_type,
          group_id = excluded.group_id,
          entry_url = excluded.entry_url,
          manual_article_urls = excluded.manual_article_urls,
          priority = excluded.priority,
          status = excluded.status,
          notes = excluded.notes,
          updated_at = now()
    `;
    await this.logOperation(user, input.id ? "account.update" : "account.create", "account_source", id, input);
    return id;
  }

  async batchUpdateAccountStatus(user: AuthUser, accountIds: string[], status: string, groupId?: string | null) {
    if (!accountIds.length) return;
    await this.sql`
      update account_source
      set status = ${status},
          group_id = ${groupId ?? null},
          updated_at = now()
      where id = any(${accountIds})
    `;
    await this.logOperation(user, "account.batch_update", "account_source", null, {
      account_ids: accountIds,
      status,
      group_id: groupId ?? null
    });
  }

  async listRules() {
    return this.sql<Record<string, unknown>[]>`
      select id, rule_type, name, pattern, severity, status, weight, notes, created_at::text, updated_at::text
      from risk_rule
      order by rule_type asc, weight desc, name asc
    `;
  }

  async upsertRule(
    user: AuthUser,
    input: {
      id?: string;
      rule_type: string;
      name: string;
      pattern: string;
      severity: string;
      status?: string;
      weight?: number;
      notes?: string | null;
    }
  ) {
    const id = input.id ?? randomUUID();
    await this.sql`
      insert into risk_rule (id, rule_type, name, pattern, severity, status, weight, notes)
      values (
        ${id},
        ${input.rule_type},
        ${input.name},
        ${input.pattern},
        ${input.severity},
        ${input.status ?? "active"},
        ${input.weight ?? 0},
        ${input.notes ?? null}
      )
      on conflict (id) do update
      set rule_type = excluded.rule_type,
          name = excluded.name,
          pattern = excluded.pattern,
          severity = excluded.severity,
          status = excluded.status,
          weight = excluded.weight,
          notes = excluded.notes,
          updated_at = now()
    `;
    await this.logOperation(user, input.id ? "rule.update" : "rule.create", "risk_rule", id, input);
    return id;
  }

  async listTags() {
    return this.sql<Record<string, unknown>[]>`
      select id, dimension, label, value, description, color, is_active, created_at::text
      from tag_dictionary
      where is_active = true
      order by dimension asc, label asc
    `;
  }

  async createTag(
    user: AuthUser,
    input: {
      dimension: string;
      label: string;
      value?: string | null;
      color?: string | null;
      description?: string | null;
    }
  ) {
    const normalizedDimension = input.dimension.trim();
    const normalizedLabel = input.label.trim();
    const normalizedValue = (input.value ?? input.label).trim();

    const existing = await this.sql<Record<string, unknown>[]>`
      select id
      from tag_dictionary
      where dimension = ${normalizedDimension}
        and value = ${normalizedValue}
      limit 1
    `;
    const id = (existing[0]?.id as string | undefined) ?? randomUUID();

    await this.sql`
      insert into tag_dictionary (id, dimension, label, value, description, color, is_active)
      values (
        ${id},
        ${normalizedDimension},
        ${normalizedLabel},
        ${normalizedValue},
        ${input.description ?? null},
        ${input.color ?? null},
        true
      )
      on conflict (id) do update
      set label = excluded.label,
          value = excluded.value,
          description = excluded.description,
          color = excluded.color,
          is_active = true
    `;

    await this.logOperation(user, existing[0] ? "tag.reuse" : "tag.create", "tag_dictionary", id, {
      dimension: normalizedDimension,
      label: normalizedLabel,
      value: normalizedValue
    });

    return id;
  }

  async createTask(
    user: AuthUser,
    input: {
      task_name: string;
      task_type: string;
      source_ids: string[];
      target_urls: string[];
      concurrency: number;
      months_back?: number | null;
    }
  ) {
    const taskId = randomUUID();
    const sourceCount = input.source_ids.length + input.target_urls.length;
    await this.sql`
      insert into crawl_task (id, task_name, task_type, status, source_count, concurrency, months_back, created_by)
      values (
        ${taskId},
        ${input.task_name},
        ${input.task_type},
        ${"pending"},
        ${sourceCount},
        ${input.concurrency},
        ${input.months_back ?? null},
        ${user.id}
      )
    `;

    for (const sourceId of input.source_ids) {
      await this.sql`
        insert into crawl_task_item (id, task_id, source_id, status)
        values (${randomUUID()}, ${taskId}, ${sourceId}, ${"pending"})
      `;
    }

    for (const targetUrl of input.target_urls) {
      await this.sql`
        insert into crawl_task_item (id, task_id, target_url, status)
        values (${randomUUID()}, ${taskId}, ${targetUrl}, ${"pending"})
      `;
    }

    await this.logOperation(user, "task.create", "crawl_task", taskId, input);
    return taskId;
  }

  async createRetryTask(user: AuthUser, taskId: string) {
    const failedItems = await this.sql<Record<string, unknown>[]>`
      select source_id, target_url
      from crawl_task_item
      where task_id = ${taskId}
        and status = ${"failed"}
    `;

    const sourceIds = failedItems.map((item) => item.source_id).filter((value): value is string => typeof value === "string");
    const targetUrls = failedItems.map((item) => item.target_url).filter((value): value is string => typeof value === "string");

    if (!sourceIds.length && !targetUrls.length) {
      return null;
    }

    return this.createTask(user, {
      task_name: `失败重跑-${taskId.slice(0, 8)}`,
      task_type: "failed_retry",
      source_ids: sourceIds,
      target_urls: targetUrls,
      concurrency: 2
    });
  }

  async updateTaskStatus(user: AuthUser, taskId: string, status: TaskStatus) {
    await this.sql`
      update crawl_task
      set status = ${status},
          paused_at = ${status === "paused" ? new Date().toISOString() : null},
          updated_at = now()
      where id = ${taskId}
    `;

    if (status === "paused") {
      await this.sql`
        update crawl_task_item
        set status = ${"paused"},
            updated_at = now()
        where task_id = ${taskId}
          and status = ${"pending"}
      `;
    }

    if (status === "cancelled") {
      await this.sql`
        update crawl_task_item
        set status = ${"cancelled"},
            ended_at = now(),
            updated_at = now()
        where task_id = ${taskId}
          and status in ('pending', 'paused')
      `;
    }

    if (status === "pending") {
      await this.sql`
        update crawl_task_item
        set status = ${"pending"},
            updated_at = now()
        where task_id = ${taskId}
          and status = ${"paused"}
      `;
    }

    await this.logOperation(user, "task.status_change", "crawl_task", taskId, {
      status
    });
  }

  async listTasks() {
    const rows = await this.sql<Record<string, unknown>[]>`
      select
        t.id,
        t.task_name,
        t.task_type,
        t.status,
        t.source_count,
        t.article_count,
        t.concurrency,
        t.months_back,
        t.error_summary,
        t.started_at::text,
        t.ended_at::text,
        t.created_at::text,
        t.updated_at::text,
        u.display_name as created_by_name,
        coalesce(sum(case when i.status = 'success' then 1 else 0 end), 0) as success_count,
        coalesce(sum(case when i.status = 'failed' then 1 else 0 end), 0) as failed_count,
        coalesce(sum(case when i.status = 'running' then 1 else 0 end), 0) as running_count,
        coalesce(sum(case when i.status = 'pending' then 1 else 0 end), 0) as pending_count,
        coalesce(sum(case when i.status = 'paused' then 1 else 0 end), 0) as paused_count,
        coalesce(sum(case when i.status = 'cancelled' then 1 else 0 end), 0) as cancelled_count,
        count(i.id) as total_count
      from crawl_task t
      left join crawl_task_item i on i.task_id = t.id
      left join users u on u.id = t.created_by
      group by t.id, u.display_name
      order by t.created_at desc
    `;

    return rows.map((row) => ({
      ...row,
      status: deriveTaskStatus(row, (row.status as TaskStatus | undefined) ?? "pending"),
      ...deriveTaskProgress(row)
    }));
  }

  async deleteTask(user: AuthUser, taskId: string) {
    const running = await this.sql<Record<string, unknown>[]>`
      select count(*)::int as running_count
      from crawl_task_item
      where task_id = ${taskId}
        and status = ${"running"}
    `;

    if (Number(running[0]?.running_count ?? 0) > 0) {
      throw new Error("任务仍在运行中，请先等待其结束后再删除");
    }

    await this.sql`
      delete from crawl_task
      where id = ${taskId}
    `;
    await this.logOperation(user, "task.delete", "crawl_task", taskId, {});
  }

  async listTaskItems(taskId: string) {
    return this.sql<Record<string, unknown>[]>`
      select
        i.id,
        i.task_id,
        i.source_id,
        i.target_url,
        i.status,
        i.retry_count,
        i.available_at::text,
        i.started_at::text,
        i.ended_at::text,
        i.error_message,
        i.discovered_count,
        i.article_count,
        i.last_result,
        a.name as source_name
      from crawl_task_item i
      left join account_source a on a.id = i.source_id
      where i.task_id = ${taskId}
      order by i.created_at asc
    `;
  }

  async getActiveRules() {
    return this.sql<Record<string, unknown>[]>`
      select id, rule_type, pattern, severity
      from risk_rule
      where status = ${"active"}
      order by weight desc, created_at asc
    `;
  }

  async claimNextTaskItem(activeSourceIds: string[]): Promise<TaskItemClaim | null> {
    const excludedClause =
      activeSourceIds.length > 0
        ? this.sql`and (i.source_id is null or not (i.source_id = any(${activeSourceIds})))`
        : this.sql``;

    const rows = await this.sql<Record<string, unknown>[]>`
      with next_item as (
        select i.id
        from crawl_task_item i
        join crawl_task t on t.id = i.task_id
        where i.status = ${"pending"}
          and i.available_at <= now()
          and t.status in ('pending', 'running')
          ${excludedClause}
        order by t.created_at asc, i.created_at asc
        limit 1
        for update skip locked
      )
      update crawl_task_item i
      set status = ${"running"},
          started_at = coalesce(i.started_at, now()),
          updated_at = now()
      from next_item
      where i.id = next_item.id
      returning i.id, i.task_id, i.source_id, i.target_url, i.retry_count
    `;

    if (!rows[0]) {
      return null;
    }

    const item = rows[0];
    await this.sql`
      update crawl_task
      set status = ${"running"},
          started_at = coalesce(started_at, now()),
          updated_at = now()
      where id = ${item.task_id as string}
        and status = ${"pending"}
    `;

    const detailRows = await this.sql<Record<string, unknown>[]>`
      select
        i.id,
        i.task_id,
        i.source_id,
        i.target_url,
        i.retry_count,
        t.task_type,
        t.months_back,
        a.name as account_name,
        a.entry_url,
        a.manual_article_urls,
        a.priority
      from crawl_task_item i
      join crawl_task t on t.id = i.task_id
      left join account_source a on a.id = i.source_id
      where i.id = ${item.id as string}
      limit 1
    `;

    if (!detailRows[0]) return null;
    const row = detailRows[0];
    return {
      id: row.id as string,
      task_id: row.task_id as string,
      source_id: (row.source_id as string | null) ?? null,
      target_url: (row.target_url as string | null) ?? null,
      retry_count: Number(row.retry_count ?? 0),
      task_type: row.task_type as string,
      months_back: (row.months_back as number | null) ?? null,
      account_name: (row.account_name as string | null) ?? null,
      entry_url: (row.entry_url as string | null) ?? null,
      manual_article_urls: normalizeArray<string>(row.manual_article_urls),
      priority: (row.priority as string | null) ?? null
    };
  }

  async markItemSuccess(taskItemId: string, articleCount: number, discoveredCount: number, result: Record<string, unknown>) {
    const rows = await this.sql<Record<string, unknown>[]>`
      update crawl_task_item
      set status = ${"success"},
          article_count = ${articleCount},
          discovered_count = ${discoveredCount},
          last_result = ${asJson(this.sql, result)},
          ended_at = now(),
          updated_at = now()
      where id = ${taskItemId}
      returning task_id, source_id
    `;
    if (!rows[0]) return;
    const row = rows[0];
    if (row.source_id) {
      await this.sql`
        update account_source
        set last_crawled_at = now(),
            last_success_at = now(),
            fail_count = 0,
            updated_at = now()
        where id = ${row.source_id as string}
      `;
    }

    await this.sql`
      update crawl_task
      set article_count = article_count + ${articleCount},
          updated_at = now()
      where id = ${row.task_id as string}
    `;

    await this.refreshTaskStatus(row.task_id as string);
  }

  async markItemFailure(taskItemId: string, errorMessage: string, shouldRetry: boolean, backoffSeconds: number) {
    const rows = await this.sql<Record<string, unknown>[]>`
      update crawl_task_item
      set status = ${shouldRetry ? "pending" : "failed"},
          retry_count = retry_count + 1,
          error_message = ${errorMessage},
          available_at = now() + make_interval(secs => ${backoffSeconds}),
          ended_at = case when ${shouldRetry} then null else now() end,
          updated_at = now()
      where id = ${taskItemId}
      returning task_id, source_id
    `;
    if (!rows[0]) return;
    const row = rows[0];

    if (row.source_id) {
      await this.sql`
        update account_source
        set last_crawled_at = now(),
            fail_count = fail_count + 1,
            updated_at = now()
        where id = ${row.source_id as string}
      `;
    }

    if (!shouldRetry) {
      await this.refreshTaskStatus(row.task_id as string);
    }
  }

  async refreshTaskStatus(taskId: string) {
    const rows = await this.sql<Record<string, unknown>[]>`
      select
        count(*)::int as total_count,
        sum(case when status = 'success' then 1 else 0 end)::int as success_count,
        sum(case when status = 'failed' then 1 else 0 end)::int as failed_count,
        sum(case when status = 'running' then 1 else 0 end)::int as running_count,
        sum(case when status = 'pending' then 1 else 0 end)::int as pending_count,
        sum(case when status = 'paused' then 1 else 0 end)::int as paused_count,
        sum(case when status = 'cancelled' then 1 else 0 end)::int as cancelled_count
      from crawl_task_item
      where task_id = ${taskId}
    `;
    const summary = rows[0];
    if (!summary) return;

    const status = deriveTaskStatus(summary, "pending");

    await this.sql`
      update crawl_task
      set status = ${status},
          ended_at = case
            when ${status} in ('success', 'partial_success', 'failed', 'cancelled') then now()
            else ended_at
          end,
          updated_at = now()
      where id = ${taskId}
    `;
  }

  async recordWorkerHeartbeat(workerName: string, input?: { status?: string; process_id?: number | null; detail?: Record<string, unknown> }) {
    await this.sql`
      insert into worker_heartbeat (worker_name, status, process_id, detail, last_seen_at, updated_at)
      values (
        ${workerName},
        ${input?.status ?? "online"},
        ${input?.process_id ?? null},
        ${asJson(this.sql, input?.detail ?? {})},
        now(),
        now()
      )
      on conflict (worker_name) do update
      set status = excluded.status,
          process_id = excluded.process_id,
          detail = excluded.detail,
          last_seen_at = excluded.last_seen_at,
          updated_at = excluded.updated_at
    `;
  }

  async getSystemStatus() {
    const rows = await this.sql<Record<string, unknown>[]>`
      select worker_name, status, process_id, detail, last_seen_at::text
      from worker_heartbeat
      where worker_name = ${"collector"}
      limit 1
    `;
    const collector = rows[0];
    const lastSeenAt = (collector?.last_seen_at as string | undefined) ?? null;
    const online =
      lastSeenAt !== null && new Date(lastSeenAt).getTime() >= Date.now() - 15000;

    return {
      collector_online: online,
      collector_last_seen_at: lastSeenAt,
      collector_status: (collector?.status as string | undefined) ?? (online ? "online" : "offline"),
      collector_process_id: collector?.process_id ? Number(collector.process_id) : null
    };
  }

  async upsertArticleRecord(input: {
    content_article_id: string;
    source_id: string | null;
    source_name: string | null;
    source_category: string | null;
    article_url: string;
    snapshot: WeChatArticleSnapshot;
    content_hash: string;
    risk_level: string;
    column_type: string | null;
    hits: RuleHit[];
  }) {
    const publishTime = input.snapshot.publish_time ? new Date(input.snapshot.publish_time).toISOString() : null;
    const directRows = await this.sql<Record<string, unknown>[]>`
      select id, snapshot_version
      from article
      where article_url = ${input.article_url}
      limit 1
    `;
    const direct = directRows[0];

    if (direct) {
      const nextVersion = Number(direct.snapshot_version ?? 0) + 1;
      await this.sql`
        update article
        set content_article_id = ${input.content_article_id},
            source_id = ${input.source_id},
            source_name = ${input.source_name},
            title = ${input.snapshot.title},
            publish_time = ${publishTime},
            crawl_time = now(),
            author = ${input.snapshot.author},
            summary = ${input.snapshot.summary},
            cover_url = ${input.snapshot.cover_url},
            content_html = ${input.snapshot.content_html},
            content_text = ${input.snapshot.content_text},
            images = ${asJson(this.sql, input.snapshot.image_urls)},
            has_video = ${input.snapshot.has_video},
            has_audio = ${input.snapshot.has_audio},
            raw_json = ${asJson(this.sql, input.snapshot.raw_json)},
            content_hash = ${input.content_hash},
            snapshot_version = ${nextVersion},
            source_category = ${input.source_category},
            column_type = ${input.column_type},
            risk_level = ${input.risk_level},
            review_status = ${input.risk_level === "high" || input.risk_level === "blocked" ? "needs_compliance" : "unreviewed"},
            updated_at = now()
        where id = ${direct.id as string}
      `;
      await this.insertSnapshotAndHits(direct.id as string, nextVersion, input.snapshot, input.content_hash, input.hits);
      return { articleId: direct.id as string, duplicate: false, created: false };
    }

    const titlePublishRows =
      publishTime === null
        ? []
        : await this.sql<Record<string, unknown>[]>`
            select id, snapshot_version
            from article
            where title = ${input.snapshot.title}
              and publish_time = ${publishTime}
            limit 1
          `;
    const byTitlePublish = titlePublishRows[0];

    if (byTitlePublish) {
      const nextVersion = Number(byTitlePublish.snapshot_version ?? 0) + 1;
      await this.sql`
        update article
        set content_article_id = ${input.content_article_id},
            article_url = ${input.article_url},
            crawl_time = now(),
            content_html = ${input.snapshot.content_html},
            content_text = ${input.snapshot.content_text},
            raw_json = ${asJson(this.sql, input.snapshot.raw_json)},
            images = ${asJson(this.sql, input.snapshot.image_urls)},
            content_hash = ${input.content_hash},
            snapshot_version = ${nextVersion},
            risk_level = ${input.risk_level},
            column_type = ${input.column_type},
            review_status = ${input.risk_level === "high" || input.risk_level === "blocked" ? "needs_compliance" : "unreviewed"},
            updated_at = now()
        where id = ${byTitlePublish.id as string}
      `;
      await this.insertSnapshotAndHits(byTitlePublish.id as string, nextVersion, input.snapshot, input.content_hash, input.hits);
      return { articleId: byTitlePublish.id as string, duplicate: false, created: false };
    }

    const contentMatchRows = await this.sql<Record<string, unknown>[]>`
      select id
      from article
      where content_hash = ${input.content_hash}
      limit 1
    `;
    const duplicateOf = contentMatchRows[0]?.id as string | undefined;

    const articleId = randomUUID();
    await this.sql`
      insert into article (
        id,
        content_article_id,
        source_id,
        source_name,
        title,
        article_url,
        publish_time,
        crawl_time,
        author,
        summary,
        cover_url,
        content_html,
        content_text,
        images,
        has_video,
        has_audio,
        raw_json,
        content_hash,
        snapshot_version,
        is_duplicate,
        duplicate_of_id,
        fulltext_access_level,
        source_category,
        column_type,
        risk_level,
        review_status
      )
      values (
        ${articleId},
        ${input.content_article_id},
        ${input.source_id},
        ${input.source_name},
        ${input.snapshot.title},
        ${input.article_url},
        ${publishTime},
        now(),
        ${input.snapshot.author},
        ${input.snapshot.summary},
        ${input.snapshot.cover_url},
        ${input.snapshot.content_html},
        ${input.snapshot.content_text},
        ${asJson(this.sql, input.snapshot.image_urls)},
        ${input.snapshot.has_video},
        ${input.snapshot.has_audio},
        ${asJson(this.sql, input.snapshot.raw_json)},
        ${input.content_hash},
        1,
        ${Boolean(duplicateOf)},
        ${duplicateOf ?? null},
        ${"restricted"},
        ${input.source_category},
        ${input.column_type},
        ${input.risk_level},
        ${input.risk_level === "high" || input.risk_level === "blocked" ? "needs_compliance" : "unreviewed"}
      )
    `;
    await this.insertSnapshotAndHits(articleId, 1, input.snapshot, input.content_hash, input.hits);

    return { articleId, duplicate: Boolean(duplicateOf), created: true };
  }

  private async insertSnapshotAndHits(
    articleId: string,
    version: number,
    snapshot: WeChatArticleSnapshot,
    contentHash: string,
    hits: RuleHit[]
  ) {
    await this.sql`
      insert into article_snapshot (id, article_id, version, content_html, content_text, raw_json, content_hash)
      values (
        ${randomUUID()},
        ${articleId},
        ${version},
        ${snapshot.content_html},
        ${snapshot.content_text},
        ${asJson(this.sql, snapshot.raw_json)},
        ${contentHash}
      )
    `;

    await this.sql`delete from risk_rule_hit where article_id = ${articleId}`;
    for (const hit of hits) {
      await this.sql`
        insert into risk_rule_hit (id, article_id, rule_id, hit_text, location, hit_count)
        values (${randomUUID()}, ${articleId}, ${hit.rule_id}, ${hit.hit_text}, ${hit.location}, ${hit.hit_count})
      `;
    }
  }

  async listArticles(filters: ArticleListFilters) {
    const clauses = ["1 = 1"];
    const params: Array<string | number | boolean | string[] | null> = [];
    const pushParam = (value: string | number | boolean | string[] | null) => {
      params.push(value);
      return `$${params.length}`;
    };

    if (filters.article_ids?.length) clauses.push(`a.id = any(${pushParam(filters.article_ids)})`);
    if (filters.keyword) {
      const like = `%${filters.keyword}%`;
      const slot = pushParam(like);
      clauses.push(`(a.title ilike ${slot} or coalesce(a.content_text, '') ilike ${slot} or coalesce(a.summary, '') ilike ${slot})`);
    }
    if (filters.source_id) clauses.push(`a.source_id = ${pushParam(filters.source_id)}`);
    if (filters.risk_level) clauses.push(`a.risk_level = ${pushParam(filters.risk_level)}`);
    if (filters.usability_level) clauses.push(`a.usability_level = ${pushParam(filters.usability_level)}`);
    if (filters.review_status) clauses.push(`a.review_status = ${pushParam(filters.review_status)}`);
    if (filters.start_date) clauses.push(`a.publish_time >= ${pushParam(filters.start_date)}`);
    if (filters.end_date) clauses.push(`a.publish_time <= ${pushParam(filters.end_date)}`);
    if (typeof filters.duplicate === "boolean") clauses.push(`a.is_duplicate = ${pushParam(filters.duplicate)}`);
    if (filters.tag_ids?.length) {
      clauses.push(`exists (
        select 1 from article_tag_relation atr
        where atr.article_id = a.id
          and atr.tag_id = any(${pushParam(filters.tag_ids)})
      )`);
    }
    const limit = Math.min(filters.limit ?? 50, 100);
    const offset = Math.max(filters.offset ?? 0, 0);
    const limitSlot = pushParam(limit);
    const offsetSlot = pushParam(offset);
    const orderClause = getArticleOrderClause(filters.sort_by, filters.sort_order);

    return this.sql.unsafe<Record<string, unknown>[]>(
      `
        select
          a.id,
          a.source_id,
          a.source_name,
          a.title,
          a.article_url,
          a.publish_time::text,
          a.crawl_time::text,
          a.author,
          a.summary,
          a.cover_url,
          a.snapshot_version,
          a.is_duplicate,
          a.risk_level,
          a.usability_level,
          a.review_status,
          a.column_type,
          a.updated_at::text,
          coalesce((
            select json_agg(json_build_object('id', td.id, 'dimension', td.dimension, 'label', td.label, 'value', td.value))
            from article_tag_relation atr
            join tag_dictionary td on td.id = atr.tag_id
            where atr.article_id = a.id
          ), '[]'::json) as tags
        from article_library_view a
        where ${clauses.join(" and ")}
        order by ${orderClause}
        limit ${limitSlot}
        offset ${offsetSlot}
      `,
      params as never[]
    );
  }

  async countArticles(filters: ArticleListFilters) {
    const clauses = ["1 = 1"];
    const params: Array<string | number | boolean | string[] | null> = [];
    const pushParam = (value: string | number | boolean | string[] | null) => {
      params.push(value);
      return `$${params.length}`;
    };

    if (filters.article_ids?.length) clauses.push(`a.id = any(${pushParam(filters.article_ids)})`);
    if (filters.keyword) {
      const like = `%${filters.keyword}%`;
      const slot = pushParam(like);
      clauses.push(`(a.title ilike ${slot} or coalesce(a.content_text, '') ilike ${slot} or coalesce(a.summary, '') ilike ${slot})`);
    }
    if (filters.source_id) clauses.push(`a.source_id = ${pushParam(filters.source_id)}`);
    if (filters.risk_level) clauses.push(`a.risk_level = ${pushParam(filters.risk_level)}`);
    if (filters.usability_level) clauses.push(`a.usability_level = ${pushParam(filters.usability_level)}`);
    if (filters.review_status) clauses.push(`a.review_status = ${pushParam(filters.review_status)}`);
    if (filters.start_date) clauses.push(`a.publish_time >= ${pushParam(filters.start_date)}`);
    if (filters.end_date) clauses.push(`a.publish_time <= ${pushParam(filters.end_date)}`);
    if (typeof filters.duplicate === "boolean") clauses.push(`a.is_duplicate = ${pushParam(filters.duplicate)}`);
    if (filters.tag_ids?.length) {
      clauses.push(`exists (
        select 1 from article_tag_relation atr
        where atr.article_id = a.id
          and atr.tag_id = any(${pushParam(filters.tag_ids)})
      )`);
    }

    const rows = await this.sql.unsafe<Record<string, unknown>[]>(
      `
        select count(*)::int as total
        from article_library_view a
        where ${clauses.join(" and ")}
      `,
      params as never[]
    );

    return Number(rows[0]?.total ?? 0);
  }

  async listArticlesForExport(filters: ArticleListFilters) {
    const clauses = ["1 = 1"];
    const params: Array<string | number | boolean | string[] | null> = [];
    const pushParam = (value: string | number | boolean | string[] | null) => {
      params.push(value);
      return `$${params.length}`;
    };

    if (filters.article_ids?.length) clauses.push(`a.id = any(${pushParam(filters.article_ids)})`);
    if (filters.keyword) {
      const like = `%${filters.keyword}%`;
      const slot = pushParam(like);
      clauses.push(`(a.title ilike ${slot} or coalesce(a.content_text, '') ilike ${slot} or coalesce(a.summary, '') ilike ${slot})`);
    }
    if (filters.source_id) clauses.push(`a.source_id = ${pushParam(filters.source_id)}`);
    if (filters.risk_level) clauses.push(`a.risk_level = ${pushParam(filters.risk_level)}`);
    if (filters.usability_level) clauses.push(`a.usability_level = ${pushParam(filters.usability_level)}`);
    if (filters.review_status) clauses.push(`a.review_status = ${pushParam(filters.review_status)}`);
    if (filters.start_date) clauses.push(`a.publish_time >= ${pushParam(filters.start_date)}`);
    if (filters.end_date) clauses.push(`a.publish_time <= ${pushParam(filters.end_date)}`);
    if (typeof filters.duplicate === "boolean") clauses.push(`a.is_duplicate = ${pushParam(filters.duplicate)}`);
    if (filters.tag_ids?.length) {
      clauses.push(`exists (
        select 1 from article_tag_relation atr
        where atr.article_id = a.id
          and atr.tag_id = any(${pushParam(filters.tag_ids)})
      )`);
    }

    const limit = Math.min(filters.limit ?? 500, 1000);
    const offset = Math.max(filters.offset ?? 0, 0);
    const limitSlot = pushParam(limit);
    const offsetSlot = pushParam(offset);

    return this.sql.unsafe<Record<string, unknown>[]>(
      `
        select
          a.id,
          a.source_id,
          a.source_name,
          a.title,
          a.article_url,
          a.publish_time::text,
          a.crawl_time::text,
          a.author,
          a.summary,
          a.cover_url,
          a.content_html,
          a.content_text,
          a.raw_json,
          a.snapshot_version,
          a.is_duplicate,
          a.review_status,
          a.risk_level,
          a.usability_level,
          a.column_type,
          a.content_goal,
          a.title_pattern,
          a.borrow_dimensions,
          a.images,
          a.has_video,
          a.has_audio,
          a.content_hash,
          coalesce((
            select json_agg(
              json_build_object(
                'id', td.id,
                'dimension', td.dimension,
                'label', td.label,
                'value', td.value
              )
              order by td.dimension asc, td.label asc
            )
            from article_tag_relation atr
            join tag_dictionary td on td.id = atr.tag_id
            where atr.article_id = a.id
          ), '[]'::json) as tags,
          coalesce((
            select json_agg(
              json_build_object(
                'rule_name', rr.name,
                'rule_type', rr.rule_type,
                'severity', rr.severity,
                'hit_text', h.hit_text,
                'location', h.location,
                'hit_count', h.hit_count
              )
              order by rr.weight desc, h.created_at asc
            )
            from risk_rule_hit h
            join risk_rule rr on rr.id = h.rule_id
            where h.article_id = a.id
          ), '[]'::json) as hits
        from article_library_view a
        where ${clauses.join(" and ")}
        order by a.publish_time desc nulls last, a.updated_at desc
        limit ${limitSlot}
        offset ${offsetSlot}
      `,
      params as never[]
    );
  }

  async getArticleDetail(articleId: string) {
    const articleRows = await this.sql<Record<string, unknown>[]>`
      select
        a.*,
        a.publish_time::text as publish_time_text,
        a.crawl_time::text as crawl_time_text,
        a.created_at::text as created_at_text,
        a.updated_at::text as updated_at_text,
        coalesce((
          select json_agg(json_build_object('id', td.id, 'dimension', td.dimension, 'label', td.label, 'value', td.value))
          from article_tag_relation atr
          join tag_dictionary td on td.id = atr.tag_id
          where atr.article_id = a.id
        ), '[]'::json) as tags
      from article_library_view a
      where a.id = ${articleId}
      limit 1
    `;
    if (!articleRows[0]) return null;

    const snapshotRows = await this.sql<Record<string, unknown>[]>`
      select cs.id, cs.version, cs.content_hash, cs.captured_at::text
      from article a
      join content_snapshot cs on cs.article_id = a.content_article_id
      where a.id = ${articleId}
      order by cs.version desc
    `;
    const reviewRows = await this.sql<Record<string, unknown>[]>`
      select
        r.id,
        r.usability_level,
        r.risk_level,
        r.borrow_dimensions,
        r.comment,
        r.review_status,
        r.reviewed_at::text,
        u.display_name as reviewer_name,
        u.username as reviewer_username
      from article_review r
      join users u on u.id = r.reviewer_id
      where r.article_id = ${articleId}
      order by r.reviewed_at desc
    `;
    const hitRows = await this.sql<Record<string, unknown>[]>`
      select
        h.id,
        h.hit_text,
        h.location,
        h.hit_count,
        rr.name as rule_name,
        rr.rule_type,
        rr.severity
      from risk_rule_hit h
      join risk_rule rr on rr.id = h.rule_id
      where h.article_id = ${articleId}
      order by rr.weight desc, h.created_at asc
    `;
    const logRows = await this.sql<Record<string, unknown>[]>`
      select actor_username, action, detail, created_at::text
      from operation_log
      where target_type = ${"article"}
        and target_id = ${articleId}
      order by created_at desc
      limit 20
    `;

    return {
      article: articleRows[0],
      snapshots: snapshotRows,
      reviews: reviewRows,
      hits: hitRows,
      logs: logRows
    };
  }

  async saveArticleReview(
    user: AuthUser,
    articleId: string,
    input: {
      usability_level?: string | null;
      risk_level?: string | null;
      borrow_dimensions?: string[];
      comment?: string | null;
      review_status?: string;
      tag_ids?: string[];
      content_goal?: string | null;
    }
  ) {
    const reviewId = randomUUID();
    await this.sql`
      insert into article_review (id, article_id, reviewer_id, usability_level, risk_level, borrow_dimensions, comment, review_status)
      values (
        ${reviewId},
        ${articleId},
        ${user.id},
        ${input.usability_level ?? null},
        ${input.risk_level ?? null},
        ${asJson(this.sql, input.borrow_dimensions ?? [])},
        ${input.comment ?? null},
        ${input.review_status ?? "reviewed"}
      )
    `;

    await this.sql`
      update article
      set usability_level = ${input.usability_level ?? null},
          risk_level = coalesce(${input.risk_level ?? null}, risk_level),
          borrow_dimensions = ${asJson(this.sql, input.borrow_dimensions ?? [])},
          content_goal = ${input.content_goal ?? null},
          review_status = ${input.review_status ?? "reviewed"},
          updated_at = now()
      where id = ${articleId}
    `;

    if (input.tag_ids) {
      await this.sql`delete from article_tag_relation where article_id = ${articleId}`;
      for (const tagId of input.tag_ids) {
        await this.sql`
          insert into article_tag_relation (article_id, tag_id, created_by)
          values (${articleId}, ${tagId}, ${user.id})
          on conflict do nothing
        `;
      }
    }

    await this.logOperation(user, "article.review", "article", articleId, input as Record<string, unknown>);
    return reviewId;
  }

  async deleteArticles(user: AuthUser, articleIds: string[]) {
    if (!articleIds.length) {
      return { deleted_count: 0 };
    }

    const rows = await this.sql.begin(async (transaction) => {
      const tx = transaction as unknown as Sql;
      const removableContent = await tx<Record<string, unknown>[]>`
        select distinct
          ca.id,
          ca.canonical_url,
          a.source_name,
          ca.title,
          ca.current_content_hash
        from article a
        join content_article ca on ca.id = a.content_article_id
        where a.id = any(${articleIds})
          and not exists (
            select 1 from article remaining
            where remaining.content_article_id = ca.id
              and not (remaining.id = any(${articleIds}))
          )
      `;
      for (const content of removableContent) {
        await tx`
          insert into content_source_tombstone (
            id, content_article_id, canonical_url, source_name, title,
            last_content_hash, removed_by, reason
          )
          values (
            ${randomUUID()}, ${String(content.id)}, ${String(content.canonical_url)},
            ${content.source_name ? String(content.source_name) : null}, ${String(content.title)},
            ${content.current_content_hash ? String(content.current_content_hash) : null},
            ${user.id}, ${"user_deleted"}
          )
          on conflict (content_article_id) do update
          set removed_by = excluded.removed_by,
              reason = excluded.reason,
              removed_at = now()
        `;
        await tx`delete from content_snapshot where article_id = ${String(content.id)}`;
        await tx`
          update content_article
          set status = ${"removed"},
              current_snapshot_version = 0,
              current_content_hash = null,
              updated_at = now()
          where id = ${String(content.id)}
        `;
      }

      await tx`delete from article_tag_relation where article_id = any(${articleIds})`;
      await tx`delete from article_review where article_id = any(${articleIds})`;
      await tx`delete from risk_rule_hit where article_id = any(${articleIds})`;
      await tx`delete from article_snapshot where article_id = any(${articleIds})`;
      await tx`
        delete from operation_log
        where target_type = ${"article"}
          and target_id = any(${articleIds})
      `;
      return tx<Record<string, unknown>[]>`
        delete from article
        where id = any(${articleIds})
        returning id
      `;
    });

    await this.logOperation(user, "article.delete", "article", null, {
      article_ids: articleIds,
      deleted_count: rows.length
    });

    return { deleted_count: rows.length };
  }

  async recordFulltextView(user: AuthUser, articleId: string) {
    await this.logOperation(user, "article.fulltext_view", "article", articleId, {});
  }

  async createExportRecord(user: AuthUser, format: string, filters: Record<string, unknown>, articleCount: number) {
    await this.sql`
      insert into export_record (id, requested_by, format, filters, article_count)
      values (${randomUUID()}, ${user.id}, ${format}, ${asJson(this.sql, filters)}, ${articleCount})
    `;
    await this.logOperation(user, "article.export", "export_record", null, {
      format,
      article_count: articleCount,
      filters
    });
  }

  async listOperationLogs(limit = 100) {
    return this.sql<Record<string, unknown>[]>`
      select actor_username, action, target_type, target_id, detail, created_at::text
      from operation_log
      order by created_at desc
      limit ${limit}
    `;
  }

  async getDashboardSummary() {
    const [accounts] = await this.sql<Record<string, unknown>[]>`
      select
        count(*)::int as total_accounts,
        sum(case when status = 'active' then 1 else 0 end)::int as active_accounts,
        sum(case when status = 'blacklisted' then 1 else 0 end)::int as blacklisted_accounts
      from account_source
    `;
    const [tasks] = await this.sql<Record<string, unknown>[]>`
      select
        count(*)::int as total_tasks,
        sum(case when status = 'failed' then 1 else 0 end)::int as failed_tasks,
        sum(case when status = 'running' then 1 else 0 end)::int as running_tasks
      from crawl_task
      where created_at >= now() - interval '30 day'
    `;
    const [articles] = await this.sql<Record<string, unknown>[]>`
      select
        count(*)::int as total_articles,
        sum(case when risk_level in ('high', 'blocked') then 1 else 0 end)::int as high_risk_articles,
        sum(case when usability_level in ('A', 'B') then 1 else 0 end)::int as usable_articles,
        sum(case when crawl_time >= now() - interval '24 hour' then 1 else 0 end)::int as articles_24h
      from article
    `;
    const failureReasons = await this.sql<Record<string, unknown>[]>`
      select error_message, count(*)::int as count
      from crawl_task_item
      where status = ${"failed"}
      group by error_message
      order by count desc nulls last
      limit 5
    `;

    return {
      accounts,
      tasks,
      articles,
      failure_reasons: failureReasons
    };
  }
}
