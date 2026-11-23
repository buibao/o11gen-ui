# Figma-to-O11 harness readiness

Verified on Windows on 2026-11-23 in the checkout based on upstream commit `8cdd94f`, with Node v22.16.0, npm 10.9.2 and Claude Code 2.1.328. **Local implementation PASS. Published O11 end-to-end validation NOT_RUN.** Setup made zero O11 application tool calls. Studio contact consisted of MCP initialization and catalog discovery.

## Commands and evidence

| Check | Outcome |
| --- | --- |
| npm.cmd ci --no-fund | PASS, installed 110 packages from the lockfile. npm reported zero known vulnerabilities at installation time. |
| npx.cmd playwright install chromium | PASS, installed the Chromium build required by Playwright Test. |
| npm.cmd run harness -- config config/harness.example.json | PASS, strict configuration and registry validation. |
| npm.cmd test | PASS, TypeScript check, 27 unit tests, six Playwright integration tests. Zero skipped or failed. Unit suite 1.21 s, Playwright suite 27.1 s. |
| npm.cmd run harness -- doctor config/harness.example.json | Aggregate nonzero. Figma NEEDS_APPROVAL, Service Studio catalog PASS, Playwright catalog PASS. |
| Claude Code local control-protocol initialization, project settings, strict MCP config, no model prompt | PASS, command discovery returned figma-to-o11, figma-inspect-map, o11-test-ui, o11-browser-review and o11-ui-repair. |
| Claude hook process with synthetic PreToolUse events | PASS in the integration suite for wrong address, session ownership, phase, merge path and replay checks. Live Studio invocation through Claude remains NOT_RUN. |
| Codex-specific skill-creator frontmatter validator | Accepted four auxiliary skills. Its Codex key list rejects Claude's argument-hint and hooks on the entry skill. Claude Code registered that entry skill with both fields present. |
| Repository checks | git diff --check passed. All local links in five skill files and four operating guides resolved. Generated reports, caches and local config are ignored. No changes under the official skill, AGENTS.md or upstream installer scripts. |
| Upstream OML effectiveness/real-module scenarios | NOT_RUN. They require the external evaluation environment or an authorized live module session. |

[Full local command output](../reports/local-tests.txt) and [catalog discovery](../reports/readiness.json) are generated local files. Run the commands above to reproduce these artifacts in another checkout.

## Unit cases

- PASS — blocked publish has no confirmed screen URL; disabled validation needs no deployment marker
- PASS — readiness distinguishes unavailable transports, OAuth and discoverable catalogs
- PASS — strict configuration, selected Figma frame and permission defaults
- PASS — frame-relative geometry, source ordering, component metadata and hidden elements
- PASS — reference acquisition verifies PNG, cache revision and scale
- PASS — scoped REST fallback pins PNG revision and keeps credentials on the API origin
- PASS — canonical registry rejects ambiguity, missing inventory and unknown mappings
- PASS — wrong selected key
- PASS — no Test Module
- PASS — several selected windows
- PASS — missing OSUI dependency
- PASS — wrong environment
- PASS — Model API exception
- PASS — sidecar empty path
- PASS — silent no-op
- PASS — silently renamed
- PASS — TrueChange error
- PASS — merge approval withheld
- PASS — rejected merge
- PASS — stale merge path
- PASS — publish authorization missing
- PASS — publish blocked
- PASS — stale deployment
- PASS — incorrect screen URL
- PASS — contract 1 accepts uniquely resolved name only on listApps
- PASS — scale normalization, masks, artifact metrics and inconclusive comparisons
- PASS — repair controller stops at limit, no improvement, ineligible status and changed baseline

## Browser and workflow cases

| Fixture case | Result |
| --- | --- |
| Normal CLI launches Playwright Test, validates a fresh HTTP fixture, emits complete image and report artifacts | PASS |
| Independent desktop/mobile references and incomplete Playwright MCP inspection | PASS |
| Measured component defect, guarded targeted repair, changed deployment marker and full regression | PASS |
| Missing design reference, unavailable URL and stale deployment | PASS |
| Claude PreToolUse hook enforces target address, session, verified path and phase | PASS |
| Installed Microsoft Playwright MCP discovers browser tools, navigates a local HTTP fixture in Edge and returns its accessible button | PASS |

The repair fixture shifted one button eight CSS pixels. The first validation found two failed checks and 320 differing pixels in 268 ms. The second found zero failures and zero differing pixels in 261 ms. These measurements cover a 120 × 80 local fixture. [Fixture attempt history and visual artifacts](../reports/7422b757-477c-49cf-b6b7-168cad0831e9/index.html)

## Live readiness

| Integration | Verified | Remaining live prerequisite |
| --- | --- | --- |
| Official Figma remote HTTP MCP | Endpoint requested authorization from the standalone client. REST reference acquisition and revision binding passed with a local test double. | Authenticate in Claude and verify design context plus actual PNG retrieval for the operator's selected frame. Real Figma MCP extraction and REST acquisition are NOT_RUN. |
| Embedded O11 Service Studio MCP | Initialization and listing succeeded, 61 tools. listApps was advertised. The server and token description exposed no explicit contract number. The official skill's contract 1 fallback applies. | Obtain one approved session token. Verify the Test Module row/key/style, origin, references, write permission and fresh release signal. Model mutation, accepted-live readback, merge and publication are NOT_RUN. |
| Microsoft Playwright MCP and Playwright Test | MCP listed 25 tools. Edge navigation and snapshot on the fixture succeeded. Deterministic Chromium assertions, screenshots, PNG outputs and reports passed. | Authenticate the browser if necessary, then validate the freshly published Test URL at the configured sizes. Real runtime fidelity, browser health and functional behavior are NOT_RUN. |

No Figma frame, confirmed Test Module key, publish authorization or real published screen was provided for setup. Live generation/publish duration, call counts for a real workflow, token use and repair rate remain unmeasured. Follow the [Windows first-run guide](../setup-docs/figma-to-o11.md) for the first authorized execution.
