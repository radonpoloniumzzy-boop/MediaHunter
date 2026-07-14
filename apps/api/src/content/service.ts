import type { PublicWebAdapter } from "../external-adapters";
import { hashContent, parseWeChatArticleHtml, detectFetchFailure } from "../research/wechat-parser";
import { ContentRepository } from "./repository";
import { LegacyContentMigrator } from "./legacy-content-migrator";
import { canonicalizeContentUrl, getWeChatSourceKey } from "./canonical-url";

export class ContentService {
  constructor(
    public readonly repo: ContentRepository,
    private readonly publicWeb: PublicWebAdapter,
    private readonly legacyMigrator: LegacyContentMigrator
  ) {}

  async submitPublicArticle(url: string) {
    const page = await this.publicWeb.fetchPage(url);
    const failure = page.status >= 400 ? `HTTP ${page.status}` : detectFetchFailure(page.html, page.status);
    if (failure) throw new Error(`CONTENT_FETCH_FAILED:${failure}`);

    const canonicalUrl = canonicalizeContentUrl(page.finalUrl || url);
    const snapshot = parseWeChatArticleHtml(page.html, canonicalUrl);
    const contentHash = hashContent(`${snapshot.title}\n${snapshot.content_text}`);
    return this.repo.storeContent({
      requestedUrl: url,
      finalUrl: page.finalUrl || url,
      httpStatus: page.status,
      canonicalUrl,
      sourceKey: getWeChatSourceKey(canonicalUrl),
      sourceName: snapshot.author,
      snapshot,
      contentHash
    });
  }

  getArticleDetail(articleId: string) {
    return this.repo.getArticleDetail(articleId);
  }

  getLegacyMigrationReadiness() {
    return this.legacyMigrator.getReadiness();
  }

  migrateLegacyArticles() {
    return this.legacyMigrator.run();
  }
}
