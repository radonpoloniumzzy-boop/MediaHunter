# Import owned-account performance as historical snapshots

The first release will ingest WeChat backend Excel or CSV exports instead of automating authenticated backend access. Imported metrics are matched to owned articles by URL when possible and by title plus publication date with user review for ambiguous matches, and each import is retained as a Performance Snapshot so later values do not erase the evidence used by earlier recommendations.

## Consequences

- Original import files, import time, field mappings, and match confidence must remain traceable.
- Weekly planning must report stale or missing owned performance rather than silently substituting estimates.
- Automated WeChat backend login is outside the first release.
