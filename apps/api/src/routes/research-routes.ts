import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { ResearchService } from "../research/research-service";
import { getBearerToken, requireUser } from "./auth-guard";

function parseArticleIds(raw?: string) {
  return raw
    ? raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : undefined;
}

const LoginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });
const GroupSchema = z.object({ name: z.string().min(1), description: z.string().optional() });
const AccountSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  wechat_id: z.string().optional().nullable(),
  biz_id: z.string().optional().nullable(),
  source_category: z.string().optional().nullable(),
  sub_type: z.string().optional().nullable(),
  group_id: z.string().optional().nullable(),
  entry_url: z.string().optional().nullable(),
  manual_article_urls: z.array(z.string()).optional(),
  priority: z.enum(["A", "B", "C"]).optional(),
  status: z.enum(["active", "paused", "blacklisted"]).optional(),
  notes: z.string().optional().nullable()
});
const AccountBatchSchema = z.object({
  account_ids: z.array(z.string()).min(1),
  status: z.enum(["active", "paused", "blacklisted"]),
  group_id: z.string().optional().nullable()
});
const ImportAccountsSchema = z.object({ content: z.string().min(1) });
const RuleSchema = z.object({
  id: z.string().optional(),
  rule_type: z.enum(["keyword", "risk", "column"]),
  name: z.string().min(1),
  pattern: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "blocked"]),
  status: z.enum(["active", "disabled"]).optional(),
  weight: z.number().int().optional(),
  notes: z.string().optional().nullable()
});
const TagSchema = z.object({
  dimension: z.string().min(1),
  label: z.string().min(1),
  value: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  description: z.string().optional().nullable()
});
const TaskSchema = z.object({
  task_name: z.string().min(1),
  task_type: z.enum([
    "single_account_incremental",
    "multi_account_incremental",
    "batch_incremental",
    "single_article_backfill",
    "history_backfill",
    "failed_retry"
  ]),
  source_ids: z.array(z.string()).default([]),
  target_urls: z.array(z.string()).default([]),
  concurrency: z.number().int().min(1).max(5).default(3),
  months_back: z.number().int().min(1).max(12).optional().nullable()
});
const TaskStatusSchema = z.object({ status: z.enum(["pending", "paused", "cancelled"]) });
const ReviewSchema = z.object({
  usability_level: z.enum(["A", "B", "C", "D"]).optional().nullable(),
  risk_level: z.enum(["low", "medium", "high", "blocked"]).optional().nullable(),
  borrow_dimensions: z.array(z.string()).optional(),
  comment: z.string().optional().nullable(),
  review_status: z.enum(["unreviewed", "reviewed", "needs_compliance"]).optional(),
  tag_ids: z.array(z.string()).optional(),
  content_goal: z.string().optional().nullable()
});
const DeleteArticlesSchema = z.object({ article_ids: z.array(z.string()).min(1) });
const ArticleFilterSchema = z.object({
  article_ids: z.string().optional(),
  keyword: z.string().optional(),
  source_id: z.string().optional(),
  risk_level: z.enum(["low", "medium", "high", "blocked"]).optional(),
  usability_level: z.enum(["A", "B", "C", "D"]).optional(),
  review_status: z.enum(["unreviewed", "reviewed", "needs_compliance"]).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  duplicate: z.enum(["true", "false"]).optional(),
  sort_by: z.enum(["default", "publish_time", "crawl_time", "title", "source_name", "tag_label", "risk_level", "usability_level"]).optional(),
  sort_order: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().optional(),
  offset: z.coerce.number().optional()
});
const ExportFilterSchema = z.object({
  article_ids: z.string().optional(),
  keyword: z.string().optional(),
  source_id: z.string().optional(),
  risk_level: z.enum(["low", "medium", "high", "blocked"]).optional(),
  usability_level: z.enum(["A", "B", "C", "D"]).optional(),
  review_status: z.enum(["unreviewed", "reviewed", "needs_compliance"]).optional(),
  include_fulltext: z.enum(["true", "false"]).optional(),
  include_html: z.enum(["true", "false"]).optional(),
  include_raw_json: z.enum(["true", "false"]).optional(),
  format: z.enum(["csv", "json", "jsonl", "md"]).optional()
});

export async function registerResearchRoutes(app: FastifyInstance, service: ResearchService) {
  app.post("/api/auth/login", async (request, reply) => {
    const body = LoginSchema.parse(request.body);
    const result = await service.login(body.username, body.password);
    if (!result) {
      reply.code(401);
      return { error: "用户名或密码错误" };
    }
    return result;
  });

  app.get("/api/auth/me", async (request, reply) => {
    const user = await requireUser(request, reply, service);
    if (!user) return { error: "未登录" };
    return { user };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const token = getBearerToken(request);
    if (!token) {
      reply.code(204);
      return null;
    }
    await service.logout(token);
    reply.code(204);
    return null;
  });

  app.get("/api/research/groups", async (request, reply) => {
    const user = await requireUser(request, reply, service, "accounts:read");
    if (!user) return { error: "未授权" };
    return { items: await service.repo.listGroups() };
  });

  app.post("/api/research/groups", async (request, reply) => {
    const user = await requireUser(request, reply, service, "accounts:write");
    if (!user) return { error: "未授权" };
    const body = GroupSchema.parse(request.body);
    return { id: await service.repo.createGroup(user, body) };
  });

  app.get("/api/research/accounts", async (request, reply) => {
    const user = await requireUser(request, reply, service, "accounts:read");
    if (!user) return { error: "未授权" };
    return { items: await service.repo.listAccounts() };
  });

  app.post("/api/research/accounts", async (request, reply) => {
    const user = await requireUser(request, reply, service, "accounts:write");
    if (!user) return { error: "未授权" };
    const body = AccountSchema.parse(request.body);
    return { id: await service.repo.upsertAccount(user, body) };
  });

  app.post("/api/research/accounts/import", async (request, reply) => {
    const user = await requireUser(request, reply, service, "accounts:write");
    if (!user) return { error: "未授权" };
    const body = ImportAccountsSchema.parse(request.body);
    return service.importAccountsFromCsv(user, body.content);
  });

  app.post("/api/research/accounts/batch-status", async (request, reply) => {
    const user = await requireUser(request, reply, service, "accounts:write");
    if (!user) return { error: "未授权" };
    const body = AccountBatchSchema.parse(request.body);
    await service.repo.batchUpdateAccountStatus(user, body.account_ids, body.status, body.group_id);
    return { ok: true };
  });

  app.get("/api/research/rules", async (request, reply) => {
    const user = await requireUser(request, reply, service, "rules:read");
    if (!user) return { error: "未授权" };
    return { items: await service.repo.listRules() };
  });

  app.post("/api/research/rules", async (request, reply) => {
    const user = await requireUser(request, reply, service, "rules:write");
    if (!user) return { error: "未授权" };
    const body = RuleSchema.parse(request.body);
    return { id: await service.repo.upsertRule(user, body) };
  });

  app.get("/api/research/tags", async (request, reply) => {
    const user = await requireUser(request, reply, service, "articles:read");
    if (!user) return { error: "未授权" };
    return { items: await service.repo.listTags() };
  });

  app.post("/api/research/tags", async (request, reply) => {
    const user = await requireUser(request, reply, service, "articles:review");
    if (!user) return { error: "未授权" };
    const body = TagSchema.parse(request.body);
    return { id: await service.repo.createTag(user, body) };
  });

  app.get("/api/research/tasks", async (request, reply) => {
    const user = await requireUser(request, reply, service, "tasks:read");
    if (!user) return { error: "未授权" };
    return { items: await service.repo.listTasks() };
  });

  app.get("/api/research/system-status", async (request, reply) => {
    const user = await requireUser(request, reply, service, "tasks:read");
    if (!user) return { error: "未授权" };
    return await service.repo.getSystemStatus();
  });

  app.post("/api/research/tasks", async (request, reply) => {
    const user = await requireUser(request, reply, service, "tasks:write");
    if (!user) return { error: "未授权" };
    const body = TaskSchema.parse(request.body);
    return { id: await service.repo.createTask(user, body) };
  });

  app.get("/api/research/tasks/:id/items", async (request, reply) => {
    const user = await requireUser(request, reply, service, "tasks:read");
    if (!user) return { error: "未授权" };
    const params = z.object({ id: z.string() }).parse(request.params);
    return { items: await service.repo.listTaskItems(params.id) };
  });

  app.post("/api/research/tasks/:id/status", async (request, reply) => {
    const user = await requireUser(request, reply, service, "tasks:write");
    if (!user) return { error: "未授权" };
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = TaskStatusSchema.parse(request.body);
    await service.repo.updateTaskStatus(user, params.id, body.status);
    return { ok: true };
  });

  app.post("/api/research/tasks/:id/retry-failed", async (request, reply) => {
    const user = await requireUser(request, reply, service, "tasks:write");
    if (!user) return { error: "未授权" };
    const params = z.object({ id: z.string() }).parse(request.params);
    const retryTaskId = await service.repo.createRetryTask(user, params.id);
    if (!retryTaskId) {
      reply.code(400);
      return { error: "该任务没有失败项可重跑" };
    }
    return { id: retryTaskId };
  });

  app.delete("/api/research/tasks/:id", async (request, reply) => {
    const user = await requireUser(request, reply, service, "tasks:write");
    if (!user) return { error: "未授权" };
    const params = z.object({ id: z.string() }).parse(request.params);
    await service.repo.deleteTask(user, params.id);
    return { ok: true };
  });

  app.get("/api/research/articles", async (request, reply) => {
    const user = await requireUser(request, reply, service, "articles:read");
    if (!user) return { error: "未授权" };
    const query = ArticleFilterSchema.parse(request.query);
    const articleIds = parseArticleIds(query.article_ids);
    const filters = { ...query, article_ids: articleIds, duplicate: query.duplicate ? query.duplicate === "true" : undefined };
    return {
      total: await service.repo.countArticles(filters),
      items: await service.repo.listArticles(filters),
      limit: query.limit ?? 50,
      offset: query.offset ?? 0
    };
  });

  app.get("/api/research/articles/:id", async (request, reply) => {
    const user = await requireUser(request, reply, service, "articles:read");
    if (!user) return { error: "未授权" };
    const params = z.object({ id: z.string() }).parse(request.params);
    const detail = await service.repo.getArticleDetail(params.id);
    if (!detail) {
      reply.code(404);
      return { error: "文章不存在" };
    }

    const article = { ...detail.article, content_html: undefined, content_text: undefined, raw_json: undefined };
    return { ...detail, article };
  });

  app.get("/api/research/articles/:id/fulltext", async (request, reply) => {
    const user = await requireUser(request, reply, service, "articles:fulltext");
    if (!user) return { error: "未授权" };
    const params = z.object({ id: z.string() }).parse(request.params);
    const detail = await service.repo.getArticleDetail(params.id);
    if (!detail) {
      reply.code(404);
      return { error: "文章不存在" };
    }
    await service.repo.recordFulltextView(user, params.id);
    return { content_html: detail.article.content_html, content_text: detail.article.content_text, raw_json: detail.article.raw_json };
  });

  app.post("/api/research/articles/:id/review", async (request, reply) => {
    const user = await requireUser(request, reply, service, "articles:review");
    if (!user) return { error: "未授权" };
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = ReviewSchema.parse(request.body);
    if (body.risk_level && !user.roles.some((role) => role === "admin" || role === "compliance")) {
      reply.code(403);
      return { error: "只有管理员和合规可以修改风险等级" };
    }
    return { id: await service.repo.saveArticleReview(user, params.id, body) };
  });

  app.post("/api/research/articles/batch-delete", async (request, reply) => {
    const user = await requireUser(request, reply, service, "articles:manage");
    if (!user) return { error: "未授权" };
    const body = DeleteArticlesSchema.parse(request.body);
    return await service.repo.deleteArticles(user, body.article_ids);
  });

  app.get("/api/research/dashboard", async (request, reply) => {
    const user = await requireUser(request, reply, service, "dashboard:read");
    if (!user) return { error: "未授权" };
    return await service.repo.getDashboardSummary();
  });

  app.get("/api/research/logs", async (request, reply) => {
    const user = await requireUser(request, reply, service, "logs:read");
    if (!user) return { error: "未授权" };
    return { items: await service.repo.listOperationLogs() };
  });

  app.get("/api/research/export/articles.csv", async (request, reply) => {
    const user = await requireUser(request, reply, service, "exports:write");
    if (!user) return { error: "未授权" };
    const query = ExportFilterSchema.parse(request.query);
    const result = await service.exportArticles(
      user,
      { ...query, article_ids: parseArticleIds(query.article_ids) },
      { format: "csv", include_fulltext: query.include_fulltext !== "false", include_html: query.include_html === "true", include_raw_json: query.include_raw_json === "true" }
    );
    reply.header("content-type", result.contentType);
    reply.header("content-disposition", `attachment; filename="${result.filename}"`);
    return result.content;
  });

  app.get("/api/research/export/articles", async (request, reply) => {
    const user = await requireUser(request, reply, service, "exports:write");
    if (!user) return { error: "未授权" };
    const query = ExportFilterSchema.extend({ format: z.enum(["csv", "json", "jsonl", "md"]).default("jsonl") }).parse(request.query);
    const result = await service.exportArticles(
      user,
      { ...query, article_ids: parseArticleIds(query.article_ids) },
      { format: query.format, include_fulltext: query.include_fulltext !== "false", include_html: query.include_html === "true", include_raw_json: query.include_raw_json === "true" }
    );
    reply.header("content-type", result.contentType);
    reply.header("content-disposition", `attachment; filename="${result.filename}"`);
    return result.content;
  });
}
