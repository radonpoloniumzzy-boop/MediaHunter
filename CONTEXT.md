# MediaHunter Content Intelligence

MediaHunter supports the continuous collection, analysis, and operational use of public content intelligence for owned media accounts.

## Language

**Content Intelligence Platform**:
MediaHunter, the authoritative home for sources, collected articles, benchmark evidence, analysis results, and topic candidates.
_Avoid_: crawler, article folder, Skill database

**Operations Skill**:
A Codex workflow that reads from and acts through the Content Intelligence Platform to produce research, analysis, and operating recommendations. It is not the authoritative store for collected content.
_Avoid_: standalone scraper, article archive

**MediaHunter Entry Skill**:
The single user-facing Operations Skill that routes natural-language requests to Daily Intelligence, Weekly Operations, or Project Research workflows.
_Avoid_: separate data source, workflow-specific command list

**Benchmark Account**:
A WeChat Official Account tracked continuously because its articles provide useful comparison evidence for the owned account.
_Avoid_: competitor, copied account, generic information source

**Trend Source**:
A public GitHub project, official blog, or web page monitored for timely topic signals. It informs topic discovery but is not treated as a benchmark account.
_Avoid_: benchmark account, copied source

**Browser-Assisted Discovery**:
Article discovery performed through the user's existing authenticated browser session when public discovery is insufficient, without exporting or retaining authentication credentials.
_Avoid_: credential scraping, unattended account takeover, client injection

**Intervention Queue**:
Collection work that requires a user decision or verification because automatic access reached a permission, validation, or ambiguity boundary.
_Avoid_: failed task, ignored error

**Content Sample**:
A collected article selected as evidence for comparison, pattern analysis, or topic development.
_Avoid_: copied article, writing template

**Content Snapshot**:
An internal, time-stamped capture of an article's cleaned text, necessary source HTML, structure, and image references retained for traceability and analysis.
_Avoid_: republishable copy, downloaded media archive

**Source Tombstone**:
The minimal provenance and audit record retained after source content is removed, without keeping the removed body available for new analysis.
_Avoid_: hidden content copy, active evidence

**Benchmark Evidence**:
Observable content facts from benchmark articles, including text, structure, publication timing, and recurring themes. Unavailable engagement metrics are not inferred as facts.
_Avoid_: estimated readership, assumed virality

**Owned Performance Data**:
Performance metrics exported from the user's own WeChat Official Account, used to validate whether observed content patterns work for the owned audience.
_Avoid_: benchmark metrics, guessed performance

**Owned Account**:
A WeChat Official Account whose positioning, audience, benchmark set, performance history, and operating recommendations are managed by the user. Public intelligence may be shared across Owned Accounts, but account strategy and performance remain isolated.
_Avoid_: benchmark account, client project, login identity

**Default Owned Account**:
The Owned Account used when a recurring intelligence or planning request does not explicitly name an account.
_Avoid_: global account, shared strategy

**Performance Snapshot**:
An immutable set of owned-account article metrics imported from a WeChat backend export at a recorded time, preserving how performance was known when an analysis was produced.
_Avoid_: live competitor metric, overwritten article total

**Daily Intelligence Brief**:
A concise daily view of newly collected benchmark articles, changing topic signals, repeated themes, and candidates worth investigating.
_Avoid_: raw collection log, daily operating plan

**Weekly Operations Plan**:
An evidence-backed plan combining owned performance, benchmark movement, topic opportunities, and the next week's proposed publishing work.
_Avoid_: weekly article dump, unsupported summary

**Intelligence Schedule**:
The configurable cadence for continuous incremental collection, a Daily Intelligence Brief at 08:30 China Standard Time, and a Weekly Operations Plan at 16:00 each Friday by default. Both reports may also be run on demand.
_Avoid_: fixed system clock, report-only collection

**Local Collection Agent**:
The MediaHunter runtime on the user's Windows computer that owns browser-assisted discovery and other work requiring local authenticated state.
_Avoid_: remote credential store, WeChat client injector

**Research Project**:
A time-bounded client or internal assignment that gathers evidence and produces a content strategy for a specific business situation.
_Avoid_: track, chat session, recurring monitor

**Project Brief**:
The agreed description of a Research Project's business context, change or launch event, audience, communication objective, constraints, and expected deliverables.
_Avoid_: article prompt, raw client message

**Brief Intake**:
The guided process that converts a free-form request into a Project Brief, asks only for material missing decisions, and obtains confirmation before research begins.
_Avoid_: immediate search, generic questionnaire

**Project Evidence**:
A project-specific selection of shared sources, accounts, articles, and observations together with their relevance to that Project Brief.
_Avoid_: duplicate article, global conclusion

**Research Profile**:
A configurable target for the breadth and depth of project discovery: Quick Scan, Standard Study, or Deep Study. Target counts guide collection but do not override evidence quality or saturation.
_Avoid_: fixed scrape quota, report length

**Evidence Saturation**:
The point at which additional collection no longer reveals materially new account types, content themes, or presentation patterns for the Project Brief.
_Avoid_: maximum article count, collection timeout

**Research Checkpoint**:
A deliberate pause for user review when research depth, regulatory risk, low confidence, or divergent benchmark directions make autonomous continuation unreliable.
_Avoid_: routine approval step, collection failure

**Research Workpaper**:
The internal, traceable record of collected accounts, articles, evidence links, exclusions, analytical labels, inferences, and uncertainty for a Research Project.
_Avoid_: client report, raw article dump

**Client Strategy Plan**:
The curated, client-facing recommendation that turns Project Evidence into positioning, messaging, content pillars, formats, topics, cadence, and risk controls.
_Avoid_: shortened workpaper, unsupported presentation

**Project Workspace**:
The authoritative interactive view of a Research Project's brief, progress, evidence, analyses, checkpoints, and current deliverables.
_Avoid_: exported report, chat transcript

**Project Export Package**:
Portable representations of approved project material: Markdown and XLSX for the Research Workpaper, plus Markdown, DOCX, and a structured slide outline for the Client Strategy Plan.
_Avoid_: second source of truth, automatically maintained PDF

**Approved Deliverable**:
A version of a Weekly Operations Plan or Client Strategy Plan explicitly accepted by the user and protected from silent replacement by later analysis.
_Avoid_: latest generated draft, automatically refreshed report

**Content Analysis Card**:
The shared set of analytical dimensions applied to every Content Sample so patterns can be compared across accounts and projects.
_Avoid_: article summary, project-specific prompt output

**Project Analysis Extension**:
Additional analytical dimensions derived from a confirmed Project Brief to capture industry, product, audience, or compliance questions that are not universal.
_Avoid_: replacement analysis schema, unstructured notes
