import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { IncubationService } from "../incubation/service";
import { ContentSampleReferenceError } from "../incubation/content-sample-reference";
import type { ExportFormat, IncubationEntity } from "../incubation/types";
import type { ResearchService } from "../research/research-service";
import type { AuthUser } from "../research/types";

const EntitySchema = z.enum([
  "platforms",
  "tracks",
  "keywords",
  "information-sources",
  "tasks",
  "benchmark-accounts",
  "content-samples",
  "comments",
  "topics",
  "owned-accounts",
  "materials"
]);
const EntityParamsSchema = z.object({ entity: EntitySchema });
const GenericBodySchema = z.record(z.string(), z.unknown());
const ImportBodySchema = z.object({ content: z.string().min(1) });
const TrackScoreSchema = z.object({ track_id: z.string().min(1), persist: z.boolean().optional() });
const TopicSuggestionSchema = z.object({
  track_id: z.string().optional().nullable(),
  limit: z.number().int().min(1).max(30).optional(),
  persist: z.boolean().optional()
});
const ListQuerySchema = z.object({
  track_id: z.string().optional(),
  platform_id: z.string().optional(),
  status: z.string().optional(),
  keyword: z.string().optional(),
  limit: z.coerce.number().optional(),
  offset: z.coerce.number().optional()
});
const ExportQuerySchema = ListQuerySchema.extend({
  format: z.enum(["csv", "xlsx"]).default("csv")
});

function getBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

async function requireUser(
  request: FastifyRequest,
  reply: FastifyReply,
  research: ResearchService,
  permission: Parameters<ResearchService["assertPermission"]>[1]
): Promise<AuthUser | null> {
  const user = await research.currentUserFromToken(getBearerToken(request));
  if (!user) {
    reply.code(401);
    return null;
  }

  try {
    research.assertPermission(user, permission);
  } catch {
    reply.code(403);
    return null;
  }

  return user;
}

export async function registerIncubationRoutes(app: FastifyInstance, incubation: IncubationService, research: ResearchService) {
  app.get("/api/incubation/dashboard", async (request, reply) => {
    const user = await requireUser(request, reply, research, "incubation:read");
    if (!user) return { error: "未授权" };
    return incubation.dashboard();
  });

  app.get("/api/incubation/:entity", async (request, reply) => {
    const user = await requireUser(request, reply, research, "incubation:read");
    if (!user) return { error: "未授权" };
    const { entity } = EntityParamsSchema.parse(request.params);
    const query = ListQuerySchema.parse(request.query);
    return incubation.list(entity as IncubationEntity, query);
  });

  app.post("/api/incubation/:entity", async (request, reply) => {
    const user = await requireUser(request, reply, research, "incubation:write");
    if (!user) return { error: "未授权" };
    const { entity } = EntityParamsSchema.parse(request.params);
    const body = GenericBodySchema.parse(request.body);
    try {
      return await incubation.upsertEntity(user, entity as IncubationEntity, body);
    } catch (error) {
      if (error instanceof ContentSampleReferenceError) {
        reply.code(409);
        return { error: error.message };
      }
      throw error;
    }
  });

  app.post("/api/incubation/import/:entity", async (request, reply) => {
    const user = await requireUser(request, reply, research, "incubation:write");
    if (!user) return { error: "未授权" };
    const { entity } = EntityParamsSchema.parse(request.params);
    const body = ImportBodySchema.parse(request.body);
    return incubation.importEntity(user, entity as IncubationEntity, body.content);
  });

  app.get("/api/incubation/export/:entity", async (request, reply) => {
    const user = await requireUser(request, reply, research, "incubation:export");
    if (!user) return { error: "未授权" };
    const { entity } = EntityParamsSchema.parse(request.params);
    const query = ExportQuerySchema.parse(request.query);
    const result = await incubation.exportEntity(user, entity as IncubationEntity, query, query.format as ExportFormat);
    reply.header("content-type", result.contentType);
    reply.header("content-disposition", `attachment; filename="${result.filename}"`);
    return result.body;
  });

  app.post("/api/incubation/suggestions/track-score", async (request, reply) => {
    const user = await requireUser(request, reply, research, "incubation:suggest");
    if (!user) return { error: "未授权" };
    const body = TrackScoreSchema.parse(request.body);
    return incubation.suggestTrackScore(user, body.track_id, body.persist ?? true);
  });

  app.post("/api/incubation/suggestions/topics", async (request, reply) => {
    const user = await requireUser(request, reply, research, "incubation:suggest");
    if (!user) return { error: "未授权" };
    const body = TopicSuggestionSchema.parse(request.body);
    return incubation.suggestTopics(user, body);
  });
}
