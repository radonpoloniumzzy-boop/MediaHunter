import { describe, expect, it } from "vitest";

import {
  normalizeWeChatArticleUrls,
  prepareWeChatArticleUrls
} from "../apps/api/src/projects/discovery-input";
import { getDiscoveryRunStatus } from "../apps/api/src/projects/discovery-run";
import { exportProjectEvidenceCsv, exportProjectEvidenceMarkdown } from "../apps/api/src/projects/evidence-export";

describe("project discovery", () => {
  it("normalizes and deduplicates WeChat article URLs", () => {
    expect(
      normalizeWeChatArticleUrls([
        " https://mp.weixin.qq.com/s?__biz=test&mid=1#wechat_redirect ",
        "https://mp.weixin.qq.com/s?mid=1&__biz=test",
        "https://mp.weixin.qq.com/s?__biz=test&mid=2"
      ])
    ).toEqual([
      "https://mp.weixin.qq.com/s?__biz=test&mid=1",
      "https://mp.weixin.qq.com/s?__biz=test&mid=2"
    ]);
    expect(prepareWeChatArticleUrls(["https://mp.weixin.qq.com/s?mid=1&__biz=test#wechat_redirect"])[0]).toEqual({
      requestedUrl: "https://mp.weixin.qq.com/s?mid=1&__biz=test#wechat_redirect",
      normalizedUrl: "https://mp.weixin.qq.com/s?__biz=test&mid=1"
    });
  });

  it("rejects non-WeChat public URLs", () => {
    expect(() => normalizeWeChatArticleUrls(["https://example.com/article"])).toThrow("INVALID_WECHAT_ARTICLE_URL");
  });

  it("derives an explicit status for every completed batch", () => {
    expect(getDiscoveryRunStatus(2, 0)).toBe("completed");
    expect(getDiscoveryRunStatus(1, 1)).toBe("partial");
    expect(getDiscoveryRunStatus(0, 2)).toBe("failed");
  });

  it("exports evidence metadata without article content", () => {
    const row = {
      selection_status: "included",
      title: "标题，含\"引号\"",
      source_name: "示例来源",
      canonical_url: "https://mp.weixin.qq.com/s?__biz=test&mid=1",
      decision_reason: "与项目相关"
    };
    expect(exportProjectEvidenceCsv([row])).toContain('"标题，含""引号"""');
    expect(exportProjectEvidenceCsv([{ ...row, title: "=2+2" }])).toContain('"\'=2+2"');
    expect(exportProjectEvidenceMarkdown("示例项目", [row])).toContain("# 示例项目 项目证据");
  });
});
