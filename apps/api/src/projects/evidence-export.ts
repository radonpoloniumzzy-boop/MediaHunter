export interface ProjectEvidenceExportRow {
  selection_status: string;
  title: string;
  source_name?: string | null;
  author?: string | null;
  publish_time?: string | null;
  canonical_url: string;
  decision_reason?: string | null;
  captured_at?: string | null;
}

function csvCell(value: unknown) {
  const raw = value == null ? "" : String(value);
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportProjectEvidenceCsv(rows: ProjectEvidenceExportRow[]) {
  const columns: Array<keyof ProjectEvidenceExportRow> = [
    "selection_status",
    "title",
    "source_name",
    "author",
    "publish_time",
    "canonical_url",
    "decision_reason",
    "captured_at"
  ];
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n");
}

export function exportProjectEvidenceMarkdown(projectName: string, rows: ProjectEvidenceExportRow[]) {
  const lines = [`# ${projectName} 项目证据`, ""];
  for (const [index, row] of rows.entries()) {
    lines.push(`## ${index + 1}. ${row.title}`, "");
    lines.push(`- 状态：${row.selection_status}`);
    if (row.source_name || row.author) lines.push(`- 来源：${row.source_name ?? row.author}`);
    if (row.publish_time) lines.push(`- 发布时间：${row.publish_time}`);
    lines.push(`- 原文：${row.canonical_url}`);
    if (row.decision_reason) lines.push(`- 选择理由：${row.decision_reason}`);
    if (row.captured_at) lines.push(`- 抓取时间：${row.captured_at}`);
    lines.push("");
  }
  return lines.join("\n");
}
