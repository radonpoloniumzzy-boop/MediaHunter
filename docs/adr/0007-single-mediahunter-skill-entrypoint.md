# Provide one MediaHunter Skill entrypoint for three workflows

Users will invoke a single `mediahunter` Skill using natural language, which routes requests to Daily Intelligence, Weekly Operations, or Project Research workflows. The existing `topic-research` Skill remains as a compatible entry to Daily Intelligence but must read from MediaHunter rather than maintain its own article or source collection.

## Consequences

- Workflow detection and explicit override belong to the entry Skill.
- Internal workflows may evolve independently without requiring users to learn new commands.
- All workflows use MediaHunter as their durable source of truth and must not create parallel content archives.
