import postgres, { type Sql } from "postgres";

import { ContentRepository } from "./content/repository";
import { LegacyContentMigrator } from "./content/legacy-content-migrator";
import { hashPassword } from "./research/auth-utils";

export async function createDatabaseConnection(databaseUrl: string): Promise<Sql> {
  const sql = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20
  });

  await sql`select 1`;
  return sql;
}

async function seedResearchDefaults(sql: Sql): Promise<void> {
  const roles = [
    { id: "role-admin", name: "admin", description: "管理员" },
    { id: "role-operator", name: "operator", description: "采集运营" },
    { id: "role-researcher", name: "researcher", description: "内容研究员" },
    { id: "role-compliance", name: "compliance", description: "合规审核员" },
    { id: "role-viewer", name: "viewer", description: "只读用户" }
  ] as const;

  for (const role of roles) {
    await sql`
      insert into roles (id, name, description)
      values (${role.id}, ${role.name}, ${role.description})
      on conflict (name) do update
      set description = excluded.description
    `;
  }

  const defaultPasswordHash = hashPassword("Changeme123!");
  const users = [
    { id: "user-admin", username: "admin", display_name: "系统管理员", role_id: "role-admin" },
    { id: "user-operator", username: "operator", display_name: "采集运营", role_id: "role-operator" },
    { id: "user-researcher", username: "researcher", display_name: "内容研究员", role_id: "role-researcher" },
    { id: "user-compliance", username: "compliance", display_name: "合规审核员", role_id: "role-compliance" },
    { id: "user-viewer", username: "viewer", display_name: "只读用户", role_id: "role-viewer" }
  ] as const;

  for (const user of users) {
    await sql`
      insert into users (id, username, display_name, password_hash, status)
      values (${user.id}, ${user.username}, ${user.display_name}, ${defaultPasswordHash}, ${"active"})
      on conflict (username) do update
      set display_name = excluded.display_name,
          status = excluded.status
    `;

    await sql`
      insert into user_roles (user_id, role_id)
      values (${user.id}, ${user.role_id})
      on conflict do nothing
    `;
  }

  const tags = [
    ["tag-risk-low", "risk_level", "低", "low", "#6fd3a6"],
    ["tag-risk-medium", "risk_level", "中", "medium", "#ffcc66"],
    ["tag-risk-high", "risk_level", "高", "high", "#ff8a65"],
    ["tag-risk-blocked", "risk_level", "禁学样本", "blocked", "#ff5f7a"],
    ["tag-usability-a", "usability_level", "A 可直接参考", "A", "#57d6ff"],
    ["tag-usability-b", "usability_level", "B 可改写参考", "B", "#5ad59a"],
    ["tag-usability-c", "usability_level", "C 仅供观察", "C", "#ffcc66"],
    ["tag-usability-d", "usability_level", "D 不建议借鉴", "D", "#ff8a65"],
    ["tag-borrow-topic", "borrow_dimension", "选题", "选题", "#68d6ff"],
    ["tag-borrow-title", "borrow_dimension", "标题", "标题", "#68d6ff"],
    ["tag-borrow-structure", "borrow_dimension", "结构", "结构", "#68d6ff"],
    ["tag-borrow-brand", "borrow_dimension", "品牌叙事", "品牌叙事", "#68d6ff"],
    ["tag-goal-brand", "content_goal", "品牌背书", "品牌背书", "#9e8cff"],
    ["tag-goal-research", "content_goal", "专业输出", "专业输出", "#9e8cff"],
    ["tag-goal-market", "content_goal", "市场观点", "市场观点", "#9e8cff"],
    ["tag-goal-culture", "content_goal", "招聘文化", "招聘文化", "#9e8cff"]
  ] as const;

  for (const [id, dimension, label, value, color] of tags) {
    await sql`
      insert into tag_dictionary (id, dimension, label, value, color, is_active)
      values (${id}, ${dimension}, ${label}, ${value}, ${color}, true)
      on conflict (id) do update
      set label = excluded.label,
          value = excluded.value,
          color = excluded.color,
          is_active = true
    `;
  }

  const riskRules = [
    ["rule-risk-guarantee", "risk", "承诺收益", "保本", "blocked", 100],
    ["rule-risk-profit", "risk", "承诺收益-2", "保收益", "blocked", 100],
    ["rule-risk-high-return", "risk", "高收益", "高收益", "high", 80],
    ["rule-risk-double", "risk", "翻倍", "翻倍", "high", 80],
    ["rule-risk-rush", "risk", "限额抢购", "限额抢购", "high", 70],
    ["rule-risk-insider", "risk", "内幕", "内幕", "high", 70],
    ["rule-risk-copy", "risk", "抄作业", "抄作业", "medium", 60],
    ["rule-column-monthly", "column", "月度观点", "月度观点", "low", 20],
    ["rule-column-weekly", "column", "投研周报", "投研周报", "low", 20],
    ["rule-column-market", "column", "市场观察", "市场观察", "low", 20],
    ["rule-column-brand", "column", "团队动态", "团队动态", "low", 20],
    ["rule-keyword-brand", "keyword", "品牌", "品牌", "low", 10],
    ["rule-keyword-market", "keyword", "市场", "市场", "low", 10]
  ] as const;

  for (const [id, ruleType, name, pattern, severity, weight] of riskRules) {
    await sql`
      insert into risk_rule (id, rule_type, name, pattern, severity, weight, status)
      values (${id}, ${ruleType}, ${name}, ${pattern}, ${severity}, ${weight}, ${"active"})
      on conflict (id) do update
      set name = excluded.name,
          pattern = excluded.pattern,
          severity = excluded.severity,
          weight = excluded.weight,
          status = excluded.status
    `;
  }
}

async function seedIncubationDefaults(sql: Sql): Promise<void> {
  const platforms = [
    ["platform-xhs", "小红书", "xiaohongshu"],
    ["platform-douyin", "抖音", "douyin"],
    ["platform-bilibili", "B站", "bilibili"],
    ["platform-wechat", "微信公众号", "wechat"],
    ["platform-github", "GitHub", "github"]
  ] as const;

  for (const [id, name, code] of platforms) {
    await sql`
      insert into incubation_platform (id, name, code, status)
      values (${id}, ${name}, ${code}, ${"active"})
      on conflict (code) do update
      set name = excluded.name,
          status = excluded.status,
          updated_at = now()
    `;
  }

  await sql`
    insert into incubation_storage_config (
      id,
      storage_type,
      local_path,
      directory_rule,
      backup_enabled
    )
    values (
      ${"default-storage"},
      ${"local"},
      ${"/data/mcn-assets"},
      ${"{date}/{platform}/{account}/{asset_type}"},
      false
    )
    on conflict (id) do nothing
  `;
}

export async function ensureSchema(sql: Sql): Promise<void> {
  await sql.unsafe(`
    create table if not exists chat_sessions (
      id text primary key,
      title text not null,
      status text not null default 'active',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists chat_messages (
      id text primary key,
      session_id text not null references chat_sessions(id) on delete cascade,
      role text not null check (role in ('user', 'assistant')),
      content text not null,
      created_at timestamptz not null default now()
    );

    create table if not exists requests (
      id text primary key,
      session_id text not null references chat_sessions(id) on delete cascade,
      status text not null,
      requirement_doc jsonb not null,
      workflow_state jsonb not null default '{}'::jsonb,
      error_message text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists article_versions (
      id text primary key,
      request_id text not null references requests(id) on delete cascade,
      stage text not null,
      payload jsonb not null,
      created_at timestamptz not null default now()
    );

    create table if not exists publish_queue (
      id text primary key,
      request_id text not null unique references requests(id) on delete cascade,
      article jsonb not null,
      review_status text not null,
      review_notes text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists review_events (
      id text primary key,
      publish_queue_id text not null references publish_queue(id) on delete cascade,
      action text not null,
      note text,
      created_at timestamptz not null default now()
    );

    create table if not exists roles (
      id text primary key,
      name text not null unique,
      description text not null,
      created_at timestamptz not null default now()
    );

    create table if not exists users (
      id text primary key,
      username text not null unique,
      display_name text not null,
      password_hash text not null,
      status text not null default 'active',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists user_roles (
      user_id text not null references users(id) on delete cascade,
      role_id text not null references roles(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (user_id, role_id)
    );

    create table if not exists auth_sessions (
      token text primary key,
      user_id text not null references users(id) on delete cascade,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    );

    create table if not exists account_group (
      id text primary key,
      name text not null unique,
      description text,
      created_by text references users(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists account_source (
      id text primary key,
      name text not null,
      source_type text not null default 'wechat_official_account',
      wechat_id text,
      biz_id text,
      source_category text,
      sub_type text,
      group_id text references account_group(id) on delete set null,
      entry_url text,
      manual_article_urls jsonb not null default '[]'::jsonb,
      priority text not null default 'B',
      status text not null default 'active',
      notes text,
      last_crawled_at timestamptz,
      last_success_at timestamptz,
      fail_count integer not null default 0,
      created_by text references users(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists crawl_task (
      id text primary key,
      task_name text not null,
      task_type text not null,
      status text not null default 'pending',
      source_count integer not null default 0,
      article_count integer not null default 0,
      concurrency integer not null default 3,
      months_back integer,
      created_by text references users(id),
      error_summary text,
      started_at timestamptz,
      ended_at timestamptz,
      paused_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists crawl_task_item (
      id text primary key,
      task_id text not null references crawl_task(id) on delete cascade,
      source_id text references account_source(id) on delete set null,
      target_url text,
      status text not null default 'pending',
      retry_count integer not null default 0,
      available_at timestamptz not null default now(),
      started_at timestamptz,
      ended_at timestamptz,
      error_message text,
      discovered_count integer not null default 0,
      article_count integer not null default 0,
      last_result jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists worker_heartbeat (
      worker_name text primary key,
      status text not null default 'online',
      process_id integer,
      detail jsonb not null default '{}'::jsonb,
      last_seen_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists article (
      id text primary key,
      source_id text references account_source(id) on delete set null,
      source_name text,
      title text not null,
      article_url text not null,
      publish_time timestamptz,
      crawl_time timestamptz not null default now(),
      author text,
      summary text,
      cover_url text,
      cover_cached_path text,
      content_html text,
      content_text text,
      images jsonb not null default '[]'::jsonb,
      has_video boolean not null default false,
      has_audio boolean not null default false,
      raw_json jsonb not null default '{}'::jsonb,
      content_hash text,
      snapshot_version integer not null default 1,
      is_duplicate boolean not null default false,
      duplicate_of_id text references article(id) on delete set null,
      fulltext_access_level text not null default 'restricted',
      source_category text,
      column_type text,
      content_goal text,
      title_pattern text,
      risk_level text not null default 'low',
      usability_level text,
      borrow_dimensions jsonb not null default '[]'::jsonb,
      review_status text not null default 'unreviewed',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists article_snapshot (
      id text primary key,
      article_id text not null references article(id) on delete cascade,
      version integer not null,
      content_html text not null,
      content_text text not null,
      raw_json jsonb not null default '{}'::jsonb,
      content_hash text not null,
      captured_at timestamptz not null default now(),
      created_by text references users(id),
      unique(article_id, version)
    );

    create table if not exists content_source (
      id text primary key,
      source_type text not null,
      canonical_key text not null,
      display_name text,
      canonical_url text,
      legacy_account_source_id text references account_source(id) on delete set null,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(source_type, canonical_key)
    );

    create table if not exists content_article (
      id text primary key,
      canonical_url text not null unique,
      source_id text references content_source(id) on delete set null,
      title text not null,
      author text,
      publish_time timestamptz,
      current_snapshot_version integer not null default 0,
      current_content_hash text,
      status text not null default 'active',
      first_seen_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists content_snapshot (
      id text primary key,
      article_id text not null references content_article(id) on delete cascade,
      version integer not null,
      source_url text not null,
      final_url text not null,
      http_status integer,
      title text not null,
      author text,
      publish_time timestamptz,
      summary text,
      cover_url text,
      content_html text not null,
      content_text text not null,
      raw_json jsonb not null default '{}'::jsonb,
      content_hash text not null,
      origin text not null default 'public_fetch',
      captured_at timestamptz not null default now(),
      unique(article_id, version),
      unique(article_id, content_hash)
    );

    create table if not exists content_image_reference (
      id text primary key,
      snapshot_id text not null references content_snapshot(id) on delete cascade,
      reference_type text not null,
      position integer not null,
      url text not null,
      alt_text text,
      created_at timestamptz not null default now(),
      unique(snapshot_id, reference_type, position, url)
    );

    create table if not exists content_legacy_article_link (
      legacy_article_id text primary key references article(id) on delete cascade,
      content_article_id text not null references content_article(id) on delete cascade,
      migrated_at timestamptz not null default now()
    );

    create table if not exists content_legacy_snapshot_link (
      legacy_snapshot_id text primary key references article_snapshot(id) on delete cascade,
      content_snapshot_id text not null references content_snapshot(id) on delete cascade,
      migrated_at timestamptz not null default now()
    );

    create table if not exists content_migration_run (
      id text primary key,
      migration_name text not null,
      status text not null,
      source_article_count integer not null default 0,
      source_snapshot_count integer not null default 0,
      migrated_article_count integer not null default 0,
      migrated_snapshot_count integer not null default 0,
      detail jsonb not null default '{}'::jsonb,
      started_at timestamptz not null default now(),
      completed_at timestamptz
    );

    create index if not exists idx_content_article_source on content_article(source_id, publish_time desc);
    create index if not exists idx_content_article_hash on content_article(current_content_hash);
    create index if not exists idx_content_snapshot_article on content_snapshot(article_id, version desc);
    create index if not exists idx_content_snapshot_hash on content_snapshot(content_hash);
    create index if not exists idx_content_image_snapshot on content_image_reference(snapshot_id, position);

    create table if not exists tag_dictionary (
      id text primary key,
      dimension text not null,
      label text not null,
      value text not null,
      description text,
      color text,
      is_active boolean not null default true,
      created_at timestamptz not null default now()
    );

    create table if not exists article_tag_relation (
      article_id text not null references article(id) on delete cascade,
      tag_id text not null references tag_dictionary(id) on delete cascade,
      created_by text references users(id),
      created_at timestamptz not null default now(),
      primary key (article_id, tag_id)
    );

    create table if not exists article_review (
      id text primary key,
      article_id text not null references article(id) on delete cascade,
      reviewer_id text not null references users(id) on delete cascade,
      usability_level text,
      risk_level text,
      borrow_dimensions jsonb not null default '[]'::jsonb,
      comment text,
      review_status text not null default 'reviewed',
      reviewed_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists risk_rule (
      id text primary key,
      rule_type text not null,
      name text not null,
      pattern text not null,
      severity text not null default 'low',
      status text not null default 'active',
      weight integer not null default 0,
      notes text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists risk_rule_hit (
      id text primary key,
      article_id text not null references article(id) on delete cascade,
      rule_id text not null references risk_rule(id) on delete cascade,
      hit_text text not null,
      location text not null,
      hit_count integer not null default 1,
      created_at timestamptz not null default now()
    );

    create table if not exists export_record (
      id text primary key,
      requested_by text not null references users(id) on delete cascade,
      format text not null,
      filters jsonb not null default '{}'::jsonb,
      article_count integer not null default 0,
      created_at timestamptz not null default now()
    );

    create table if not exists operation_log (
      id text primary key,
      actor_user_id text references users(id) on delete set null,
      actor_username text,
      action text not null,
      target_type text not null,
      target_id text,
      detail jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create index if not exists idx_chat_messages_session on chat_messages(session_id, created_at);
    create index if not exists idx_requests_session on requests(session_id, created_at desc);
    create index if not exists idx_publish_queue_status on publish_queue(review_status, updated_at desc);
    create index if not exists idx_account_source_status on account_source(status, priority, updated_at desc);
    create index if not exists idx_crawl_task_status on crawl_task(status, updated_at desc);
    create index if not exists idx_crawl_task_item_status on crawl_task_item(status, updated_at desc);
    create index if not exists idx_article_publish_time on article(publish_time desc nulls last);
    create index if not exists idx_article_risk_level on article(risk_level, updated_at desc);
    create index if not exists idx_article_review_status on article(review_status, updated_at desc);
    create index if not exists idx_operation_log_created_at on operation_log(created_at desc);
    create unique index if not exists idx_article_url_unique on article(article_url);
    create unique index if not exists idx_tag_dictionary_unique on tag_dictionary(dimension, value);
  `);

  await sql.unsafe(`
    create table if not exists incubation_platform (
      id text primary key,
      name text not null,
      code text not null unique,
      status text not null default 'active',
      created_by text references users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists incubation_track (
      id text primary key,
      name text not null,
      category text,
      sub_category text,
      target_user text,
      core_need text,
      primary_platform_id text references incubation_platform(id) on delete set null,
      monetization_path text,
      content_supply_difficulty text,
      compliance_risk_level text not null default 'medium',
      status text not null default 'observing',
      owner_id text references users(id) on delete set null,
      market_demand_score numeric(6,2) not null default 0,
      monetization_score numeric(6,2) not null default 0,
      content_supply_score numeric(6,2) not null default 0,
      benchmark_copy_score numeric(6,2) not null default 0,
      platform_fit_score numeric(6,2) not null default 0,
      compliance_risk_score numeric(6,2) not null default 0,
      total_score numeric(6,2) not null default 0,
      evidence_links jsonb not null default '[]'::jsonb,
      notes text,
      created_by text references users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists incubation_keyword (
      id text primary key,
      keyword text not null,
      platform_id text references incubation_platform(id) on delete set null,
      track_id text references incubation_track(id) on delete cascade,
      keyword_type text not null default 'seed',
      status text not null default 'active',
      notes text,
      created_by text references users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists incubation_information_source (
      id text primary key,
      name text not null,
      source_type text not null default 'rss',
      platform_id text references incubation_platform(id) on delete set null,
      track_id text references incubation_track(id) on delete set null,
      url text,
      rss_url text,
      frequency_minutes integer not null default 1440,
      importance text not null default 'B',
      status text not null default 'active',
      last_success_at timestamptz,
      last_error text,
      notes text,
      created_by text references users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists incubation_task (
      id text primary key,
      task_name text not null,
      task_type text not null default 'manual_import',
      entity_type text not null,
      status text not null default 'pending',
      source_id text references incubation_information_source(id) on delete set null,
      track_id text references incubation_track(id) on delete set null,
      source_count integer not null default 0,
      item_count integer not null default 0,
      result_count integer not null default 0,
      rate_limit_per_hour integer not null default 30,
      random_delay_seconds integer not null default 0,
      error_summary text,
      logs_json jsonb not null default '[]'::jsonb,
      created_by text references users(id) on delete set null,
      started_at timestamptz,
      ended_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists incubation_benchmark_account (
      id text primary key,
      platform_id text references incubation_platform(id) on delete set null,
      track_id text references incubation_track(id) on delete set null,
      name text not null,
      url text,
      follower_count integer not null default 0,
      account_level text not null default '腰部',
      content_line text,
      posts_30d integer not null default 0,
      viral_posts_30d integer not null default 0,
      viral_rate numeric(8,4) not null default 0,
      title_structure text,
      cover_structure text,
      script_structure text,
      comment_questions text,
      monetization_path text,
      copyable_points text,
      noncopyable_points text,
      last_collected_at timestamptz,
      analysis_json jsonb not null default '{}'::jsonb,
      created_by text references users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists incubation_content_sample (
      id text primary key,
      platform_id text references incubation_platform(id) on delete set null,
      benchmark_account_id text references incubation_benchmark_account(id) on delete set null,
      track_id text references incubation_track(id) on delete set null,
      title text not null,
      original_url text,
      author_name text,
      publish_time timestamptz,
      collected_at timestamptz not null default now(),
      content_type text not null default 'unknown',
      content_line text,
      keywords jsonb not null default '[]'::jsonb,
      likes integer not null default 0,
      collects integer not null default 0,
      comments integer not null default 0,
      shares integer not null default 0,
      plays integer not null default 0,
      follower_count integer not null default 0,
      interaction_rate numeric(10,6) not null default 0,
      is_low_follower_viral boolean not null default false,
      is_viral boolean not null default false,
      title_structure text,
      hook text,
      cover_type text,
      script_structure text,
      comment_need_summary text,
      copy_level text,
      risk_level text not null default 'medium',
      analysis_json jsonb not null default '{}'::jsonb,
      created_by text references users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists incubation_comment_need (
      id text primary key,
      content_sample_id text references incubation_content_sample(id) on delete set null,
      platform_id text references incubation_platform(id) on delete set null,
      track_id text references incubation_track(id) on delete set null,
      source_account text,
      source_url text,
      comment_text text not null,
      commenter_name text,
      comment_time timestamptz,
      like_count integer not null default 0,
      is_reply boolean not null default false,
      need_type text not null default '共鸣',
      sentiment text not null default 'neutral',
      intent_score numeric(6,2) not null default 0,
      can_convert_topic boolean not null default true,
      can_convert_faq boolean not null default false,
      can_convert_script boolean not null default false,
      cluster_key text,
      created_by text references users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists incubation_topic (
      id text primary key,
      title text not null,
      platform_targets jsonb not null default '[]'::jsonb,
      track_id text references incubation_track(id) on delete set null,
      content_line text,
      target_account text,
      target_audience text,
      pain_point text,
      benchmark_source_id text references incubation_benchmark_account(id) on delete set null,
      content_sample_id text references incubation_content_sample(id) on delete set null,
      comment_need_id text references incubation_comment_need(id) on delete set null,
      hot_source_id text references incubation_information_source(id) on delete set null,
      keywords jsonb not null default '[]'::jsonb,
      content_format text,
      topic_type text not null default 'manual',
      priority text not null default 'B',
      difficulty text not null default 'medium',
      risk_level text not null default 'medium',
      status text not null default 'pending_review',
      owner_id text references users(id) on delete set null,
      deadline timestamptz,
      source_trace jsonb not null default '{}'::jsonb,
      suggestion_reason text,
      created_by text references users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists incubation_owned_account (
      id text primary key,
      name text not null,
      platform_id text references incubation_platform(id) on delete set null,
      account_url text,
      account_type text not null default '知识号',
      track_id text references incubation_track(id) on delete set null,
      content_line text,
      owner_name text,
      stage text not null default '立项',
      follower_count integer not null default 0,
      posts_7d integer not null default 0,
      growth_30d integer not null default 0,
      viral_posts_30d integer not null default 0,
      account_level text not null default 'C',
      risk_status text not null default 'low',
      project_card jsonb not null default '{}'::jsonb,
      notes text,
      created_by text references users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists incubation_material_asset (
      id text primary key,
      name text not null,
      asset_type text not null default '图片',
      file_url text,
      preview_url text,
      source_platform_id text references incubation_platform(id) on delete set null,
      source_url text,
      source_account text,
      uploader_name text,
      track_id text references incubation_track(id) on delete set null,
      owned_account_id text references incubation_owned_account(id) on delete set null,
      tags jsonb not null default '[]'::jsonb,
      is_original boolean not null default false,
      is_commercial_allowed boolean not null default false,
      copyright_status text not null default 'unknown',
      file_hash text,
      similar_asset_ids jsonb not null default '[]'::jsonb,
      risk_level text not null default 'medium',
      notes text,
      created_by text references users(id) on delete set null,
      uploaded_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists incubation_storage_config (
      id text primary key,
      storage_type text not null default 'local',
      local_path text,
      endpoint text,
      bucket text,
      access_key_ref text,
      secret_key_ref text,
      directory_rule text,
      backup_enabled boolean not null default false,
      updated_by text references users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists incubation_export_record (
      id text primary key,
      entity_type text not null,
      format text not null,
      filters jsonb not null default '{}'::jsonb,
      row_count integer not null default 0,
      requested_by text references users(id) on delete set null,
      created_at timestamptz not null default now()
    );

    create table if not exists incubation_suggestion_record (
      id text primary key,
      suggestion_type text not null,
      target_type text not null,
      target_id text,
      input_json jsonb not null default '{}'::jsonb,
      output_json jsonb not null default '{}'::jsonb,
      created_by text references users(id) on delete set null,
      created_at timestamptz not null default now()
    );

    create index if not exists idx_incubation_track_status on incubation_track(status, updated_at desc);
    create index if not exists idx_incubation_keyword_track on incubation_keyword(track_id, status);
    create index if not exists idx_incubation_source_status on incubation_information_source(status, importance);
    create index if not exists idx_incubation_task_status on incubation_task(status, created_at desc);
    create index if not exists idx_incubation_benchmark_track on incubation_benchmark_account(track_id, platform_id);
    create index if not exists idx_incubation_content_track on incubation_content_sample(track_id, platform_id, is_viral);
    create index if not exists idx_incubation_comment_track on incubation_comment_need(track_id, need_type);
    create index if not exists idx_incubation_topic_status on incubation_topic(status, priority, updated_at desc);
    create index if not exists idx_incubation_owned_account_stage on incubation_owned_account(stage, account_level, updated_at desc);
    create index if not exists idx_incubation_material_track on incubation_material_asset(track_id, asset_type, updated_at desc);
  `);

  await seedResearchDefaults(sql);
  await seedIncubationDefaults(sql);
  const contentRepository = new ContentRepository(sql);
  const legacyContentMigrator = new LegacyContentMigrator(sql, contentRepository);
  const migrationReadiness = await legacyContentMigrator.getReadiness();
  if (
    migrationReadiness.legacy_article_count > migrationReadiness.linked_article_count ||
    migrationReadiness.legacy_snapshot_count > migrationReadiness.linked_snapshot_count
  ) {
    await legacyContentMigrator.run();
  }
}
