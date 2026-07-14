export type ArticleSortField =
  | "default"
  | "publish_time"
  | "crawl_time"
  | "title"
  | "source_name"
  | "tag_label"
  | "risk_level"
  | "usability_level";

export type ArticleSortDirection = "asc" | "desc";

export interface ArticleSortState {
  sort_by: ArticleSortField;
  sort_order: ArticleSortDirection;
}

const DEFAULT_DIRECTIONS: Record<ArticleSortField, ArticleSortDirection> = {
  default: "desc",
  publish_time: "desc",
  crawl_time: "desc",
  title: "asc",
  source_name: "asc",
  tag_label: "asc",
  risk_level: "desc",
  usability_level: "desc"
};

export function getNextArticleSortState(current: ArticleSortState, nextField: ArticleSortField): ArticleSortState {
  if (current.sort_by === nextField) {
    return {
      sort_by: nextField,
      sort_order: current.sort_order === "asc" ? "desc" : "asc"
    };
  }

  return {
    sort_by: nextField,
    sort_order: DEFAULT_DIRECTIONS[nextField]
  };
}
