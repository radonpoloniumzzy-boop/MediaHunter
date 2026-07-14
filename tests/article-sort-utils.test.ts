import { describe, expect, it } from "vitest";

import { getNextArticleSortState } from "../apps/web/src/article-sort-utils";

describe("article sort header interaction", () => {
  it("toggles direction when clicking the same header", () => {
    expect(getNextArticleSortState({ sort_by: "title", sort_order: "asc" }, "title")).toEqual({
      sort_by: "title",
      sort_order: "desc"
    });
  });

  it("uses a sensible default direction when switching to a new header", () => {
    expect(getNextArticleSortState({ sort_by: "default", sort_order: "desc" }, "publish_time")).toEqual({
      sort_by: "publish_time",
      sort_order: "desc"
    });

    expect(getNextArticleSortState({ sort_by: "publish_time", sort_order: "desc" }, "title")).toEqual({
      sort_by: "title",
      sort_order: "asc"
    });
  });
});
