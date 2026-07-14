import type { RoleName } from "./types";

export type Permission =
  | "accounts:read"
  | "accounts:write"
  | "rules:read"
  | "rules:write"
  | "tasks:read"
  | "tasks:write"
  | "articles:read"
  | "articles:fulltext"
  | "articles:review"
  | "articles:manage"
  | "articles:risk"
  | "exports:write"
  | "logs:read"
  | "dashboard:read"
  | "incubation:read"
  | "incubation:write"
  | "incubation:export"
  | "incubation:suggest";

const PERMISSIONS_BY_ROLE: Record<RoleName, Permission[]> = {
  admin: [
    "accounts:read",
    "accounts:write",
    "rules:read",
    "rules:write",
    "tasks:read",
    "tasks:write",
    "articles:read",
    "articles:fulltext",
    "articles:review",
    "articles:manage",
    "articles:risk",
    "exports:write",
    "logs:read",
    "dashboard:read",
    "incubation:read",
    "incubation:write",
    "incubation:export",
    "incubation:suggest"
  ],
  operator: [
    "accounts:read",
    "accounts:write",
    "tasks:read",
    "tasks:write",
    "articles:read",
    "articles:manage",
    "dashboard:read",
    "incubation:read",
    "incubation:write",
    "incubation:export",
    "incubation:suggest"
  ],
  researcher: [
    "accounts:read",
    "rules:read",
    "tasks:read",
    "articles:read",
    "articles:fulltext",
    "articles:review",
    "exports:write",
    "dashboard:read",
    "incubation:read",
    "incubation:write",
    "incubation:export",
    "incubation:suggest"
  ],
  compliance: [
    "accounts:read",
    "rules:read",
    "rules:write",
    "tasks:read",
    "articles:read",
    "articles:fulltext",
    "articles:review",
    "articles:risk",
    "exports:write",
    "logs:read",
    "dashboard:read",
    "incubation:read",
    "incubation:export",
    "incubation:suggest"
  ],
  viewer: ["accounts:read", "tasks:read", "articles:read", "dashboard:read", "incubation:read"]
};

export function hasPermission(roles: RoleName[], permission: Permission): boolean {
  return roles.some((role) => PERMISSIONS_BY_ROLE[role].includes(permission));
}
