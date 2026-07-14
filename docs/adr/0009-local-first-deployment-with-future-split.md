# Deploy locally first and split public collection later if needed

The first production shape of MediaHunter will run as a single-user system on the user's Windows computer with local data storage and browser-assisted discovery confined to that machine. Missed scheduled work will catch up after restart; if continuous remote operation becomes necessary, public collection may move to a remote service while authenticated browser assistance remains in a Local Collection Agent.

## Consequences

- First-stage schedules depend on the local computer being available and require catch-up semantics.
- Client evidence and browser authentication state remain local by default.
- Future remote components must not receive browser credentials and must communicate with the local agent through a narrow, auditable interface.
