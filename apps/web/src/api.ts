const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001/api";

export type IncubationEntity =
  | "platforms"
  | "tracks"
  | "keywords"
  | "information-sources"
  | "tasks"
  | "benchmark-accounts"
  | "content-samples"
  | "comments"
  | "topics"
  | "owned-accounts"
  | "materials";

export interface AuthUser {
  id: string;
  username: string;
  display_name: string;
  roles: string[];
  status: string;
}

export type AnyRecord = Record<string, unknown>;

export interface DashboardSummary {
  tracks: AnyRecord;
  assets: AnyRecord;
  tasks: Array<{ status: string; count: number }>;
  top_tracks: AnyRecord[];
  need_clusters: AnyRecord[];
}

export interface TaskRecord {
  id: string;
  task_name: string;
  task_type: string;
  status: string;
  source_count: number;
  article_count: number;
  concurrency: number;
  months_back?: number | null;
  error_summary?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  created_at: string;
  updated_at: string;
  success_count: number;
  failed_count: number;
  running_count: number;
  pending_count: number;
  paused_count: number;
  cancelled_count: number;
  total_count: number;
  completed_count: number;
  progress_percent: number;
}

async function apiFetch<T>(path: string, token?: string | null, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {})
      },
      ...init
    });
  } catch {
    throw new Error("无法连接 API，请先启动本地系统。");
  }

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(error.error ?? `Request failed with ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function toQuery(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const raw = search.toString();
  return raw ? `?${raw}` : "";
}

export async function login(username: string, password: string) {
  return apiFetch<{ token: string; user: AuthUser }>("/auth/login", null, {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

export async function me(token: string) {
  return apiFetch<{ user: AuthUser }>("/auth/me", token);
}

export async function logout(token: string) {
  return apiFetch<void>("/auth/logout", token, { method: "POST" });
}

export async function getDashboard(token: string) {
  return apiFetch<DashboardSummary>("/incubation/dashboard", token);
}

export async function listEntity<T extends AnyRecord = AnyRecord>(
  token: string,
  entity: IncubationEntity,
  filters: Record<string, string | number | boolean | undefined | null> = {}
) {
  return apiFetch<{ items: T[] }>(`/incubation/${entity}${toQuery(filters)}`, token);
}

export async function saveEntity(token: string, entity: IncubationEntity, payload: AnyRecord) {
  return apiFetch<{ id: string }>(`/incubation/${entity}`, token, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function importEntity(token: string, entity: IncubationEntity, content: string) {
  return apiFetch<{ imported: number }>(`/incubation/import/${entity}`, token, {
    method: "POST",
    body: JSON.stringify({ content })
  });
}

export async function suggestTrackScore(token: string, trackId: string) {
  return apiFetch<AnyRecord>("/incubation/suggestions/track-score", token, {
    method: "POST",
    body: JSON.stringify({ track_id: trackId, persist: true })
  });
}

export async function suggestTopics(token: string, payload: { track_id?: string | null; limit?: number; persist?: boolean }) {
  return apiFetch<{ items: AnyRecord[]; created: string[] }>("/incubation/suggestions/topics", token, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function downloadExport(
  token: string,
  entity: IncubationEntity,
  filters: Record<string, string | number | boolean | undefined | null>,
  format: "csv" | "xlsx"
) {
  const response = await fetch(`${API_BASE_URL}/incubation/export/${entity}${toQuery({ ...filters, format })}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(error.error ?? `Request failed with ${response.status}`);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const contentDisposition = response.headers.get("content-disposition") ?? "";
  const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filenameMatch?.[1] ?? `${entity}.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}
