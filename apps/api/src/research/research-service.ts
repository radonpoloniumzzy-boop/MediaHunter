import { verifyPassword, createSessionToken } from "./auth-utils";
import { hasPermission, type Permission } from "./permissions";
import { evaluateRules } from "./risk-engine";
import { detectFetchFailure, extractArticleLinksFromHtml, hashContent, parseWeChatArticleHtml } from "./wechat-parser";
import type { AppEnv } from "../env";
import type { AuthUser, ArticleListFilters } from "./types";
import { ResearchRepository, type TaskItemClaim } from "./research-repository";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function csvEscape(value: unknown): string {
  const normalized = String(value ?? "");
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function normalizePlainText(value: unknown): string {
  return String(value ?? "").replace(/\r?\n/g, "\n").trim();
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function pickMetric(raw: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return Number((numerator / denominator).toFixed(6));
}

function classifyError(message: string): "network" | "page" | "parse" | "restricted" | "deleted" | "config" {
  if (message.includes("配置")) return "config";
  if (message.includes("访问受限")) return "restricted";
  if (message.includes("内容删除")) return "deleted";
  if (message.includes("解析")) return "parse";
  if (message.includes("页面失效")) return "page";
  return "network";
}

type ExportFormat = "csv" | "json" | "jsonl" | "md";

type ExportRecord = {
  article_id: string;
  source_id: string | null;
  source_name: string | null;
  title: string;
  article_url: string;
  publish_time: string | null;
  crawl_time: string | null;
  author: string | null;
  summary: string | null;
  cover_url: string | null;
  risk_level: string | null;
  usability_level: string | null;
  review_status: string | null;
  column_type: string | null;
  content_goal: string | null;
  title_pattern: string | null;
  snapshot_version: number;
  is_duplicate: boolean;
  has_video: boolean;
  has_audio: boolean;
  content_hash: string | null;
  image_count: number;
  image_urls: string[];
  tag_labels: string[];
  tag_pairs: string[];
  borrow_dimensions: string[];
  rule_hits: Array<{
    rule_name: string;
    rule_type: string;
    severity: string;
    location: string;
    hit_text: string;
    hit_count: number;
  }>;
  content_text?: string;
  content_html?: string;
  raw_json?: Record<string, unknown>;
  interaction_metrics: {
    read_count: number | null;
    like_count: number | null;
    share_count: number | null;
    comment_count: number | null;
    wow_count: number | null;
    like_rate: number | null;
    share_rate: number | null;
    comment_rate: number | null;
    wow_rate: number | null;
  };
};

export class ResearchService {
  constructor(
    public readonly repo: ResearchRepository,
    private readonly env: AppEnv
  ) {}

  async login(username: string, password: string) {
    const user = await this.repo.getUserByUsername(username);
    if (!user || user.status !== "active" || !user.password_hash || !verifyPassword(password, user.password_hash)) {
      return null;
    }

    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
    await this.repo.createSession(user.id, token, expiresAt);

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        roles: user.roles,
        status: user.status
      }
    };
  }

  async currentUserFromToken(token: string | null) {
    if (!token) return null;
    return this.repo.getUserBySessionToken(token);
  }

  assertPermission(user: AuthUser, permission: Permission) {
    if (!hasPermission(user.roles, permission)) {
      throw new Error("FORBIDDEN");
    }
  }

  async logout(token: string) {
    await this.repo.deleteSession(token);
  }

  async importAccountsFromCsv(user: AuthUser, content: string) {
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return { imported: 0 };

    const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
    const groups = await this.repo.listGroups();
    const groupByName = new Map(groups.map((group) => [String(group.name), String(group.id)]));

    let imported = 0;
    for (const line of lines.slice(1)) {
      const cells = parseCsvLine(line);
      const record = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));

      let groupId: string | null = null;
      const groupName = record.group_name?.trim();
      if (groupName) {
        groupId = groupByName.get(groupName) ?? null;
        if (!groupId) {
          groupId = await this.repo.createGroup(user, { name: groupName });
          groupByName.set(groupName, groupId);
        }
      }

      await this.repo.upsertAccount(user, {
        name: record.name || record.account_name,
        wechat_id: record.wechat_id || null,
        biz_id: record.biz_id || null,
        source_category: record.source_category || null,
        sub_type: record.sub_type || null,
        group_id: groupId,
        entry_url: record.entry_url || null,
        manual_article_urls: (record.manual_article_urls || "")
          .split(/\s+/)
          .map((item) => item.trim())
          .filter(Boolean),
        priority: record.priority || "B",
        status: record.status || "active",
        notes: record.notes || null
      });
      imported += 1;
    }

    return { imported };
  }

  private buildExportRows(
    rows: Record<string, unknown>[],
    options: { include_fulltext: boolean; include_html: boolean; include_raw_json: boolean }
  ): ExportRecord[] {
    return rows.map((row) => {
      const rawJson = readRecord(row.raw_json);
      const interaction = readRecord(rawJson.interaction);

      const readCount =
        pickMetric(interaction, ["read_count", "readCount", "view_count", "views"]) ??
        pickMetric(rawJson, ["read_count", "readCount", "view_count", "views"]);
      const likeCount =
        pickMetric(interaction, ["like_count", "likeCount", "old_like_num", "praise_num"]) ??
        pickMetric(rawJson, ["like_count", "likeCount", "old_like_num", "praise_num"]);
      const shareCount =
        pickMetric(interaction, ["share_count", "shareCount", "forward_count", "repost_count"]) ??
        pickMetric(rawJson, ["share_count", "shareCount", "forward_count", "repost_count"]);
      const commentCount =
        pickMetric(interaction, ["comment_count", "commentCount", "comment_num"]) ??
        pickMetric(rawJson, ["comment_count", "commentCount", "comment_num"]);
      const wowCount =
        pickMetric(interaction, ["wow_count", "wowCount", "looking_count"]) ??
        pickMetric(rawJson, ["wow_count", "wowCount", "looking_count"]);

      const tags = Array.isArray(row.tags) ? (row.tags as Array<Record<string, unknown>>) : [];
      const hits = Array.isArray(row.hits) ? (row.hits as Array<Record<string, unknown>>) : [];
      const borrowDimensions = Array.isArray(row.borrow_dimensions) ? (row.borrow_dimensions as unknown[]) : [];
      const images = Array.isArray(row.images) ? (row.images as unknown[]) : [];

      return {
        article_id: String(row.id ?? ""),
        source_id: row.source_id ? String(row.source_id) : null,
        source_name: row.source_name ? String(row.source_name) : null,
        title: String(row.title ?? ""),
        article_url: String(row.article_url ?? ""),
        publish_time: row.publish_time ? String(row.publish_time) : null,
        crawl_time: row.crawl_time ? String(row.crawl_time) : null,
        author: row.author ? String(row.author) : null,
        summary: row.summary ? String(row.summary) : null,
        cover_url: row.cover_url ? String(row.cover_url) : null,
        risk_level: row.risk_level ? String(row.risk_level) : null,
        usability_level: row.usability_level ? String(row.usability_level) : null,
        review_status: row.review_status ? String(row.review_status) : null,
        column_type: row.column_type ? String(row.column_type) : null,
        content_goal: row.content_goal ? String(row.content_goal) : null,
        title_pattern: row.title_pattern ? String(row.title_pattern) : null,
        snapshot_version: Number(row.snapshot_version ?? 0),
        is_duplicate: Boolean(row.is_duplicate),
        has_video: Boolean(row.has_video),
        has_audio: Boolean(row.has_audio),
        content_hash: row.content_hash ? String(row.content_hash) : null,
        image_count: images.length,
        image_urls: images.map((item) => String(item)),
        tag_labels: tags.map((tag) => String(tag.label ?? "")).filter(Boolean),
        tag_pairs: tags.map((tag) => `${String(tag.dimension ?? "")}:${String(tag.value ?? "")}`),
        borrow_dimensions: borrowDimensions.map((item) => String(item)).filter(Boolean),
        rule_hits: hits.map((hit) => ({
          rule_name: String(hit.rule_name ?? ""),
          rule_type: String(hit.rule_type ?? ""),
          severity: String(hit.severity ?? ""),
          location: String(hit.location ?? ""),
          hit_text: String(hit.hit_text ?? ""),
          hit_count: Number(hit.hit_count ?? 0)
        })),
        content_text: options.include_fulltext ? normalizePlainText(row.content_text) : undefined,
        content_html: options.include_html ? String(row.content_html ?? "") : undefined,
        raw_json: options.include_raw_json ? rawJson : undefined,
        interaction_metrics: {
          read_count: readCount,
          like_count: likeCount,
          share_count: shareCount,
          comment_count: commentCount,
          wow_count: wowCount,
          like_rate: ratio(likeCount, readCount),
          share_rate: ratio(shareCount, readCount),
          comment_rate: ratio(commentCount, readCount),
          wow_rate: ratio(wowCount, readCount)
        }
      };
    });
  }

  async exportArticles(
    user: AuthUser,
    filters: ArticleListFilters,
    options: {
      format: ExportFormat;
      include_fulltext: boolean;
      include_html: boolean;
      include_raw_json: boolean;
    }
  ) {
    const rows = await this.repo.listArticlesForExport({
      ...filters,
      limit: Math.min(filters.limit ?? 500, 1000),
      offset: 0
    });
    const records = this.buildExportRows(rows, options);

    let content = "";
    let contentType = "text/plain; charset=utf-8";
    let extension = options.format;

    if (options.format === "csv") {
      const header = [
        "article_id",
        "source_name",
        "title",
        "article_url",
        "publish_time",
        "crawl_time",
        "author",
        "risk_level",
        "usability_level",
        "review_status",
        "column_type",
        "content_goal",
        "snapshot_version",
        "is_duplicate",
        "image_count",
        "read_count",
        "like_count",
        "share_count",
        "comment_count",
        "wow_count",
        "like_rate",
        "share_rate",
        "comment_rate",
        "wow_rate",
        "tag_labels",
        "borrow_dimensions",
        "rule_hit_summary",
        "summary",
        "content_text"
      ];
      const lines = [header.join(",")];
      for (const record of records) {
        lines.push(
          [
            csvEscape(record.article_id),
            csvEscape(record.source_name),
            csvEscape(record.title),
            csvEscape(record.article_url),
            csvEscape(record.publish_time),
            csvEscape(record.crawl_time),
            csvEscape(record.author),
            csvEscape(record.risk_level),
            csvEscape(record.usability_level),
            csvEscape(record.review_status),
            csvEscape(record.column_type),
            csvEscape(record.content_goal),
            csvEscape(record.snapshot_version),
            csvEscape(record.is_duplicate),
            csvEscape(record.image_count),
            csvEscape(record.interaction_metrics.read_count),
            csvEscape(record.interaction_metrics.like_count),
            csvEscape(record.interaction_metrics.share_count),
            csvEscape(record.interaction_metrics.comment_count),
            csvEscape(record.interaction_metrics.wow_count),
            csvEscape(record.interaction_metrics.like_rate),
            csvEscape(record.interaction_metrics.share_rate),
            csvEscape(record.interaction_metrics.comment_rate),
            csvEscape(record.interaction_metrics.wow_rate),
            csvEscape(record.tag_labels.join(" | ")),
            csvEscape(record.borrow_dimensions.join(" | ")),
            csvEscape(record.rule_hits.map((hit) => `${hit.rule_name}(${hit.location}:${hit.hit_count})`).join(" | ")),
            csvEscape(record.summary),
            csvEscape(record.content_text ?? "")
          ].join(",")
        );
      }
      content = lines.join("\n");
      contentType = "text/csv; charset=utf-8";
      extension = "csv";
    } else if (options.format === "json") {
      content = JSON.stringify(records, null, 2);
      contentType = "application/json; charset=utf-8";
      extension = "json";
    } else if (options.format === "jsonl") {
      content = records.map((record) => JSON.stringify(record)).join("\n");
      contentType = "application/x-ndjson; charset=utf-8";
      extension = "jsonl";
    } else {
      content = records
        .map((record, index) => {
          const metadata = [
            `# ${index + 1}. ${record.title}`,
            "",
            `- 来源账号: ${record.source_name ?? "-"}`,
            `- 发布时间: ${record.publish_time ?? "-"}`,
            `- 风险等级: ${record.risk_level ?? "-"}`,
            `- 可用性: ${record.usability_level ?? "-"}`,
            `- 栏目分类: ${record.column_type ?? "-"}`,
            `- 原文链接: ${record.article_url}`,
            `- 互动数据: 阅读 ${record.interaction_metrics.read_count ?? "-"} / 点赞 ${record.interaction_metrics.like_count ?? "-"} / 转发 ${record.interaction_metrics.share_count ?? "-"} / 留言 ${record.interaction_metrics.comment_count ?? "-"}`,
            `- 互动比例: 点赞率 ${record.interaction_metrics.like_rate ?? "-"} / 转发率 ${record.interaction_metrics.share_rate ?? "-"} / 留言率 ${record.interaction_metrics.comment_rate ?? "-"}`,
            `- 标签: ${record.tag_labels.join(" | ") || "-"}`,
            `- 借鉴维度: ${record.borrow_dimensions.join(" | ") || "-"}`,
            ""
          ];
          const hitLines = record.rule_hits.length
            ? ["## 规则命中", "", ...record.rule_hits.map((hit) => `- ${hit.rule_name} [${hit.severity}] ${hit.location} x${hit.hit_count}`), ""]
            : [];
          const bodyLines = ["## 摘要", "", record.summary || "-", "", "## 正文", "", record.content_text || "-", ""];
          return [...metadata, ...hitLines, ...bodyLines].join("\n");
        })
        .join("\n---\n\n");
      contentType = "text/markdown; charset=utf-8";
      extension = "md";
    }

    await this.repo.createExportRecord(
      user,
      options.format,
      {
        ...filters,
        include_fulltext: options.include_fulltext,
        include_html: options.include_html,
        include_raw_json: options.include_raw_json
      },
      records.length
    );

    return {
      content,
      contentType,
      filename: `wechat-articles-export-${new Date().toISOString().slice(0, 10)}.${extension}`,
      articleCount: records.length
    };
  }

  async exportArticlesAsCsv(user: AuthUser, filters: ArticleListFilters) {
    const result = await this.exportArticles(user, filters, {
      format: "csv",
      include_fulltext: true,
      include_html: false,
      include_raw_json: false
    });
    return result.content;
  }

  private async fetchHtml(url: string) {
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36"
      }
    });
    const html = await response.text();
    return {
      status: response.status,
      html
    };
  }

  async processClaimedTaskItem(claim: TaskItemClaim) {
    const activeRules = (await this.repo.getActiveRules()).map((row) => ({
      id: String(row.id),
      rule_type: row.rule_type as "keyword" | "risk" | "column",
      pattern: String(row.pattern),
      severity: row.severity as "low" | "medium" | "high" | "blocked"
    }));

    const urls = new Set<string>();
    if (claim.target_url) {
      urls.add(claim.target_url);
    }

    if (claim.entry_url) {
      const entry = await this.fetchHtml(claim.entry_url);
      const entryFailure = detectFetchFailure(entry.html, entry.status);
      if (entryFailure) {
        throw new Error(entryFailure === "解析失败" ? "页面失效" : entryFailure);
      }
      for (const link of extractArticleLinksFromHtml(entry.html, claim.entry_url)) {
        urls.add(link);
      }
    }

    for (const link of claim.manual_article_urls) {
      urls.add(link);
    }

    if (!urls.size) {
      throw new Error("配置缺失：该账号缺少公开入口或手工文章链接");
    }

    const cutoff =
      claim.months_back && claim.months_back > 0 ? new Date(Date.now() - claim.months_back * 30 * 24 * 60 * 60 * 1000) : null;

    let articleCount = 0;
    let storedCount = 0;

    for (const url of urls) {
      await sleep(800 + Math.floor(Math.random() * 700));
      const page = await this.fetchHtml(url);
      const failure = detectFetchFailure(page.html, page.status);
      if (failure) {
        throw new Error(failure);
      }
      const snapshot = parseWeChatArticleHtml(page.html, url);
      if (cutoff && snapshot.publish_time) {
        const publishTime = new Date(snapshot.publish_time);
        if (!Number.isNaN(publishTime.getTime()) && publishTime < cutoff) {
          articleCount += 1;
          continue;
        }
      }

      const { hits, riskLevel, columnType } = evaluateRules(snapshot.title, snapshot.content_text, activeRules);
      const contentHash = hashContent(`${snapshot.title}\n${snapshot.content_text}`);
      await this.repo.upsertArticleRecord({
        source_id: claim.source_id,
        source_name: claim.account_name,
        source_category: null,
        article_url: url,
        snapshot,
        content_hash: contentHash,
        risk_level: riskLevel,
        column_type: columnType,
        hits
      });
      articleCount += 1;
      storedCount += 1;
    }

    return {
      discovered_count: urls.size,
      article_count: storedCount,
      scanned_count: articleCount
    };
  }

  async runWorkerLoop() {
    const active = new Map<string, Promise<void>>();
    const activeSourceIds = new Set<string>();
    const maxConcurrency = Math.max(this.env.COLLECTOR_GLOBAL_CONCURRENCY, 1);

    while (true) {
      await this.repo.recordWorkerHeartbeat("collector", {
        status: "online",
        process_id: process.pid,
        detail: {
          active_count: active.size,
          concurrency: maxConcurrency
        }
      });

      while (active.size < maxConcurrency) {
        const claim = await this.repo.claimNextTaskItem([...activeSourceIds]);
        if (!claim) break;

        if (claim.source_id) activeSourceIds.add(claim.source_id);
        const runner = this.handleClaim(claim)
          .catch(() => undefined)
          .finally(() => {
            active.delete(claim.id);
            if (claim.source_id) activeSourceIds.delete(claim.source_id);
          });
        active.set(claim.id, runner);
      }

      if (!active.size) {
        await sleep(this.env.COLLECTOR_POLL_INTERVAL_MS);
        continue;
      }

      await Promise.race(active.values());
    }
  }

  private async handleClaim(claim: TaskItemClaim) {
    try {
      const result = await this.processClaimedTaskItem(claim);
      await this.repo.markItemSuccess(claim.id, result.article_count, result.discovered_count, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "网络失败";
      const type = classifyError(message);
      const shouldRetry = type === "network" || type === "page";
      const backoffSeconds = Math.min(30 * Math.pow(2, claim.retry_count), 300);
      await this.repo.markItemFailure(claim.id, message, shouldRetry && claim.retry_count < 3, backoffSeconds);
    }
  }
}
