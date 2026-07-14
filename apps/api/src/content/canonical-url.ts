const WECHAT_ARTICLE_KEYS = ["__biz", "mid", "idx", "sn"] as const;

export function canonicalizeContentUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  url.hash = "";

  if (url.hostname === "mp.weixin.qq.com" && url.pathname.startsWith("/s")) {
    const stableValues = WECHAT_ARTICLE_KEYS.map((key) => [key, url.searchParams.get(key)] as const).filter(
      (entry): entry is readonly [typeof WECHAT_ARTICLE_KEYS[number], string] => entry[1] !== null
    );
    if (stableValues.length) {
      url.search = "";
      for (const [key, stableValue] of stableValues) url.searchParams.set(key, stableValue);
    }
  }

  url.searchParams.sort();
  return url.toString();
}

export function getWeChatSourceKey(value: string) {
  return new URL(value).searchParams.get("__biz");
}
