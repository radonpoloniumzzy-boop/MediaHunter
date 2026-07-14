# Introduce a parallel shared content fact model

MediaHunter will introduce `content_source`, `content_article`, immutable `content_snapshot`, and
`content_image_reference` records alongside the existing operational article tables. A canonical
URL identifies the shared article, while a content hash identifies an immutable version. Repeated
submission of the same URL and hash reuses the existing snapshot.

## Consequences

- Existing article, review, collection, and export APIs remain backed by the legacy tables until
  their read and write paths are migrated in task 03.
- Public submissions and legacy migration can populate the shared model without duplicating equal
  snapshots.
- Images are stored as typed, positioned external references; media files are not downloaded.
- Legacy article and snapshot mappings make migration repeatable and auditable. Migration never
  modifies or deletes legacy rows, so failed runs can be inspected and safely repeated.
