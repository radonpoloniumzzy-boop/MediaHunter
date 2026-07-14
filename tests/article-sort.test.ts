import { describe, expect, it } from "vitest";

import { getArticleOrderClause } from "../apps/api/src/research/article-sort";

describe("article sort clause", () => {
  it("uses default publish-time ordering when no sort is provided", () => {
    expect(getArticleOrderClause()).toBe("a.publish_time desc nulls last, a.updated_at desc");
  });

  it("supports title ascending ordering", () => {
    expect(getArticleOrderClause("title", "asc")).toBe("lower(a.title) asc, a.updated_at desc");
  });

  it("supports tag ordering through aggregated labels", () => {
    expect(getArticleOrderClause("tag_label", "desc")).toBe("coalesce(min(td.label), '') desc, a.updated_at desc");
  });
});
