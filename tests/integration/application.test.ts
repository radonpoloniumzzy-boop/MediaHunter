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
const FORBIDDEN_URL = "https://mp.weixin.qq.com/s?__biz=test&mid=403";
const INVALID_URL = "https://mp.weixin.qq.com/s?__biz=test&mid=invalid";

const ARTICLE_HTML = `
<!doctype html>
<html>
  <head>
    <meta property="og:title" content="A deterministic research article">
    <meta property="og:description" content="Integration fixture summary">
  </head>
  <body>
    <script>var ct = "1714550400"; var nickname = "Fixture Account";</script>
    <div id="js_content"><p>Fixture article body for persistence.</p></div>
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
    publicWeb.responses.set(FORBIDDEN_URL, { status: 403, html: "Forbidden", finalUrl: FORBIDDEN_URL });
    publicWeb.responses.set(INVALID_URL, { status: 200, html: "<html>invalid</html>", finalUrl: INVALID_URL });

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
    const claim = await createAndClaimTask(ARTICLE_URL);
    await runClaim(claim);

    const items = await runtime.services.research.repo.listTaskItems(claim.task_id);
    expect(items[0]?.status).toBe("success");
    expect(publicWeb.requestedUrls).toContain(ARTICLE_URL);

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
