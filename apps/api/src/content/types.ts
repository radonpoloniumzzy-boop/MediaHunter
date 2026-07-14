import type { WeChatArticleSnapshot } from "../research/types";

export interface StoreContentInput {
  requestedUrl: string;
  finalUrl: string;
  httpStatus: number;
  canonicalUrl: string;
  sourceKey: string | null;
  sourceName: string | null;
  sourceUrl?: string | null;
  snapshot: WeChatArticleSnapshot;
  contentHash: string;
  origin?: "public_fetch" | "legacy_migration";
  capturedAt?: string | null;
}

export interface StoredContentResult {
  article: Record<string, unknown>;
  snapshot: Record<string, unknown>;
  created: boolean;
  snapshot_created: boolean;
}
