import type { AuthUser } from "../research/types";
import { getMaterialQuestions, organizeProjectBrief } from "./brief-intake";
import { ProjectRepository } from "./repository";
import type { ProjectBrief } from "./types";

function projectName(raw: string) {
  const compact = raw.replace(/\s+/g, " ").trim();
  return compact.length > 36 ? `${compact.slice(0, 36)}...` : compact;
}

export class ProjectService {
  constructor(public readonly repo: ProjectRepository) {}

  create(user: AuthUser, input: { raw_request: string; name?: string; intake_source?: "web" | "skill" }) {
    const brief = organizeProjectBrief(input.raw_request);
    return this.repo.create(
      user,
      { name: input.name?.trim() || projectName(input.raw_request), raw_request: input.raw_request, intake_source: input.intake_source ?? "web" },
      brief,
      getMaterialQuestions(brief)
    );
  }

  list() {
    return this.repo.list();
  }

  get(projectId: string) {
    return this.repo.get(projectId);
  }

  async answer(user: AuthUser, projectId: string, key: keyof ProjectBrief, answer: string) {
    const detail = await this.repo.get(projectId);
    if (!detail) return null;
    const current = detail.brief.brief as ProjectBrief;
    const brief = { ...current, [key]: answer };
    return this.repo.addVersion(user, projectId, brief, getMaterialQuestions(brief), `answered:${key}`);
  }

  async revise(user: AuthUser, projectId: string, patch: Partial<ProjectBrief>, note?: string) {
    const detail = await this.repo.get(projectId);
    if (!detail) return null;
    const brief = { ...(detail.brief.brief as ProjectBrief), ...patch };
    return this.repo.addVersion(user, projectId, brief, getMaterialQuestions(brief), note ?? "brief_revision");
  }

  confirm(user: AuthUser, projectId: string, note?: string) {
    return this.repo.confirm(user, projectId, note);
  }

  start(projectId: string) {
    return this.repo.start(projectId);
  }
}
