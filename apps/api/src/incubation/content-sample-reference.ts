export class ContentSampleReferenceError extends Error {
  constructor() {
    super("共享文章与快照引用不一致");
    this.name = "ContentSampleReferenceError";
  }
}

export function assertContentSampleReferencePair(contentArticleId: string | null, contentSnapshotId: string | null) {
  if (Boolean(contentArticleId) !== Boolean(contentSnapshotId)) {
    throw new ContentSampleReferenceError();
  }
}
