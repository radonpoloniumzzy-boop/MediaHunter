# Keep searchable internal snapshots while linking media by default

MediaHunter will retain source metadata, cleaned article text, necessary HTML snapshots, and structured analysis for internal research and traceability. Images remain external references by default, reports summarize rather than reproduce substantial source text, and removed content leaves only a Source Tombstone instead of remaining available to new analysis.

## Consequences

- Every snapshot and analysis must preserve source URL and capture time.
- Full text and raw HTML require restricted internal access and must not flow into automatic publishing.
- Media downloading is an explicit exception rather than default collection behavior.
- Removal workflows must exclude deleted bodies from search, retrieval, and future model context.
