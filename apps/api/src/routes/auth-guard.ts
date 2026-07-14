import type { FastifyReply, FastifyRequest } from "fastify";

import type { ResearchService } from "../research/research-service";

export function getBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

export async function requireUser(
  request: FastifyRequest,
  reply: FastifyReply,
  service: ResearchService,
  permission?: Parameters<ResearchService["assertPermission"]>[1]
) {
  const user = await service.currentUserFromToken(getBearerToken(request));
  if (!user) {
    reply.code(401);
    return null;
  }
  if (permission) {
    try {
      service.assertPermission(user, permission);
    } catch {
      reply.code(403);
      return null;
    }
  }
  return user;
}
