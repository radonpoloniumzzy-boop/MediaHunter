import type { AuthUser } from "../research/types";
import { ContentFetchError, type ContentService } from "../content/service";
import { getMaterialQuestions, organizeProjectBrief } from "./brief-intake";
import { prepareWeChatArticleUrls } from "./discovery-input";
import {
  exportProjectEvidenceCsv,
  exportProjectEvidenceMarkdown,
  type ProjectEvidenceExportRow
} from "./evidence-export";
import { ProjectRepository } from "./repository";
import type { ProjectBrief } from "./types";

export class ProjectDiscoveryError extends Error {
  constructor(public readonly code: "PROJECT_NOT_FOUND" | "PROJECT_NOT_READY" | "INVALID_URL" | "INVALID_DECISION" | "NO_FAILED_ITEMS") {
    super(code);
    this.name = "ProjectDiscoveryError";
  }
}

function projectName(raw: string) {
  const compact = raw.replace(/\s+/g, " ").trim();
  return compact.length > 36 ? `${compact.slice(0, 36)}...` : compact;
}

export class ProjectService {
  constructor(public readonly repo: ProjectRepository, private readonly content: ContentService) {}

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

  async runManualDiscovery(user: AuthUser, projectId: string, rawUrls: string[]) {
    let urls: Array<{ requestedUrl: string; normalizedUrl: string }>;
    try {
      urls = prepareWeChatArticleUrls(rawUrls);
    } catch {
      throw new ProjectDiscoveryError("INVALID_URL");
    }
    const context = await this.repo.getDiscoveryContext(projectId);
    if (!context) throw new ProjectDiscoveryError("PROJECT_NOT_FOUND");
    if (context.status !== "research_ready") throw new ProjectDiscoveryError("PROJECT_NOT_READY");

    const runId = await this.repo.createDiscoveryRun(
      user,
      projectId,
      String(context.brief_version_id),
      urls
    );

    for (let offset = 0; offset < urls.length; offset += 3) {
      await Promise.all(
        urls.slice(offset, offset + 3).map(async (url) => {
          try {
            const stored = await this.content.submitPublicArticle(url.normalizedUrl);
            await this.repo.markDiscoveryItemSucceeded(
              user,
              projectId,
              runId,
              url.normalizedUrl,
              String(stored.article.id),
              String(stored.snapshot.id)
            );
          } catch (error) {
            const message = error instanceof ContentFetchError
              ? error.detail
              : error instanceof Error ? error.message : "未知抓取错误";
            await this.repo.markDiscoveryItemFailed(runId, url.normalizedUrl, message);
          }
        })
      );
    }

    await this.repo.finalizeDiscoveryRun(runId);
    return this.repo.getDiscoveryRun(projectId, runId);
  }

  getLatestDiscoveryRun(projectId: string) {
    return this.repo.getLatestDiscoveryRun(projectId);
  }

  async retryFailedDiscovery(user: AuthUser, projectId: string, runId: string) {
    const failed = await this.repo.listFailedDiscoveryUrls(projectId, runId);
    if (!failed.length) throw new ProjectDiscoveryError("NO_FAILED_ITEMS");
    return this.runManualDiscovery(user, projectId, failed.map((item) => item.requested_url));
  }

  listEvidence(projectId: string, status?: "candidate" | "included" | "excluded") {
    return this.repo.listEvidence(projectId, status);
  }

  async updateEvidence(
    user: AuthUser,
    projectId: string,
    evidenceId: string,
    status: "candidate" | "included" | "excluded",
    reason?: string | null
  ) {
    const normalizedReason = status === "candidate"
      ? null
      : reason?.trim() || (status === "included" ? "手动纳入" : null);
    if (status === "excluded" && !normalizedReason) throw new ProjectDiscoveryError("INVALID_DECISION");
    return this.repo.updateEvidence(user, projectId, evidenceId, status, normalizedReason);
  }

  async exportEvidence(projectId: string, format: "md" | "csv") {
    const detail = await this.repo.get(projectId);
    if (!detail) throw new ProjectDiscoveryError("PROJECT_NOT_FOUND");
    const rows = (await this.repo.listEvidence(projectId, "included")) as unknown as ProjectEvidenceExportRow[];
    const projectName = String(detail.project.name);
    return format === "csv"
      ? { content: exportProjectEvidenceCsv(rows), contentType: "text/csv; charset=utf-8", filename: `project-evidence-${projectId}.csv` }
      : { content: exportProjectEvidenceMarkdown(projectName, rows), contentType: "text/markdown; charset=utf-8", filename: `project-evidence-${projectId}.md` };
  }
}
