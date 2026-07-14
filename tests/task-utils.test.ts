import { describe, expect, it } from "vitest";

import { getTaskTypeLabel, parseTaskUrls } from "../apps/web/src/task-utils";

describe("task utils", () => {
  it("parses multi-article backfill urls with dedupe and invalid detection", () => {
    const result = parseTaskUrls(
      [
        "https://mp.weixin.qq.com/s/abc",
        "",
        "https://mp.weixin.qq.com/s/abc",
        "https://mp.weixin.qq.com/s/def",
        "not-a-url",
        "https://example.com/article"
      ].join("\n")
    );

    expect(result.urls).toEqual(["https://mp.weixin.qq.com/s/abc", "https://mp.weixin.qq.com/s/def"]);
    expect(result.duplicateCount).toBe(1);
    expect(result.invalidUrls).toEqual(["not-a-url", "https://example.com/article"]);
  });

  it("uses the clarified article backfill label", () => {
    expect(getTaskTypeLabel("single_article_backfill")).toBe("文章补采（支持多篇）");
  });
});
