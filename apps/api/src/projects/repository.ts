import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";

import type { AuthUser } from "../research/types";
import type { BriefQuestion, ProjectBrief } from "./types";
import { getDiscoveryRunStatus } from "./discovery-run";

function jsonValue<T>(value: T) {
  return JSON.parse(JSON.stringify(value));
}

export class ProjectRepository {
  constructor(private readonly sql: Sql) {}

  async create(user: AuthUser, input: { name: string; raw_request: string; intake_source: string }, brief: ProjectBrief, questions: BriefQuestion[]) {
    return this.sql.begin(async (transaction) => {
      const tx = transaction as unknown as Sql;
      const projectId = randomUUID();
      const briefId = randomUUID();
      await tx`
        insert into research_project (id, name, raw_request, intake_source, created_by)
        values (${projectId}, ${input.name}, ${input.raw_request}, ${input.intake_source}, ${user.id})
      `;
      await tx`
        insert into project_brief_version (id, project_id, version, brief, open_questions, change_note, created_by)
        values (${briefId}, ${projectId}, 1, ${tx.json(jsonValue(brief))}, ${tx.json(jsonValue(questions))}, ${"initial_intake"}, ${user.id})
      `;
      return this.get(projectId, tx);
    });
  }

  async list() {
    return this.sql<Record<string, unknown>[]>`
      select id, name, raw_request, intake_source, status, research_profile,
             current_brief_version, created_at::text, updated_at::text
      from research_project
      order by updated_at desc
    `;
  }

  async get(projectId: string, sql: Sql = this.sql) {
    const projects = await sql<Record<string, unknown>[]>`
      select id, name, raw_request, intake_source, status, research_profile,
             current_brief_version, created_at::text, updated_at::text
      from research_project where id = ${projectId} limit 1
    `;
    if (!projects[0]) return null;
    const versions = await sql<Record<string, unknown>[]>`
      select id, project_id, version, brief, open_questions, change_note, created_at::text
      from project_brief_version where project_id = ${projectId} order by version desc
    `;
    const confirmations = await sql<Record<string, unknown>[]>`
      select confirmation.id, confirmation.brief_version_id, version.version as brief_version,
             confirmation.note, confirmation.confirmed_at::text
      from project_brief_confirmation confirmation
      join project_brief_version version on version.id = confirmation.brief_version_id
      where confirmation.project_id = ${projectId}
      order by confirmation.confirmed_at desc
    `;
    return { project: projects[0], brief: versions[0], versions, confirmations };
  }

  async addVersion(user: AuthUser, projectId: string, brief: ProjectBrief, questions: BriefQuestion[], note: string) {
    return this.sql.begin(async (transaction) => {
      const tx = transaction as unknown as Sql;
      const projects = await tx<Record<string, unknown>[]>`
        select current_brief_version from research_project where id = ${projectId} for update
      `;
      if (!projects[0]) return null;
      const version = Number(projects[0].current_brief_version) + 1;
      await tx`
        insert into project_brief_version (id, project_id, version, brief, open_questions, change_note, created_by)
        values (${randomUUID()}, ${projectId}, ${version}, ${tx.json(jsonValue(brief))}, ${tx.json(jsonValue(questions))}, ${note}, ${user.id})
      `;
      await tx`
        update research_project
        set current_brief_version = ${version}, status = ${"brief_draft"}, updated_at = now()
        where id = ${projectId}
      `;
      return this.get(projectId, tx);
    });
  }

  async confirm(user: AuthUser, projectId: string, note?: string) {
    return this.sql.begin(async (transaction) => {
      const tx = transaction as unknown as Sql;
      const projects = await tx<Record<string, unknown>[]>`
        select status from research_project where id = ${projectId} for update
      `;
      if (!projects[0]) return null;
      const detail = await this.get(projectId, tx);
      if (!detail) return null;
      if (projects[0].status === "brief_confirmed" || projects[0].status === "research_ready") return detail;
      const questions = detail.brief.open_questions as unknown[];
      if (questions.length) throw new Error("BRIEF_INCOMPLETE");
      await tx`
        insert into project_brief_confirmation (id, project_id, brief_version_id, confirmed_by, note)
        values (${randomUUID()}, ${projectId}, ${String(detail.brief.id)}, ${user.id}, ${note ?? null})
        on conflict (brief_version_id) do nothing
      `;
      await tx`update research_project set status = ${"brief_confirmed"}, updated_at = now() where id = ${projectId}`;
      return this.get(projectId, tx);
    });
  }

  async start(projectId: string) {
    const rows = await this.sql<Record<string, unknown>[]>`
      update research_project set status = ${"research_ready"}, updated_at = now()
      where id = ${projectId} and status = ${"brief_confirmed"}
      returning id, status
    `;
    if (rows[0]) return rows[0];
    const exists = await this.sql<Record<string, unknown>[]>`select id, status from research_project where id = ${projectId}`;
    if (!exists[0]) return null;
    if (exists[0].status === "research_ready") return exists[0];
    throw new Error("BRIEF_NOT_CONFIRMED");
  }

  async getDiscoveryContext(projectId: string) {
    const rows = await this.sql<Record<string, unknown>[]>`
      select project.id, project.status, brief.id as brief_version_id, brief.version as brief_version
      from research_project project
      join project_brief_version brief
        on brief.project_id = project.id and brief.version = project.current_brief_version
      where project.id = ${projectId}
      limit 1
    `;
    return rows[0] ?? null;
  }

  async createDiscoveryRun(
    user: AuthUser,
    projectId: string,
    briefVersionId: string,
    urls: Array<{ requestedUrl: string; normalizedUrl: string }>
  ) {
    const runId = randomUUID();
    await this.sql.begin(async (transaction) => {
      const tx = transaction as unknown as Sql;
      await tx`
        insert into project_discovery_run (
          id, project_id, brief_version_id, requested_count, created_by
        ) values (${runId}, ${projectId}, ${briefVersionId}, ${urls.length}, ${user.id})
      `;
      for (const url of urls) {
        await tx`
          insert into project_discovery_item (id, run_id, requested_url, normalized_url)
          values (${randomUUID()}, ${runId}, ${url.requestedUrl}, ${url.normalizedUrl})
        `;
      }
    });
    return runId;
  }

  async markDiscoveryItemSucceeded(
    user: AuthUser,
    projectId: string,
    runId: string,
    normalizedUrl: string,
    articleId: string,
    snapshotId: string
  ) {
    await this.sql.begin(async (transaction) => {
      const tx = transaction as unknown as Sql;
      await tx`
        update project_discovery_item
        set status = ${"succeeded"}, content_article_id = ${articleId},
            content_snapshot_id = ${snapshotId}, error_message = null, completed_at = now()
        where run_id = ${runId} and normalized_url = ${normalizedUrl}
      `;
      await tx`
        insert into project_article_evidence (
          id, project_id, content_article_id, content_snapshot_id, source_run_id, added_by
        ) values (${randomUUID()}, ${projectId}, ${articleId}, ${snapshotId}, ${runId}, ${user.id})
        on conflict (project_id, content_article_id) do nothing
      `;
    });
  }

  async markDiscoveryItemFailed(runId: string, normalizedUrl: string, message: string) {
    await this.sql`
      update project_discovery_item
      set status = ${"failed"}, error_message = ${message}, completed_at = now()
      where run_id = ${runId} and normalized_url = ${normalizedUrl}
    `;
  }

  async finalizeDiscoveryRun(runId: string) {
    const counts = await this.sql<{ succeeded_count: number; failed_count: number }[]>`
      select
        count(*) filter (where status = 'succeeded')::integer as succeeded_count,
        count(*) filter (where status = 'failed')::integer as failed_count
      from project_discovery_item
      where run_id = ${runId}
    `;
    const succeededCount = Number(counts[0]?.succeeded_count ?? 0);
    const failedCount = Number(counts[0]?.failed_count ?? 0);
    await this.sql`
      update project_discovery_run
      set succeeded_count = ${succeededCount}, failed_count = ${failedCount},
          status = ${getDiscoveryRunStatus(succeededCount, failedCount)}, completed_at = now()
      where id = ${runId}
    `;
  }

  async getDiscoveryRun(projectId: string, runId: string) {
    const runs = await this.sql<Record<string, unknown>[]>`
      select id, project_id, brief_version_id, mode, status, requested_count,
             succeeded_count, failed_count, started_at::text, completed_at::text
      from project_discovery_run
      where id = ${runId} and project_id = ${projectId}
      limit 1
    `;
    if (!runs[0]) return null;
    const items = await this.sql<Record<string, unknown>[]>`
      select id, requested_url, normalized_url, status, content_article_id,
             content_snapshot_id, error_message, created_at::text, completed_at::text
      from project_discovery_item
      where run_id = ${runId}
      order by created_at, id
    `;
    return { run: runs[0], items };
  }

  async getLatestDiscoveryRun(projectId: string) {
    const rows = await this.sql<{ id: string }[]>`
      select id from project_discovery_run
      where project_id = ${projectId}
      order by started_at desc
      limit 1
    `;
    return rows[0] ? this.getDiscoveryRun(projectId, rows[0].id) : null;
  }

  async listFailedDiscoveryUrls(projectId: string, runId: string) {
    return this.sql<{ requested_url: string }[]>`
      select item.requested_url
      from project_discovery_item item
      join project_discovery_run run on run.id = item.run_id
      where item.run_id = ${runId} and run.project_id = ${projectId} and item.status = 'failed'
      order by item.created_at
    `;
  }

  async listEvidence(projectId: string, status?: "candidate" | "included" | "excluded") {
    return this.sql<Record<string, unknown>[]>`
      select evidence.id, evidence.project_id, evidence.content_article_id,
             evidence.content_snapshot_id, evidence.selection_status, evidence.decision_reason,
             evidence.created_at::text, evidence.updated_at::text,
             snapshot.title, snapshot.author, snapshot.publish_time::text,
             snapshot.source_url, snapshot.final_url, snapshot.captured_at::text,
             article.canonical_url, source.display_name as source_name
      from project_article_evidence evidence
      join content_article article on article.id = evidence.content_article_id
      join content_snapshot snapshot on snapshot.id = evidence.content_snapshot_id
      left join content_source source on source.id = article.source_id
      where evidence.project_id = ${projectId}
        and (${status ?? null}::text is null or evidence.selection_status = ${status ?? null})
      order by evidence.updated_at desc, evidence.id
    `;
  }

  async updateEvidence(
    user: AuthUser,
    projectId: string,
    evidenceId: string,
    status: "candidate" | "included" | "excluded",
    reason: string | null
  ) {
    const rows = await this.sql<Record<string, unknown>[]>`
      update project_article_evidence
      set selection_status = ${status}, decision_reason = ${reason},
          decided_by = ${status === "candidate" ? null : user.id}, updated_at = now()
      where id = ${evidenceId} and project_id = ${projectId}
      returning id
    `;
    return rows[0] ?? null;
  }
}
