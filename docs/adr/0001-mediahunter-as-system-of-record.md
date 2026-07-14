# Use MediaHunter as the content intelligence system of record

MediaHunter will remain the primary system for source monitoring, article storage, benchmark evidence, analysis results, and topic candidates. Codex Skills will operate above it as research and operations workflows instead of maintaining separate article collections, because the existing application already provides durable storage, task execution, review, and export capabilities while Skills are better suited to orchestration and analysis.

## Consequences

- Collection and analysis capabilities must expose stable application interfaces that Skills can call.
- `topic-research` should consume MediaHunter data instead of maintaining a separate source catalog or article archive.
- Skills may cache temporary working context, but durable content intelligence belongs in MediaHunter.
