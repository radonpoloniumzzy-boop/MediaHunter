import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { RequirementDoc, WorkflowResult } from "@lan-ting/workflow";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApplication, type ApplicationRuntime } from "../../apps/api/src/application";
import type {
  AnalysisWorkflowAdapter,
  FetchedPage,
  PublicWebAdapter
} from "../../apps/api/src/external-adapters";
import type { TaskItemClaim } from "../../apps/api/src/research/research-repository";

const ARTICLE_URL = "https://mp.weixin.qq.com/s?__biz=test&mid=1";
const COLLECTED_ARTICLE_URL = "https://mp.weixin.qq.com/s?__biz=test&mid=collected";
const TRACKED_ARTICLE_URL = "https://mp.weixin.qq.com/s?scene=9&mid=1&__biz=test";
const FORBIDDEN_URL = "https://mp.weixin.qq.com/s?__biz=test&mid=403";
const INVALID_URL = "https://mp.weixin.qq.com/s?__biz=test&mid=invalid";
const PARTIAL_URL = "https://mp.weixin.qq.com/s?__biz=test&mid=partial";
const SECOND_SHARED_ARTICLE_URL = "https://mp.weixin.qq.com/s?__biz=test&mid=second-shared";

const ARTICLE_HTML = `
<!doctype html>
<html>
  <head>
    <meta property="og:title" content="A deterministic research article">
    <meta property="og:description" content="Integration fixture summary">
    <meta property="og:image" content="https://example.com/cover.jpg">
  </head>
  <body>
    <script>var ct = "1714550400"; var nickname = "Fixture Account";</script>
    <div id="js_content"><p>Fixture article body for persistence.</p><img data-src="https://example.com/inline.jpg"></div>
    <script>var end = true;</script>
  </body>
</html>`;

function createWorkflowResult(requirement: RequirementDoc): WorkflowResult {
  return {
    status: "pending_review",
    requirement,
    research: {
      query_plan: [requirement.topic],
      sources: [],
      citations: [],
      coverage_gaps: []
    },
    draft: {
      headline: "Deterministic draft",
      deck: "Test deck",
      body_markdown: "Test body",
      key_points: ["Test point"],
      citation_map: [],
      fact_check_flags: []
    },
    publishable: {
      title_candidates: ["Deterministic draft"],
      final_title: "Deterministic draft",
      lead_hook: "Test hook",
      body_markdown: "Test body",
      quote_cards: [],
      summary_card: "Test summary",
      tags: ["integration"],
      review_status: "pending_review"
    }
  };
}

class DeterministicWorkflowAdapter implements AnalysisWorkflowAdapter {
  readonly requirements: RequirementDoc[] = [];

  async run(requirement: RequirementDoc) {
    this.requirements.push(requirement);
    return createWorkflowResult(requirement);
  }
}

class DeterministicPublicWebAdapter implements PublicWebAdapter {
  readonly responses = new Map<string, FetchedPage>();
  readonly requestedUrls: string[] = [];

  async fetchPage(url: string) {
    this.requestedUrls.push(url);
    const response = this.responses.get(url);
    if (!response) throw new Error(`Unexpected public web request: ${url}`);
    return response;
  }
}

describe("MediaHunter application", () => {
  let container: StartedPostgreSqlContainer;
  let runtime: ApplicationRuntime;
  let token: string;
  const workflow = new DeterministicWorkflowAdapter();
  const publicWeb = new DeterministicPublicWebAdapter();

  beforeAll(async () => {
    publicWeb.responses.set(ARTICLE_URL, { status: 200, html: ARTICLE_HTML, finalUrl: ARTICLE_URL });
    publicWeb.responses.set(COLLECTED_ARTICLE_URL, {
      status: 200,
      html: ARTICLE_HTML,
      finalUrl: COLLECTED_ARTICLE_URL
    });
    publicWeb.responses.set(TRACKED_ARTICLE_URL, { status: 200, html: ARTICLE_HTML, finalUrl: TRACKED_ARTICLE_URL });
    publicWeb.responses.set(FORBIDDEN_URL, { status: 403, html: "Forbidden", finalUrl: FORBIDDEN_URL });
    publicWeb.responses.set(INVALID_URL, { status: 200, html: "<html>invalid</html>", finalUrl: INVALID_URL });
    publicWeb.responses.set(PARTIAL_URL, { status: 200, html: ARTICLE_HTML, finalUrl: PARTIAL_URL });
    publicWeb.responses.set(SECOND_SHARED_ARTICLE_URL, {
      status: 200,
      html: ARTICLE_HTML.replace("A deterministic research article", "A second shared article"),
      finalUrl: SECOND_SHARED_ARTICLE_URL
    });

    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("mediahunter_test")
      .withStartupTimeout(120_000)
      .start();
    runtime = await createApplication({
      env: {
        DATABASE_URL: container.getConnectionUri(),
        API_PORT: 0,
        COLLECTOR_POLL_INTERVAL_MS: 10,
        COLLECTOR_GLOBAL_CONCURRENCY: 1
      },
      adapters: { analysisWorkflow: workflow, publicWeb },
      logger: false
    });

    const login = await runtime.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "Changeme123!" }
    });
    token = login.json<{ token: string }>().token;
  }, 150_000);

  afterAll(async () => {
    await runtime?.close();
    await container?.stop();
  });

  async function createAndClaimTask(targetUrl: string): Promise<TaskItemClaim> {
    const created = await runtime.app.inject({
      method: "POST",
      url: "/api/research/tasks",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        task_name: `fixture-${targetUrl}`,
        task_type: "single_article_backfill",
        source_ids: [],
        target_urls: [targetUrl],
        concurrency: 1
      }
    });
    expect(created.statusCode).toBe(200);

    const claim = await runtime.services.research.repo.claimNextTaskItem([]);
    expect(claim).not.toBeNull();
    return claim!;
  }

  async function createReadyProject() {
    const created = await runtime.app.inject({
      method: "POST",
      url: "/api/research-projects",
      headers: { authorization: `Bearer ${token}` },
      payload: { raw_request: "为新产品建立公众号研究项目，提升目标客户的品牌认知。" }
    });
    const body = created.json<{
      project: { id: string };
      brief: { open_questions: Array<{ key: "change_event" | "target_audience" | "communication_goal" }> };
    }>();
    for (const question of body.brief.open_questions) {
      await runtime.app.inject({
        method: "POST",
        url: `/api/research-projects/${body.project.id}/answers`,
        headers: { authorization: `Bearer ${token}` },
        payload: { question_key: question.key, answer: `已确认的${question.key}` }
      });
    }
    await runtime.app.inject({
      method: "POST",
      url: `/api/research-projects/${body.project.id}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: {}
    });
    await runtime.app.inject({
      method: "POST",
      url: `/api/research-projects/${body.project.id}/start`,
      headers: { authorization: `Bearer ${token}` }
    });
    return body.project.id;
  }

  async function runClaim(claim: TaskItemClaim) {
    const service = runtime.services.research as unknown as {
      handleClaim(item: TaskItemClaim): Promise<void>;
    };
    await service.handleClaim(claim);
  }

  it("serves requests without listening on a network port", async () => {
    const response = await runtime.app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(runtime.app.server.listening).toBe(false);
  });

  it("authenticates a seeded user and persists account changes", async () => {
    const unauthorized = await runtime.app.inject({ method: "GET", url: "/api/research/accounts" });
    expect(unauthorized.statusCode).toBe(401);

    const me = await runtime.app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(me.statusCode).toBe(200);
    expect(me.json<{ user: { username: string } }>().user.username).toBe("admin");

    const created = await runtime.app.inject({
      method: "POST",
      url: "/api/research/accounts",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Integration Account", priority: "A" }
    });
    expect(created.statusCode).toBe(200);

    const accounts = await runtime.app.inject({
      method: "GET",
      url: "/api/research/accounts",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(accounts.statusCode).toBe(200);
    expect(accounts.json<{ items: Array<{ name: string }> }>().items.map((item) => item.name)).toContain("Integration Account");
  });

  it("runs an injected AI workflow through chat and persists its result", async () => {
    const created = await runtime.app.inject({ method: "POST", url: "/api/chat/sessions", payload: { title: "AI fixture" } });
    const sessionId = created.json<{ session: { id: string } }>().session.id;

    await runtime.app.inject({
      method: "POST",
      url: `/api/chat/sessions/${sessionId}/messages`,
      payload: { content: "Write a deep finance article about quantitative funds for public account readers." }
    });
    const completed = await runtime.app.inject({
      method: "POST",
      url: `/api/chat/sessions/${sessionId}/messages`,
      payload: { content: "Use the defaults for any remaining details." }
    });

    expect(completed.statusCode).toBe(201);
    const body = completed.json<{ requestId: string; workflowStatus: string }>();
    expect(body.requestId).toBeTruthy();
    expect(body.workflowStatus).toBe("pending_review");
    expect(workflow.requirements).toHaveLength(1);

    const request = await runtime.app.inject({ method: "GET", url: `/api/requests/${body.requestId}` });
    expect(request.json<{ request: { status: string } }>().request.status).toBe("pending_review");
    const queue = await runtime.app.inject({ method: "GET", url: "/api/publish-queue" });
    expect(queue.json<{ items: Array<{ request_id: string }> }>().items.map((item) => item.request_id)).toContain(body.requestId);

    const retried = await runtime.app.inject({ method: "POST", url: `/api/workflows/${body.requestId}/retry` });
    expect(retried.statusCode).toBe(200);
    expect(retried.json<{ workflow: { status: string } }>().workflow.status).toBe("pending_review");
    expect(workflow.requirements).toHaveLength(2);
    expect(workflow.requirements[1]?.request_id).toBe(body.requestId);
  });

  it("collects and persists an article through the injected public web adapter", async () => {
    const claim = await createAndClaimTask(COLLECTED_ARTICLE_URL);
    await runClaim(claim);

    const items = await runtime.services.research.repo.listTaskItems(claim.task_id);
    expect(items[0]?.status).toBe("success");
    expect(publicWeb.requestedUrls).toContain(COLLECTED_ARTICLE_URL);

    const articles = await runtime.app.inject({
      method: "GET",
      url: "/api/research/articles",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(articles.statusCode).toBe(200);
    expect(articles.json<{ items: Array<{ title: string }> }>().items.map((item) => item.title)).toContain(
      "A deterministic research article"
    );
  });

  it("creates idempotent shared content facts and versions changed content", async () => {
    const submit = () =>
      runtime.app.inject({
        method: "POST",
        url: "/api/content/articles/submit",
        headers: { authorization: `Bearer ${token}` },
        payload: { url: ARTICLE_URL }
      });

    const first = await submit();
    expect(first.statusCode).toBe(201);
    const firstBody = first.json<{
      article: { id: string; canonical_url: string };
      snapshot: { version: number };
      created: boolean;
      snapshot_created: boolean;
    }>();
    expect(firstBody.created).toBe(true);
    expect(firstBody.snapshot_created).toBe(true);
    expect(firstBody.snapshot.version).toBe(1);

    const repeatedResponses = await Promise.all([submit(), submit()]);
    for (const repeated of repeatedResponses) {
      expect(repeated.statusCode).toBe(200);
      const repeatedBody = repeated.json<typeof firstBody>();
      expect(repeatedBody.article.id).toBe(firstBody.article.id);
      expect(repeatedBody.snapshot.version).toBe(1);
      expect(repeatedBody.snapshot_created).toBe(false);
    }

    const tracked = await runtime.app.inject({
      method: "POST",
      url: "/api/content/articles/submit",
      headers: { authorization: `Bearer ${token}` },
      payload: { url: TRACKED_ARTICLE_URL }
    });
    expect(tracked.statusCode).toBe(200);
    expect(tracked.json<typeof firstBody>().article.id).toBe(firstBody.article.id);

    publicWeb.responses.set(ARTICLE_URL, {
      status: 200,
      html: ARTICLE_HTML.replace("Fixture article body for persistence.", "Updated fixture article body."),
      finalUrl: ARTICLE_URL
    });
    const updated = await submit();
    expect(updated.statusCode).toBe(200);
    expect(updated.json<typeof firstBody>().snapshot.version).toBe(2);
    expect(updated.json<typeof firstBody>().snapshot_created).toBe(true);

    const detail = await runtime.app.inject({
      method: "GET",
      url: `/api/content/articles/${firstBody.article.id}`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(detail.statusCode).toBe(200);
    const detailBody = detail.json<{
      article: { source_id: string; source_name: string };
      snapshots: Array<{ version: number }>;
      image_references: Array<{ url: string; reference_type: string; snapshot_version: number }>;
    }>();
    expect(detailBody.article.source_id).toBeTruthy();
    expect(detailBody.article.source_name).toBe("Fixture Account");
    expect(detailBody.snapshots.map((snapshot) => snapshot.version)).toEqual([2, 1]);
    expect(detailBody.image_references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: "https://example.com/cover.jpg", reference_type: "cover" }),
        expect.objectContaining({ url: "https://example.com/inline.jpg", reference_type: "inline" })
      ])
    );
    expect(JSON.stringify(detailBody.image_references)).not.toContain("cached_path");

    const failed = await runtime.app.inject({
      method: "POST",
      url: "/api/content/articles/submit",
      headers: { authorization: `Bearer ${token}` },
      payload: { url: FORBIDDEN_URL }
    });
    expect(failed.statusCode).toBe(422);
    expect(failed.json<{ error: string }>().error).toContain("403");
  });

  it("migrates legacy articles repeatedly without changing legacy data", async () => {
    const before = await runtime.app.inject({
      method: "GET",
      url: "/api/content/migrations/legacy/status",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(before.statusCode).toBe(200);
    const beforeBody = before.json<{
      legacy_article_count: number;
      legacy_snapshot_count: number;
      content_article_count: number;
      content_snapshot_count: number;
      legacy_data_untouched: boolean;
    }>();
    expect(beforeBody.legacy_article_count).toBeGreaterThan(0);
    expect(beforeBody.legacy_snapshot_count).toBeGreaterThan(0);
    expect(beforeBody.legacy_data_untouched).toBe(true);

    const runMigration = () =>
      runtime.app.inject({
        method: "POST",
        url: "/api/content/migrations/legacy/run",
        headers: { authorization: `Bearer ${token}` }
      });
    expect((await runMigration()).statusCode).toBe(200);
    const repeated = await runMigration();
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json<{ newly_created_snapshot_count: number }>().newly_created_snapshot_count).toBe(0);

    const after = await runtime.app.inject({
      method: "GET",
      url: "/api/content/migrations/legacy/status",
      headers: { authorization: `Bearer ${token}` }
    });
    const afterBody = after.json<typeof beforeBody & { linked_article_count: number }>();
    expect(afterBody.legacy_article_count).toBe(beforeBody.legacy_article_count);
    expect(afterBody.legacy_snapshot_count).toBe(beforeBody.legacy_snapshot_count);
    expect(afterBody.content_article_count).toBe(beforeBody.content_article_count);
    expect(afterBody.content_snapshot_count).toBe(beforeBody.content_snapshot_count);
    expect(afterBody.linked_article_count).toBeGreaterThan(0);

    const legacyArticles = await runtime.app.inject({
      method: "GET",
      url: "/api/research/articles",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(legacyArticles.statusCode).toBe(200);
    expect(legacyArticles.json<{ items: Array<{ title: string }> }>().items.map((item) => item.title)).toContain(
      "A deterministic research article"
    );
  });

  it("serves, reviews, exports, and tombstones legacy article ids through shared content", async () => {
    const articles = await runtime.app.inject({
      method: "GET",
      url: "/api/research/articles",
      headers: { authorization: `Bearer ${token}` }
    });
    const legacy = articles
      .json<{ items: Array<{ id: string; article_url: string }> }>()
      .items.find((item) => item.article_url === COLLECTED_ARTICLE_URL);
    expect(legacy).toBeTruthy();

    publicWeb.responses.set(COLLECTED_ARTICLE_URL, {
      status: 200,
      html: ARTICLE_HTML.replace("Fixture article body for persistence.", "Shared library update body."),
      finalUrl: COLLECTED_ARTICLE_URL
    });
    const updateClaim = await createAndClaimTask(COLLECTED_ARTICLE_URL);
    await runClaim(updateClaim);

    const detail = await runtime.app.inject({
      method: "GET",
      url: `/api/research/articles/${legacy!.id}`,
      headers: { authorization: `Bearer ${token}` }
    });
    const contentArticleId = detail.json<{ article: { content_article_id: string } }>().article.content_article_id;

    const fulltext = await runtime.app.inject({
      method: "GET",
      url: `/api/research/articles/${legacy!.id}/fulltext`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(fulltext.statusCode).toBe(200);
    expect(fulltext.json<{ content_text: string }>().content_text).toContain("Shared library update body");

    const searched = await runtime.app.inject({
      method: "GET",
      url: "/api/research/articles?keyword=Shared%20library%20update",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(searched.json<{ items: Array<{ id: string }> }>().items.map((item) => item.id)).toContain(legacy!.id);

    const reviewed = await runtime.app.inject({
      method: "POST",
      url: `/api/research/articles/${legacy!.id}/review`,
      headers: { authorization: `Bearer ${token}` },
      payload: { usability_level: "A", review_status: "reviewed", comment: "shared-model-review" }
    });
    expect(reviewed.statusCode).toBe(200);
    const reviewedDetail = await runtime.app.inject({
      method: "GET",
      url: `/api/research/articles/${legacy!.id}`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(reviewedDetail.json<{ article: { usability_level: string; review_status: string } }>().article).toMatchObject({
      usability_level: "A",
      review_status: "reviewed"
    });

    const exported = await runtime.app.inject({
      method: "GET",
      url: `/api/research/export/articles.csv?article_ids=${legacy!.id}`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.body).toContain("Shared library update body");
    expect(exported.body).not.toContain("shared-model-review");

    const deleted = await runtime.app.inject({
      method: "POST",
      url: "/api/research/articles/batch-delete",
      headers: { authorization: `Bearer ${token}` },
      payload: { article_ids: [legacy!.id] }
    });
    expect(deleted.statusCode).toBe(200);

    const missing = await runtime.app.inject({
      method: "GET",
      url: `/api/research/articles/${legacy!.id}`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(missing.statusCode).toBe(404);
    const tombstoned = await runtime.app.inject({
      method: "GET",
      url: `/api/content/articles/${contentArticleId}`,
      headers: { authorization: `Bearer ${token}` }
    });
    const tombstoneBody = tombstoned.json<{ snapshots: unknown[]; tombstone: { reason: string } }>();
    expect(tombstoneBody.snapshots).toEqual([]);
    expect(tombstoneBody.tombstone.reason).toBe("user_deleted");

    const afterDeleteSearch = await runtime.app.inject({
      method: "GET",
      url: "/api/research/articles?keyword=Shared%20library%20update",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(afterDeleteSearch.json<{ total: number }>().total).toBe(0);
    const afterDeleteExport = await runtime.app.inject({
      method: "GET",
      url: `/api/research/export/articles.csv?article_ids=${legacy!.id}`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(afterDeleteExport.body).not.toContain("Shared library update body");
    const blockedRestore = await runtime.app.inject({
      method: "POST",
      url: "/api/content/articles/submit",
      headers: { authorization: `Bearer ${token}` },
      payload: { url: COLLECTED_ARTICLE_URL }
    });
    expect(blockedRestore.statusCode).toBe(409);
  });

  it("retains successful articles and failure evidence in a partially failed collection item", async () => {
    const account = await runtime.app.inject({
      method: "POST",
      url: "/api/research/accounts",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Partial Fixture", manual_article_urls: [PARTIAL_URL, FORBIDDEN_URL] }
    });
    const accountId = account.json<{ id: string }>().id;
    const task = await runtime.app.inject({
      method: "POST",
      url: "/api/research/tasks",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        task_name: "partial-fixture",
        task_type: "single_account_incremental",
        source_ids: [accountId],
        target_urls: [],
        concurrency: 1
      }
    });
    const taskId = task.json<{ id: string }>().id;
    const claim = await runtime.services.research.repo.claimNextTaskItem([]);
    expect(claim?.task_id).toBe(taskId);
    await runClaim(claim!);

    const items = await runtime.services.research.repo.listTaskItems(taskId);
    expect(items[0]?.status).toBe("success");
    expect(items[0]?.article_count).toBe(1);
    expect(JSON.stringify(items[0]?.last_result)).toContain(FORBIDDEN_URL);
  });

  it.each([
    ["HTTP failure", FORBIDDEN_URL],
    ["parse failure", INVALID_URL]
  ])("keeps existing task failure semantics for %s", async (_label, targetUrl) => {
    const claim = await createAndClaimTask(targetUrl);
    await runClaim(claim);

    const items = await runtime.services.research.repo.listTaskItems(claim.task_id);
    expect(items[0]?.status).toBe("failed");
    expect(items[0]?.error_message).toBeTruthy();
  });

  it("versions, confirms, and gates a research project brief", async () => {
    const created = await runtime.app.inject({
      method: "POST",
      url: "/api/research-projects",
      headers: { authorization: `Bearer ${token}` },
      payload: { raw_request: "为一家企业规划公众号品牌宣传内容，希望提升品牌认知。" }
    });
    expect(created.statusCode).toBe(201);
    const createdBody = created.json<{
      project: { id: string; raw_request: string; status: string };
      brief: { version: number; open_questions: Array<{ key: string }> };
    }>();
    const projectId = createdBody.project.id;
    expect(createdBody.project.raw_request).toContain("公众号品牌宣传");
    expect(createdBody.brief.open_questions.map((question) => question.key)).toEqual(["change_event", "target_audience"]);

    const blockedStart = await runtime.app.inject({
      method: "POST",
      url: `/api/research-projects/${projectId}/start`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(blockedStart.statusCode).toBe(409);
    const blockedConfirm = await runtime.app.inject({
      method: "POST",
      url: `/api/research-projects/${projectId}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: {}
    });
    expect(blockedConfirm.statusCode).toBe(409);

    for (const [question_key, answer] of [
      ["change_event", "公司将发布新的量化基金产品"],
      ["target_audience", "现有投资人与潜在高净值客户"]
    ]) {
      const response = await runtime.app.inject({
        method: "POST",
        url: `/api/research-projects/${projectId}/answers`,
        headers: { authorization: `Bearer ${token}` },
        payload: { question_key, answer }
      });
      expect(response.statusCode).toBe(200);
    }

    const revised = await runtime.app.inject({
      method: "PUT",
      url: `/api/research-projects/${projectId}/brief`,
      headers: { authorization: `Bearer ${token}` },
      payload: { patch: { constraints: ["不得承诺收益", "仅使用公开资料"] }, note: "compliance constraints" }
    });
    const revisedBody = revised.json<{ brief: { version: number; open_questions: unknown[] }; versions: unknown[] }>();
    expect(revisedBody.brief.version).toBe(4);
    expect(revisedBody.brief.open_questions).toEqual([]);
    expect(revisedBody.versions).toHaveLength(4);

    const confirmed = await runtime.app.inject({
      method: "POST",
      url: `/api/research-projects/${projectId}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: { note: "approved brief" }
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json<{ project: { status: string }; confirmations: unknown[] }>().project.status).toBe("brief_confirmed");
    expect(confirmed.json<{ confirmations: unknown[] }>().confirmations).toHaveLength(1);

    const confirmedAgain = await runtime.app.inject({
      method: "POST",
      url: `/api/research-projects/${projectId}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: {}
    });
    expect(confirmedAgain.statusCode).toBe(200);
    expect(confirmedAgain.json<{ confirmations: unknown[] }>().confirmations).toHaveLength(1);

    const started = await runtime.app.inject({
      method: "POST",
      url: `/api/research-projects/${projectId}/start`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(started.statusCode).toBe(200);
    expect(started.json<{ status: string }>().status).toBe("research_ready");

    const startedAgain = await runtime.app.inject({
      method: "POST",
      url: `/api/research-projects/${projectId}/start`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(startedAgain.statusCode).toBe(200);
    expect(startedAgain.json<{ status: string }>().status).toBe("research_ready");

    const skillCreated = await runtime.app.inject({
      method: "POST",
      url: "/api/research-projects",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        intake_source: "skill",
        raw_request: "为私募基金新发行的量化产品做品牌宣传，目的是告诉投资人公司新增量化团队和产品，并寻找对标账号。"
      }
    });
    expect(skillCreated.statusCode).toBe(201);
    expect(skillCreated.json<{ project: { intake_source: string } }>().project.intake_source).toBe("skill");
  });

  it("rejects manual project discovery until the confirmed brief starts research", async () => {
    const created = await runtime.app.inject({
      method: "POST",
      url: "/api/research-projects",
      headers: { authorization: `Bearer ${token}` },
      payload: { raw_request: "为新产品建立公众号研究项目并寻找公开内容证据。" }
    });
    const projectId = created.json<{ project: { id: string } }>().project.id;

    const response = await runtime.app.inject({
      method: "POST",
      url: `/api/research-projects/${projectId}/discovery-runs`,
      headers: { authorization: `Bearer ${token}` },
      payload: { urls: [ARTICLE_URL] }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "Project Brief 尚未确认并启动研究" });
  });

  it("collects, retries, selects, deduplicates, and exports project evidence", async () => {
    const projectId = await createReadyProject();
    const invalidSource = await runtime.app.inject({
      method: "POST",
      url: `/api/research-projects/${projectId}/discovery-runs`,
      headers: { authorization: `Bearer ${token}` },
      payload: { urls: ["https://example.com/article"] }
    });
    expect(invalidSource.statusCode).toBe(400);
    const tooMany = await runtime.app.inject({
      method: "POST",
      url: `/api/research-projects/${projectId}/discovery-runs`,
      headers: { authorization: `Bearer ${token}` },
      payload: { urls: Array.from({ length: 31 }, (_, index) => `${ARTICLE_URL}&idx=${index}`) }
    });
    expect(tooMany.statusCode).toBe(400);

    const discovery = await runtime.app.inject({
      method: "POST",
      url: `/api/research-projects/${projectId}/discovery-runs`,
      headers: { authorization: `Bearer ${token}` },
      payload: { urls: [TRACKED_ARTICLE_URL, ARTICLE_URL, SECOND_SHARED_ARTICLE_URL, FORBIDDEN_URL] }
    });
    expect(discovery.statusCode).toBe(201);
    const discoveryBody = discovery.json<{
      run: { id: string; status: string; requested_count: number; succeeded_count: number; failed_count: number };
      items: Array<{ status: string; error_message?: string }>;
    }>();
    expect(discoveryBody.run).toMatchObject({
      status: "partial",
      requested_count: 3,
      succeeded_count: 2,
      failed_count: 1
    });
    expect(discoveryBody.items.map((item) => item.status).sort()).toEqual(["failed", "succeeded", "succeeded"]);
    expect(discoveryBody.items).toContainEqual(expect.objectContaining({ requested_url: TRACKED_ARTICLE_URL }));

    const evidence = await runtime.app.inject({
      method: "GET",
      url: `/api/research-projects/${projectId}/evidence`,
      headers: { authorization: `Bearer ${token}` }
    });
    const evidenceItems = evidence.json<{ items: Array<{ id: string; selection_status: string; title: string }> }>().items;
    const evidenceItem = evidenceItems.find((item) => item.title === "A deterministic research article")!;
    const excludedItem = evidenceItems.find((item) => item.title === "A second shared article")!;
    expect(evidenceItem).toMatchObject({ selection_status: "candidate", title: "A deterministic research article" });

    const rejectedDecision = await runtime.app.inject({
      method: "PATCH",
      url: `/api/research-projects/${projectId}/evidence/${evidenceItem.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "excluded" }
    });
    expect(rejectedDecision.statusCode).toBe(400);
    const defaultInclusion = await runtime.app.inject({
      method: "PATCH",
      url: `/api/research-projects/${projectId}/evidence/${evidenceItem.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "included" }
    });
    expect(defaultInclusion.statusCode).toBe(200);
    expect(defaultInclusion.json<{ item: { decision_reason: string } }>().item.decision_reason).toBe("手动纳入");

    const included = await runtime.app.inject({
      method: "PATCH",
      url: `/api/research-projects/${projectId}/evidence/${evidenceItem.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "included", decision_reason: "与项目目标直接相关" }
    });
    expect(included.statusCode).toBe(200);
    const excluded = await runtime.app.inject({
      method: "PATCH",
      url: `/api/research-projects/${projectId}/evidence/${excludedItem.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "excluded", decision_reason: "与本项目范围无关" }
    });
    expect(excluded.statusCode).toBe(200);

    const repeated = await runtime.app.inject({
      method: "POST",
      url: `/api/research-projects/${projectId}/discovery-runs`,
      headers: { authorization: `Bearer ${token}` },
      payload: { urls: [ARTICLE_URL] }
    });
    expect(repeated.statusCode).toBe(201);
    expect(repeated.json<{ run: { status: string } }>().run.status).toBe("completed");
    const evidenceAfterRepeat = await runtime.app.inject({
      method: "GET",
      url: `/api/research-projects/${projectId}/evidence`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(evidenceAfterRepeat.json<{ items: Array<{ title: string; selection_status: string }> }>().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "A deterministic research article", selection_status: "included" }),
        expect.objectContaining({ title: "A second shared article", selection_status: "excluded" })
      ])
    );

    const retry = await runtime.app.inject({
      method: "POST",
      url: `/api/research-projects/${projectId}/discovery-runs/${discoveryBody.run.id}/retry-failed`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(retry.statusCode).toBe(201);
    expect(retry.json<{ run: { status: string } }>().run.status).toBe("failed");

    for (const format of ["csv", "md"] as const) {
      const exported = await runtime.app.inject({
        method: "GET",
        url: `/api/research-projects/${projectId}/evidence/export?format=${format}`,
        headers: { authorization: `Bearer ${token}` }
      });
      expect(exported.statusCode).toBe(200);
      expect(exported.body).toContain("A deterministic research article");
      expect(exported.body).not.toContain("A second shared article");
      expect(exported.body).not.toContain("Fixture article body for persistence");
    }
  });

  it("serves shared article facts through a linked Content Sample while preserving its operational identity", async () => {
    const legacyCreated = await runtime.app.inject({
      method: "POST",
      url: "/api/incubation/content-samples",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: "Legacy-only content sample",
        original_url: "https://legacy.example/unlinked-content-sample",
        author_name: "Legacy sample author",
        risk_level: "low"
      }
    });
    const legacySampleId = legacyCreated.json<{ id: string }>().id;

    const submitted = await runtime.app.inject({
      method: "POST",
      url: "/api/content/articles/submit",
      headers: { authorization: `Bearer ${token}` },
      payload: { url: ARTICLE_URL }
    });
    expect([200, 201]).toContain(submitted.statusCode);
    const shared = submitted.json<{
      article: { id: string; canonical_url: string };
      snapshot: { id: string };
    }>();

    const created = await runtime.app.inject({
      method: "POST",
      url: "/api/incubation/content-samples",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: "Duplicated legacy title",
        original_url: "https://legacy.example/content-sample",
        author_name: "Duplicated legacy author",
        content_article_id: shared.article.id,
        content_snapshot_id: shared.snapshot.id,
        content_type: "图文",
        risk_level: "low"
      }
    });
    expect(created.statusCode).toBe(200);
    const sampleId = created.json<{ id: string }>().id;

    const listed = await runtime.app.inject({
      method: "GET",
      url: "/api/incubation/content-samples?limit=200",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(listed.statusCode).toBe(200);
    const sample = listed
      .json<{ items: Array<Record<string, unknown>> }>()
      .items.find((item) => item.id === sampleId);
    const legacySample = listed
      .json<{ items: Array<Record<string, unknown>> }>()
      .items.find((item) => item.id === legacySampleId);

    expect(sample).toMatchObject({
      id: sampleId,
      content_article_id: shared.article.id,
      content_snapshot_id: shared.snapshot.id,
      title: "A deterministic research article",
      original_url: shared.article.canonical_url,
      author_name: "Fixture Account"
    });
    expect(legacySample).toMatchObject({
      id: legacySampleId,
      content_article_id: null,
      content_snapshot_id: null,
      title: "Legacy-only content sample",
      original_url: "https://legacy.example/unlinked-content-sample",
      author_name: "Legacy sample author"
    });
  });

  it("generates topic suggestions from shared facts for a linked Content Sample", async () => {
    const submitted = await runtime.app.inject({
      method: "POST",
      url: "/api/content/articles/submit",
      headers: { authorization: `Bearer ${token}` },
      payload: { url: ARTICLE_URL }
    });
    const shared = submitted.json<{ article: { id: string }; snapshot: { id: string } }>();
    const created = await runtime.app.inject({
      method: "POST",
      url: "/api/incubation/content-samples",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: "Stale duplicated topic title",
        content_article_id: shared.article.id,
        content_snapshot_id: shared.snapshot.id,
        is_viral: true,
        risk_level: "low"
      }
    });
    const sampleId = created.json<{ id: string }>().id;

    const suggested = await runtime.app.inject({
      method: "POST",
      url: "/api/incubation/suggestions/topics",
      headers: { authorization: `Bearer ${token}` },
      payload: { limit: 30, persist: false }
    });
    expect(suggested.statusCode).toBe(200);
    const seed = suggested
      .json<{ items: Array<{ title: string; source_trace: { content_sample_id?: string } }> }>()
      .items.find((item) => item.source_trace.content_sample_id === sampleId);

    expect(seed?.title).toContain("A deterministic research article");
    expect(seed?.title).not.toContain("Stale duplicated topic title");
  });

  it("exports shared provenance and projected facts for a linked Content Sample", async () => {
    const submitted = await runtime.app.inject({
      method: "POST",
      url: "/api/content/articles/submit",
      headers: { authorization: `Bearer ${token}` },
      payload: { url: ARTICLE_URL }
    });
    const shared = submitted.json<{ article: { id: string }; snapshot: { id: string } }>();
    await runtime.app.inject({
      method: "POST",
      url: "/api/incubation/content-samples",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: "Stale exported title",
        content_article_id: shared.article.id,
        content_snapshot_id: shared.snapshot.id,
        risk_level: "low"
      }
    });

    const exported = await runtime.app.inject({
      method: "GET",
      url: "/api/incubation/export/content-samples?format=csv",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(exported.statusCode).toBe(200);
    expect(exported.body.split(/\r?\n/, 1)[0]).toContain("content_article_id,content_snapshot_id");
    expect(exported.body).toContain(shared.article.id);
    expect(exported.body).toContain(shared.snapshot.id);
    expect(exported.body).toContain("A deterministic research article");
    expect(exported.body).not.toContain("Stale exported title");
  });

  it("resolves linked Content Samples by shared facts when importing downstream comments", async () => {
    const submitted = await runtime.app.inject({
      method: "POST",
      url: "/api/content/articles/submit",
      headers: { authorization: `Bearer ${token}` },
      payload: { url: ARTICLE_URL }
    });
    const shared = submitted.json<{ article: { id: string }; snapshot: { id: string } }>();
    const created = await runtime.app.inject({
      method: "POST",
      url: "/api/incubation/content-samples",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: "Stale comment relation title",
        content_article_id: shared.article.id,
        content_snapshot_id: shared.snapshot.id,
        risk_level: "low"
      }
    });
    const sampleId = created.json<{ id: string }>().id;

    const imported = await runtime.app.inject({
      method: "POST",
      url: "/api/incubation/import/comments",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: `comment_text,source_content\n如何开始？,A deterministic research article`
      }
    });
    expect(imported.statusCode).toBe(200);

    const legacyAliasImported = await runtime.app.inject({
      method: "POST",
      url: "/api/incubation/import/comments",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: `comment_text,source_content\n旧表格还能导入吗？,Stale comment relation title`
      }
    });
    expect(legacyAliasImported.statusCode).toBe(200);

    const comments = await runtime.app.inject({
      method: "GET",
      url: "/api/incubation/comments?keyword=如何开始",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(comments.statusCode).toBe(200);
    expect(comments.json<{ items: Array<{ content_sample_id: string }> }>().items).toContainEqual(
      expect.objectContaining({ content_sample_id: sampleId })
    );

    const legacyAliasComments = await runtime.app.inject({
      method: "GET",
      url: "/api/incubation/comments?keyword=旧表格还能导入吗",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(legacyAliasComments.json<{ items: Array<{ content_sample_id: string }> }>().items).toContainEqual(
      expect.objectContaining({ content_sample_id: sampleId })
    );
  });

  it("rejects a Content Sample whose shared snapshot belongs to another article", async () => {
    const first = await runtime.app.inject({
      method: "POST",
      url: "/api/content/articles/submit",
      headers: { authorization: `Bearer ${token}` },
      payload: { url: ARTICLE_URL }
    });
    const second = await runtime.app.inject({
      method: "POST",
      url: "/api/content/articles/submit",
      headers: { authorization: `Bearer ${token}` },
      payload: { url: SECOND_SHARED_ARTICLE_URL }
    });
    const firstShared = first.json<{ article: { id: string } }>();
    const secondShared = second.json<{ snapshot: { id: string } }>();

    const created = await runtime.app.inject({
      method: "POST",
      url: "/api/incubation/content-samples",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: "Invalid cross-article reference",
        content_article_id: firstShared.article.id,
        content_snapshot_id: secondShared.snapshot.id,
        risk_level: "low"
      }
    });

    expect(created.statusCode).toBe(409);
    expect(created.json<{ error: string }>().error).toContain("共享文章与快照引用不一致");

    const missingSnapshot = await runtime.app.inject({
      method: "POST",
      url: "/api/incubation/content-samples",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: "Incomplete shared reference",
        content_article_id: firstShared.article.id,
        risk_level: "low"
      }
    });
    expect(missingSnapshot.statusCode).toBe(409);
  });

  it("returns an explicit not-configured browser discovery result", async () => {
    await expect(runtime.adapters.browserDiscovery.discover({ query: "quantitative fund accounts" })).resolves.toEqual({
      status: "not_configured",
      articleUrls: [],
      message: "浏览器辅助发现尚未配置"
    });
  });

  it("releases application resources when Fastify closes and remains idempotent", async () => {
    await runtime.app.close();
    await expect(runtime.close()).resolves.toBeUndefined();
    await expect(runtime.close()).resolves.toBeUndefined();
  });
});
