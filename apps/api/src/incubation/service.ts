import * as XLSX from "xlsx";

import type { AuthUser } from "../research/types";
import { buildTopicSeeds, buildTrackScoreSuggestion, classifyCommentNeed, classifyViralContent } from "./advisor";
import { IncubationRepository } from "./repository";
import type { ExportFormat, IncubationEntity } from "./types";

function csvEscape(value: unknown): string {
  const normalized = String(value ?? "");
  if (/[",\n]/.test(normalized)) return `"${normalized.replace(/"/g, '""')}"`;
  return normalized;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current.trim());
  return values;
}

function parseImportRows(content: string): Record<string, unknown>[] {
  const trimmed = content.replace(/^\uFEFF/, "").trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return [parsed as Record<string, unknown>];
    return [];
  }

  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function withAlias(input: Record<string, unknown>, from: string, to: string, output: Record<string, unknown>) {
  if (output[to] === undefined && input[from] !== undefined && input[from] !== "") output[to] = input[from];
}

export class IncubationService {
  constructor(public readonly repo: IncubationRepository) {}

  async list(entity: IncubationEntity, filters: Record<string, unknown>) {
    return {
      items: await this.repo.listEntity(entity, filters)
    };
  }

  async upsertEntity(user: AuthUser, entity: IncubationEntity, input: Record<string, unknown>) {
    if (entity === "platforms") return { id: await this.repo.upsertPlatform(user, input) };
    if (entity === "tracks") return { id: await this.repo.upsertTrack(user, input) };
    if (entity === "keywords") return { id: await this.repo.upsertKeyword(user, input) };
    if (entity === "information-sources") return { id: await this.repo.upsertInformationSource(user, input) };
    if (entity === "tasks") return { id: await this.repo.upsertTask(user, input) };
    if (entity === "benchmark-accounts") return { id: await this.repo.upsertBenchmarkAccount(user, input) };
    if (entity === "content-samples") {
      const signals = classifyViralContent({
        likes: asNumber(input.likes),
        collects: asNumber(input.collects),
        comments: asNumber(input.comments),
        shares: asNumber(input.shares),
        plays: asNumber(input.plays),
        follower_count: asNumber(input.follower_count)
      });
      return {
        id: await this.repo.upsertContentSample(user, {
          ...input,
          interaction_rate: input.interaction_rate ?? signals.interaction_rate,
          is_low_follower_viral: input.is_low_follower_viral ?? signals.is_low_follower_viral,
          is_viral: input.is_viral ?? signals.is_viral,
          analysis_json: { ...asRecord(input.analysis_json), viral_signals: signals.reasons }
        })
      };
    }
    if (entity === "comments") {
      const classified = classifyCommentNeed(String(input.comment_text ?? ""));
      return {
        id: await this.repo.upsertComment(user, {
          ...classified,
          ...input,
          need_type: input.need_type ?? classified.need_type,
          sentiment: input.sentiment ?? classified.sentiment,
          intent_score: input.intent_score ?? classified.intent_score,
          cluster_key: input.cluster_key ?? classified.cluster_key
        })
      };
    }
    if (entity === "topics") return { id: await this.repo.upsertTopic(user, input) };
    if (entity === "owned-accounts") return { id: await this.repo.upsertOwnedAccount(user, input) };
    if (entity === "materials") return { id: await this.repo.upsertMaterial(user, input) };
    throw new Error(`Unsupported entity ${entity}`);
  }

  private async normalizeImportRow(entity: IncubationEntity, row: Record<string, unknown>) {
    const normalized: Record<string, unknown> = { ...row };

    withAlias(row, "platform", "platform_id", normalized);
    withAlias(row, "track", "track_id", normalized);
    withAlias(row, "account_name", "name", normalized);
    withAlias(row, "account_url", "url", normalized);
    withAlias(row, "level", "account_level", normalized);
    withAlias(row, "replicable_points", "copyable_points", normalized);
    withAlias(row, "author", "author_name", normalized);
    withAlias(row, "views", "plays", normalized);
    withAlias(row, "target_user", "target_audience", normalized);
    withAlias(row, "source_content", "content_sample_id", normalized);
    withAlias(row, "owned_account", "owned_account_id", normalized);
    withAlias(row, "source_platform", "source_platform_id", normalized);

    if (normalized.platform_id) normalized.platform_id = (await this.repo.resolvePlatformId(normalized.platform_id)) ?? normalized.platform_id;
    if (normalized.primary_platform_id) normalized.primary_platform_id = (await this.repo.resolvePlatformId(normalized.primary_platform_id)) ?? normalized.primary_platform_id;
    if (normalized.source_platform_id) normalized.source_platform_id = (await this.repo.resolvePlatformId(normalized.source_platform_id)) ?? normalized.source_platform_id;
    if (normalized.track_id) normalized.track_id = (await this.repo.resolveTrackId(normalized.track_id)) ?? normalized.track_id;
    if (normalized.benchmark_account_id) {
      normalized.benchmark_account_id = (await this.repo.resolveBenchmarkAccountId(normalized.benchmark_account_id)) ?? normalized.benchmark_account_id;
    }
    if (normalized.content_sample_id) normalized.content_sample_id = (await this.repo.resolveContentSampleId(normalized.content_sample_id)) ?? normalized.content_sample_id;
    if (normalized.owned_account_id) normalized.owned_account_id = (await this.repo.resolveOwnedAccountId(normalized.owned_account_id)) ?? normalized.owned_account_id;

    if (entity === "benchmark-accounts") {
      withAlias(row, "account_url", "url", normalized);
    }
    if (entity === "owned-accounts") {
      withAlias(row, "account_url", "account_url", normalized);
      withAlias(row, "risk_level", "risk_status", normalized);
    }
    if (entity === "materials") {
      withAlias(row, "file_path", "file_url", normalized);
      withAlias(row, "copyright", "copyright_status", normalized);
    }

    return normalized;
  }

  async importEntity(user: AuthUser, entity: IncubationEntity, content: string) {
    const rows = parseImportRows(content);
    let imported = 0;
    for (const row of rows) {
      await this.upsertEntity(user, entity, await this.normalizeImportRow(entity, row));
      imported += 1;
    }

    await this.repo.upsertTask(user, {
      task_name: `${entity} import ${new Date().toISOString().slice(0, 10)}`,
      task_type: "manual_import",
      entity_type: entity,
      status: "success",
      source_count: 1,
      item_count: rows.length,
      result_count: imported,
      logs_json: [{ at: new Date().toISOString(), message: `Imported ${imported} rows` }]
    });

    return { imported };
  }

  async exportEntity(user: AuthUser, entity: IncubationEntity, filters: Record<string, unknown>, format: ExportFormat) {
    const rows = await this.repo.listRowsForExport(entity, filters);
    await this.repo.createExportRecord(user, entity, format, filters, rows.length);
    const header = rows[0] ? Object.keys(rows[0]) : this.repo.getExportColumns(entity);

    if (format === "xlsx") {
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, entity.slice(0, 31));
      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
      return {
        body: buffer,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename: `${entity}-${new Date().toISOString().slice(0, 10)}.xlsx`
      };
    }

    const lines = [`\uFEFF${header.join(",")}`];
    for (const row of rows) lines.push(header.map((column) => csvEscape(row[column])).join(","));
    return {
      body: Buffer.from(lines.join("\n"), "utf8"),
      contentType: "text/csv; charset=utf-8",
      filename: `${entity}-${new Date().toISOString().slice(0, 10)}.csv`
    };
  }

  async suggestTrackScore(user: AuthUser, trackId: string, persist = true) {
    const { track, counts } = await this.repo.getTrackScoreInputs(trackId);
    if (!track) throw new Error("TRACK_NOT_FOUND");

    const suggestion = buildTrackScoreSuggestion({
      keywordCount: asNumber(counts.keyword_count),
      contentCount: asNumber(counts.content_count),
      viralContentCount: asNumber(counts.viral_content_count),
      lowFollowerViralCount: asNumber(counts.low_follower_viral_count),
      benchmarkCount: asNumber(counts.benchmark_count),
      commentCount: asNumber(counts.comment_count),
      commercialPathPresent: Boolean(track.monetization_path),
      contentSupplyDifficulty: String(track.content_supply_difficulty ?? ""),
      complianceRiskLevel: String(track.compliance_risk_level ?? "medium")
    });

    const output = suggestion as unknown as Record<string, unknown>;
    if (persist) await this.repo.updateTrackScore(user, trackId, output);
    await this.repo.createSuggestionRecord(user, "track_score", "incubation_track", trackId, { track, counts }, output);
    return suggestion;
  }

  async suggestTopics(user: AuthUser, options: { track_id?: string | null; limit?: number; persist?: boolean }) {
    const input = await this.repo.getTopicGenerationInputs(options.track_id ?? null, options.limit ?? 20);
    const seeds = buildTopicSeeds({ ...input, limit: options.limit ?? 12 });
    const created: string[] = [];
    if (options.persist !== false) {
      for (const seed of seeds) {
        const result = await this.upsertEntity(user, "topics", seed as unknown as Record<string, unknown>);
        created.push(result.id);
      }
    }
    await this.repo.createSuggestionRecord(user, "topics", "incubation_topic", options.track_id ?? null, options, { seeds, created });
    return { items: seeds, created };
  }

  async dashboard() {
    return this.repo.getDashboardSummary();
  }
}
