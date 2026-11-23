# Figma-to-O11 evidence contract

Run commands from the repository root. The CLI takes `<command> <config> <run> [arguments]`. The exceptions are `config <config>`, `doctor <config>` and `begin <config> [Claude-session-id]`. The entry skill supplies the session ID. Initialization returns a new run UUID and pins the config hash. Keep one writer per run. Use a fresh run after changing the target, comparison thresholds, validation policy or configuration. Resume approval in the same attempt. A new run requires its own scope confirmation.

For Codex, use `begin <config> <workflow-session-id> codex`, with the actual ID supplied by the trusted SessionStart hook. Bindings are stored separately under `.harness-cache/codex/`; Claude's existing command and bindings remain supported. Before `begin`, `resolve-module <config> <discovery.json>` fills the config's module key from one uniquely matching open row in the parsed `apps` or `modules` result. A different already-pinned key is a scope error. This file must not contain the session token or authorization envelope.

## Design and mapping

The first configured viewport uses figma.frameUrl unless it has its own frameUrl. Additional viewports need a frameUrl for an independent design comparison. Match the Figma frame's logical dimensions at its intended viewport. Set the desired export scale before acquisition.

- `reuse … <view> <known-revision>` restores a cached reference and manifest when the file key, frame ID, schema, export scale and revision match. Check the returned hit flag.
- `import … <view> <selected-node.json> <real.png> [revision]` validates frame identity and PNG dimensions. Supply a Figma node with id, type, name, absoluteBoundingBox and children. Retain observed standard node fields, including componentProperties, style, fills, layoutMode and boundVariables. Alternatively pass an object containing document (the selected node), components, componentSets, styles, variables, assets, responsiveVariants and assumptions. Optional collections can be omitted. Component dictionaries map IDs to objects with name and optional componentSetId. Variables map IDs to name and scalar value or null. Asset entries contain nodeId, name and localFile or null. Responsive entries contain frameId and width. Assumptions are strings.
- `rest … <view>` fetches only that selected node and its PNG. It pins the image request to the returned version. This command requires mcp-with-rest-fallback and FIGMA_ACCESS_TOKEN. Signed image addresses stay in memory.
- `map … <view>` joins the canonical registry to the current run's inventory.json. Inventory has moduleKey, available (verified registry targets and dependency names) and optional nodeKinds (node ID to registry alias). For composite labels such as Input + Label, verify both members before recording availability. An unrecognized node or unavailable target produces BLOCKED. Add a verified project mapping to the canonical registry when necessary. Refresh inventory on dependency changes. Read mapping.json for unresolved node IDs.

The resulting design/<view>/ contains manifest.json, reference.png, integrity.json and mapping.json. The manifest has source IDs, parent IDs, frame-relative boxes, component properties, available design metadata, revision and scale. Store only the selected design's assets under the run. Record unsupported values and alternate states in design notes. A file without revision evidence stays usable for the current capture only.

## Attempt evidence

Claude creates `attempt-0/evidence.json` and adds only the fields it has actually observed. Use `attempt-1`, `attempt-2`, etc. for repairs. The CLI gate arguments are `gate … generate|merge|publish|browser`. Exact executable types are in [gates.ts](../harness/gates.ts). [Local fixtures](../tests/fixtures/data.ts) show complete shapes with deliberately synthetic values.

| Object or field | Evidence required |
| --- | --- |
| identity | tabs from fresh discovery, discovery verb listApps or listOpenModules, address, confirmedTestModule, confirmedTestOrigin, screen, endpoint. Keep name, key, tabId when present, isOpen, isSelected, isReference and moduleType. Confirm the Test environment separately in Studio. A legacy name address requires an unambiguous open row. |
| identity.operatorSelectedAddress | Only for early listApps catalogs where every open, non-reference row lacks tabId and isSelected: the exact unique module name explicitly chosen by the operator. Preserve the observed rows; do not fabricate selection flags. This cannot override actual selection metadata or a duplicate name. |
| preflight | dependenciesVerified, scopedReadComplete, writeAuthorized and ownSessionOrIdle. Each true value records an actual completed check. Inspect existing edit-session ownership before starting. |
| sessionOwned | Set true only after this run successfully starts its private edit session. Set false after its confirmed close. |
| mutation | address, screen, mutatedOmlPath, exceptionMessage, validationMessages, readbackValidation, beforeHash, afterHash, readbackName and expectedChangesPresent. Use type-only summaries for message arrays. Hash the same ordered semantic fields before and after with SHA-256 in lowercase hex. Include actual widget names, property values, parentage and bindings for the planned changes. Keep identifiers stable and exclude working-copy paths/timestamps from the hash. |
| mutation.legacyThemeCompatibility | Optional documented contract 1 exception: contract=1, themeName, themeStyleSheetEdited=true, iconLibraryUntouched=true and initialIconLibrary=null, backed by the actual model reads and mutation. Preserve id/ownerType/ownerPath on messages. Only Error / InvalidIconLibrary on IMobileTheme at that exact theme path is exempted, following upstream SKILL.md section 3.1. Every other Error blocks. Retain the raw error in evidence and report the compatibility exception rather than claiming error-free validation. Never set Theme.IconLibrary to suppress it. |
| mergeAuthorized, mergeReviewed | Explicit scope and manual review evidence for this attempt. Record approval source/time in local notes. Manual review is required when configured. |
| merge | address, exact mutatedOmlPath supplied to merge, actual merged boolean, sessionEnded from successful closure, acceptedReadbackMatches from scoped accepted-live screen readback. |
| publishAuthorized, publishReviewed | Explicit operator authorization to publish the named Test Module and manual review when required. A config flag alone cannot grant it. |
| publish | address, actual published boolean and status, confirmed screenUrl. Preserve a denied result. |
| freshness | selector, attribute, previous and expected. Obtain expected from deployment evidence. Verify previous independently on the pre-publish page. For a genuinely new screen, previous may be null with documented evidence of absence. Each repair must advance the marker again. |
| browserInspection | After the browser gate, record screenUrl, observedMarker, status and checks (compact observations) from actual Playwright MCP inspection. Resolve or encode observed defects in the deterministic plan. |

A suitable marker is an existing runtime element carrying a release-specific version, or an explicitly planned screen attribute with a unique value for this attempt. The browser must observe it at the configured URL. A page title, load time, successful HTTP response or arbitrarily chosen value from the newly opened page cannot establish freshness. When no independent marker is available, report REVIEW_REQUIRED. The fixture's data-build is an example of this protocol.

The entry skill installs a scoped PreToolUse hook. The hook compares the outgoing MCP eSpaceName, owned session, phase evidence and exact merge path. A valid call proceeds to normal Claude and Studio permissions. Reports contain evidence supplied by the agent. This hook assumes a trusted operator, local files and the documented Claude invocation. Edit files only to reflect fresh observations. A matched hook with an invalid binding denies the call.

The Codex entry instead uses the trusted project SessionStart/PreToolUse hooks. SessionStart supplies the session ID; `begin ... codex` activates checks for that session. Before binding, the project PreToolUse hook abstains so unrelated OML tasks are unaffected. Once bound, malformed bindings, missing evidence or mismatched calls return an explicit Codex JSON denial. A valid request returns no permission override and still passes normal Codex/Studio permissions. Codex hook errors/timeouts and specialized tool paths are not a complete enforcement boundary: verify active hook coverage before using the workflow and stop when it is unavailable. Never record a synthetic invocation as proof of a real intercepted MCP call.

## Repeatable browser checks

Create `plans/<view>.json` per active viewport. Use independent Figma expectations and existing stable O11 selectors. [visual.ts](../harness/visual.ts) defines supported fields. For example:

```json
{
  "readySelector": "main",
  "stableData": true,
  "fontsAvailable": true,
  "assetsAvailable": true,
  "elements": [{
    "id": "1:3", "selector": "[data-design-id='primary']",
    "box": {"x": 24, "y": 32, "width": 120, "height": 40},
    "style": {"fontFamily": "Arial", "fontSize": "16px", "backgroundColor": "rgb(10, 20, 30)"}
  }],
  "inapplicable": {"assets": "The selected frame contains text and solid fills only"},
  "masks": [],
  "steps": [{"action": "click", "selector": "[data-design-id='primary']"}, {"action": "visible", "selector": "[role='dialog']"}]
}
```

Supported element properties include box, style and image. Image checks apply to actual img elements. CSS comparisons use computed browser strings. Add size, weight, line height, alignment, color, border, radius, shadow, gap or padding when required. Leave unknowns visible. A missing required coverage area without a justified exemption yields REVIEW_REQUIRED. For dynamic exclusions provide box and reason. Base the box on agreed design coordinates. A mask spanning the full viewport is inconclusive. Add masks only for genuine nondeterminism.

Functional steps support click, fill, select, scroll, visible, text and url. Enable only required behavior. Specify at least one expected visible/text/URL outcome when enabled. Same-origin navigation is supported. Use stable test records and a correctly authenticated browser session. Set O11_BROWSER_STATE to an external storage-state file when the operator has provided one. Use a trusted Test Module account in Playwright MCP as well. Keep real credentials and storage state outside the run.

`validate …` starts Playwright Test against the published URL. It captures the viewport before interactions. A nonzero exit requires inspecting report.json. Every completed attempt gets per-viewport metrics.json and index.html, plus normalized reference, actual, difference and overlay PNGs when comparable. Actual capture and the inconclusive reason remain available when there is no matching reference. The top-level report distinguishes gate state from completed validation.

## Repairs and reporting

`decision …` returns stop, repair or validate. On repair, write the next attempt's repair.json with viewport, failedId, nodeId, o11Element, cause and correction. failedId must occur in the previous viewport's failed checks and nodeId in its verified mapping. Recreate evidence from the fresh attempt. The runner rechecks the affected known elements first and runs every configured viewport again. The controller compares failed-check counts and differing pixels against the preceding attempt under the same plan/reference. A terminal result or exhausted limit prevents further generation.

`stop … <status> <reasonCode>` records a blocker before browser validation or a required user decision. Status may be BLOCKED, NEEDS_APPROVAL, REVIEW_REQUIRED, FAIL or NOT_RUN. Reason codes are reference, capability, dependency, scope, model, merge, publish, deployment, user-decision, browser and configuration. NEEDS_APPROVAL can resume on fresh authorization. Record the specific non-sensitive evidence in the run notes.

Optional run-level performance.json has figmaMcpCalls, o11McpCalls, playwrightMcpCalls, generationMs, publishMs and tokens. Supply a nonnegative integer or null for each field. Count only observed calls. Validation milliseconds, completed attempts, repairs and pixel counts are computed locally. Report generation leaves unavailable counters null.
