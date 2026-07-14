import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";

import type { AuthUser } from "../research/types";
import type { BriefQuestion, ProjectBrief } from "./types";

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
}
