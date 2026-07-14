import {
  runWorkflow,
  type RequirementDoc,
  type WorkflowResult,
  type WorkflowRuntimeOptions
} from "@lan-ting/workflow";

export interface FetchedPage {
  status: number;
  html: string;
  finalUrl: string;
}

export interface PublicWebAdapter {
  fetchPage(url: string): Promise<FetchedPage>;
}

export class FetchPublicWebAdapter implements PublicWebAdapter {
  async fetchPage(url: string): Promise<FetchedPage> {
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36"
      }
    });

    return {
      status: response.status,
      html: await response.text(),
      finalUrl: response.url || url
    };
  }
}

export interface AnalysisWorkflowAdapter {
  run(requirement: RequirementDoc): Promise<WorkflowResult>;
}

export class DefaultAnalysisWorkflowAdapter implements AnalysisWorkflowAdapter {
  constructor(private readonly runtime: WorkflowRuntimeOptions) {}

  run(requirement: RequirementDoc) {
    return runWorkflow(requirement, this.runtime);
  }
}

export interface BrowserDiscoveryRequest {
  query: string;
  accountName?: string | null;
}

export interface BrowserDiscoveryResult {
  status: "success" | "not_configured" | "intervention_required";
  articleUrls: string[];
  message?: string;
}

export interface BrowserDiscoveryAdapter {
  discover(request: BrowserDiscoveryRequest): Promise<BrowserDiscoveryResult>;
}

export class DisabledBrowserDiscoveryAdapter implements BrowserDiscoveryAdapter {
  async discover(_request: BrowserDiscoveryRequest): Promise<BrowserDiscoveryResult> {
    return {
      status: "not_configured",
      articleUrls: [],
      message: "浏览器辅助发现尚未配置"
    };
  }
}
