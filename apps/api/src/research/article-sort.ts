export type ArticleSortBy =
  | "default"
  | "publish_time"
  | "crawl_time"
  | "title"
  | "source_name"
  | "tag_label"
  | "risk_level"
  | "usability_level";

export type ArticleSortOrder = "asc" | "desc";

export function getArticleOrderClause(sortBy?: string | null, sortOrder?: string | null) {
  const order = sortOrder === "asc" ? "asc" : "desc";

  switch (sortBy) {
    case "publish_time":
      return `a.publish_time ${order} nulls last, a.updated_at desc`;
    case "crawl_time":
      return `a.crawl_time ${order} nulls last, a.updated_at desc`;
    case "title":
      return `lower(a.title) ${order}, a.updated_at desc`;
    case "source_name":
      return `lower(coalesce(a.source_name, '')) ${order}, a.updated_at desc`;
    case "tag_label":
      return `coalesce(min(td.label), '') ${order}, a.updated_at desc`;
    case "risk_level":
      return `case a.risk_level when 'blocked' then 4 when 'high' then 3 when 'medium' then 2 else 1 end ${order}, a.updated_at desc`;
    case "usability_level":
      return `case a.usability_level when 'A' then 4 when 'B' then 3 when 'C' then 2 when 'D' then 1 else 0 end ${order}, a.updated_at desc`;
    default:
      return "a.publish_time desc nulls last, a.updated_at desc";
  }
}
