import type { FastifyInstance } from "fastify";

import { createApp } from "./app";
import { ContentRepository } from "./content/repository";
import { ContentService } from "./content/service";
import { LegacyContentMigrator } from "./content/legacy-content-migrator";
import { createDatabaseConnection, ensureSchema } from "./db";
import type { AppEnv } from "./env";
import {
  DefaultAnalysisWorkflowAdapter,
  DisabledBrowserDiscoveryAdapter,
  FetchPublicWebAdapter,
  type AnalysisWorkflowAdapter,
  type BrowserDiscoveryAdapter,
  type PublicWebAdapter
} from "./external-adapters";
import { IncubationRepository } from "./incubation/repository";
import { IncubationService } from "./incubation/service";
import { RequestRepository } from "./repositories/request-repository";
import { SessionRepository } from "./repositories/session-repository";
import { ResearchRepository } from "./research/research-repository";
import { ResearchService } from "./research/research-service";
import { PipelineService } from "./services/pipeline-service";

export interface ApplicationAdapters {
  publicWeb: PublicWebAdapter;
  analysisWorkflow: AnalysisWorkflowAdapter;
  browserDiscovery: BrowserDiscoveryAdapter;
}

export interface ApplicationServices {
  pipeline: PipelineService;
  research: ResearchService;
  incubation: IncubationService;
  content: ContentService;
}

export interface ServiceContainer {
  adapters: ApplicationAdapters;
  services: ApplicationServices;
  close(): Promise<void>;
}

export interface ApplicationRuntime extends ServiceContainer {
  app: FastifyInstance;
}

export interface CreateApplicationOptions {
  env: AppEnv;
  adapters?: Partial<ApplicationAdapters>;
  logger?: boolean;
}

function createDefaultAdapters(env: AppEnv): ApplicationAdapters {
  return {
    publicWeb: new FetchPublicWebAdapter(),
    analysisWorkflow: new DefaultAnalysisWorkflowAdapter({
      openAIApiKey: env.OPENAI_API_KEY,
      openAIModel: env.OPENAI_MODEL,
      openAIBaseUrl: env.OPENAI_BASE_URL
    }),
    browserDiscovery: new DisabledBrowserDiscoveryAdapter()
  };
}

export async function createServiceContainer(options: CreateApplicationOptions): Promise<ServiceContainer> {
  const adapters = { ...createDefaultAdapters(options.env), ...options.adapters };
  const sql = await createDatabaseConnection(options.env.DATABASE_URL);
  let closePromise: Promise<void> | null = null;

  try {
    await ensureSchema(sql);
    const sessions = new SessionRepository(sql);
    const requests = new RequestRepository(sql);
    const researchRepo = new ResearchRepository(sql);
    const contentRepo = new ContentRepository(sql);
    const legacyContentMigrator = new LegacyContentMigrator(sql, contentRepo);
    const incubationRepo = new IncubationRepository(sql);
    const services: ApplicationServices = {
      pipeline: new PipelineService(sessions, requests, adapters.analysisWorkflow),
      research: new ResearchService(researchRepo, options.env, adapters.publicWeb, contentRepo),
      incubation: new IncubationService(incubationRepo),
      content: new ContentService(contentRepo, adapters.publicWeb, legacyContentMigrator)
    };

    return {
      adapters,
      services,
      close() {
        closePromise ??= sql.end({ timeout: 5 });
        return closePromise;
      }
    };
  } catch (error) {
    await sql.end({ timeout: 5 });
    throw error;
  }
}

export async function createApplication(options: CreateApplicationOptions): Promise<ApplicationRuntime> {
  const container = await createServiceContainer(options);
  let app: FastifyInstance;

  try {
    app = await createApp(
      container.services.pipeline,
      container.services.research,
      container.services.incubation,
      container.services.content,
      { logger: options.logger ?? true }
    );
    app.addHook("onClose", async () => {
      await container.close();
    });
  } catch (error) {
    await container.close();
    throw error;
  }

  let closePromise: Promise<void> | null = null;
  return {
    app,
    adapters: container.adapters,
    services: container.services,
    close() {
      closePromise ??= (async () => {
        await app.close();
        await container.close();
      })();
      return closePromise;
    }
  };
}
