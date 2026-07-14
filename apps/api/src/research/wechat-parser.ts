import { createHash } from "node:crypto";

import type { WeChatArticleSnapshot } from "./types";

function decodeHtml(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(input: string): string {
  return decodeHtml(input.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function pickFirst(html: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtml(match[1].trim());
    }
  }
  return null;
}

function extractContentHtml(html: string): string {
  const match = html.match(/<div[^>]+id="js_content"[^>]*>([\s\S]*?)<\/div>\s*<script/);
  if (match?.[1]) {
    return match[1].trim();
  }

  const fallback = html.match(/<div[^>]+id="js_content"[^>]*>([\s\S]*?)<\/div>/);
  return fallback?.[1]?.trim() ?? "";
}

function extractImageUrls(contentHtml: string): string[] {
  const matches = [...contentHtml.matchAll(/(?:data-src|src)="([^"]+)"/g)];
  const deduped = new Set<string>();
  for (const match of matches) {
    const value = decodeHtml(match[1]);
    if (value.startsWith("http")) {
      deduped.add(value);
    }
  }
  return [...deduped];
}

function extractPublishTime(html: string): string | null {
  const timestamp = pickFirst(html, [/var\s+ct\s*=\s*"(\d+)"/, /var\s+ct\s*=\s*(\d+)/, /"publish_time"\s*:\s*"([^"]+)"/]);
  if (!timestamp) return null;

  if (/^\d+$/.test(timestamp)) {
    const numeric = Number(timestamp);
    if (Number.isFinite(numeric) && numeric > 0) {
      return new Date(numeric * 1000).toISOString();
    }
  }

  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function extractArticleLinksFromHtml(html: string, baseUrl: string): string[] {
  const matches = [...html.matchAll(/href="([^"]+)"/g)];
  const links = new Set<string>();
  for (const match of matches) {
    const raw = decodeHtml(match[1]);
    if (!raw) continue;
    let resolved: string;
    try {
      resolved = new URL(raw, baseUrl).toString();
    } catch {
      continue;
    }
    if (resolved.includes("mp.weixin.qq.com/s?")) {
      links.add(resolved.split("#")[0]);
    }
  }
  return [...links];
}

export function parseWeChatArticleHtml(html: string, url: string): WeChatArticleSnapshot {
  const title =
    pickFirst(html, [/<meta property="og:title" content="([^"]+)"/i, /<h1[^>]*id="activity-name"[^>]*>([\s\S]*?)<\/h1>/i, /<title>([\s\S]*?)<\/title>/i]) ??
    "未命名文章";
  const author = pickFirst(html, [/var\s+nickname\s*=\s*htmlDecode\("([^"]*)"\)/, /var\s+nickname\s*=\s*"([^"]*)"/, /<meta name="author" content="([^"]+)"/i]);
  const summary = pickFirst(html, [/<meta name="description" content="([^"]+)"/i, /<meta property="og:description" content="([^"]+)"/i]);
  const coverUrl = pickFirst(html, [/<meta property="og:image" content="([^"]+)"/i, /var\s+msg_cdn_url\s*=\s*"([^"]+)"/]);
  const contentHtml = extractContentHtml(html);
  const contentText = stripTags(contentHtml);
  const imageUrls = extractImageUrls(contentHtml);
  const publishTime = extractPublishTime(html);

  return {
    title,
    author,
    publish_time: publishTime,
    summary,
    cover_url: coverUrl,
    content_html: contentHtml,
    content_text: contentText,
    image_urls: imageUrls,
    has_video: /<video[\s>]/i.test(contentHtml),
    has_audio: /<audio[\s>]/i.test(contentHtml),
    raw_json: {
      fetched_url: url,
      title,
      summary,
      interaction: {
        read_count: null,
        like_count: null,
        share_count: null,
        comment_count: null,
        wow_count: null
      }
    }
  };
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function detectFetchFailure(html: string, status: number): string | null {
  if (status === 404) return "内容删除";
  if (status === 403) return "访问受限";
  if (html.includes("此内容因违规无法查看")) return "内容删除";
  if (html.includes("你的访问过于频繁")) return "访问受限";
  if (!html.includes("js_content") && !html.includes("og:title")) return "解析失败";
  return null;
}
