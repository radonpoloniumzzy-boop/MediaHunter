# Allow restricted browser-assisted article discovery

MediaHunter may use the user's existing authenticated browser session to discover publicly visible WeChat article links when public web discovery is incomplete. Public discovery remains the default; browser access must not export or persist cookies, bypass verification, inject into the WeChat client, or continue automatically after a permission boundary is encountered.

## Consequences

- Verification challenges and permission boundaries create items in the Intervention Queue rather than triggering bypass attempts.
- Browser-assisted collection must be explicitly observable, pausable, and auditable.
- Authentication material remains owned by the browser and is never treated as MediaHunter application data.
