# Keep legacy article IDs as operational projections

Existing article IDs remain the compatibility boundary for collection tasks, reviews, tags, risk
hits, exports, and the current UI. Each operational article links to a shared `content_article`, and
`article_library_view` supplies source facts and full text from its current immutable snapshot.

## Consequences

- Existing API paths and identifiers remain stable while article facts have one shared source.
- Collection writes shared content before updating the operational projection.
- A failure for one discovered URL does not roll back articles already stored from the same task
  item; failure evidence is retained in the task result.
- Deleting the last operational projection removes shared snapshot bodies, marks the shared article
  as removed, and creates a Source Tombstone. Automatic collection cannot restore tombstoned text.
