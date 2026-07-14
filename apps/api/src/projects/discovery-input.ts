import { canonicalizeContentUrl } from "../content/canonical-url";

export function prepareWeChatArticleUrls(values: string[]) {
  const prepared = new Map<string, { requestedUrl: string; normalizedUrl: string }>();
  for (const value of values) {
    const requestedUrl = value.trim();
    const url = new URL(requestedUrl);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "mp.weixin.qq.com" ||
      (url.pathname !== "/s" && !url.pathname.startsWith("/s/"))
    ) {
      throw new Error("INVALID_WECHAT_ARTICLE_URL");
    }
    const normalizedUrl = canonicalizeContentUrl(url.toString());
    if (!prepared.has(normalizedUrl)) prepared.set(normalizedUrl, { requestedUrl, normalizedUrl });
  }
  return [...prepared.values()];
}

export function normalizeWeChatArticleUrls(values: string[]) {
  return prepareWeChatArticleUrls(values).map((item) => item.normalizedUrl);
}
