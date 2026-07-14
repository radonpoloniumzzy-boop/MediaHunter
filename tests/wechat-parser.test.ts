import { describe, expect, it } from "vitest";

import { extractArticleLinksFromHtml, parseWeChatArticleHtml } from "../apps/api/src/research/wechat-parser";

const SAMPLE_HTML = `
<!doctype html>
<html>
  <head>
    <meta property="og:title" content="市场观察：长期主义">
    <meta property="og:description" content="这是一段摘要">
    <meta property="og:image" content="https://example.com/cover.jpg">
  </head>
  <body>
    <script>var ct = "1714550400"; var nickname = "机构品牌号";</script>
    <div id="js_content">
      <p>第一段正文</p>
      <img data-src="https://example.com/image-1.jpg" />
      <p>第二段正文</p>
    </div>
    <script>var end = true;</script>
  </body>
</html>
`;

describe("wechat article parser", () => {
  it("extracts the structured article snapshot", () => {
    const parsed = parseWeChatArticleHtml(SAMPLE_HTML, "https://mp.weixin.qq.com/s?__biz=demo");

    expect(parsed.title).toBe("市场观察：长期主义");
    expect(parsed.author).toBe("机构品牌号");
    expect(parsed.summary).toBe("这是一段摘要");
    expect(parsed.cover_url).toContain("cover.jpg");
    expect(parsed.content_text).toContain("第一段正文");
    expect(parsed.image_urls).toHaveLength(1);
    expect(parsed.publish_time).toBeTruthy();
  });

  it("extracts public article links from an entry page", () => {
    const html = `
      <a href="https://mp.weixin.qq.com/s?__biz=abc&mid=1">A</a>
      <a href="/s?__biz=def&mid=2">B</a>
      <a href="https://example.com/other">C</a>
    `;

    const links = extractArticleLinksFromHtml(html, "https://mp.weixin.qq.com");
    expect(links).toEqual([
      "https://mp.weixin.qq.com/s?__biz=abc&mid=1",
      "https://mp.weixin.qq.com/s?__biz=def&mid=2"
    ]);
  });
});
