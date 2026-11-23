# Harness architecture

Codex or Claude drives Figma, Service Studio and the inspection browser. The TypeScript CLI validates inputs, processes PNGs, evaluates gates, runs Playwright Test and records evidence. Service Studio owns the Model API sidecar, authorization dialogs, working OML, merge and publication. Upstream API signatures and examples remain under servicestudio-mcp-oml. The extension's integration surface is the published MCP contract.

| Path | Responsibility |
| --- | --- |
| .claude/skills/figma-to-o11 | Slash command, stage routing, session-bound PreToolUse hook |
| .agents/skills/figma-to-o11 | Codex entry, explicit session binding and reuse of the shared phase skills |
| .codex/config.toml, hooks.json; harness/codex-hook.mjs | Project MCP registrations, trusted SessionStart context and PreToolUse checks for bound Codex sessions |
| .claude/skills/figma-inspect-map | Frame acquisition, design manifest, dependency-backed mapping |
| .claude/skills/o11-test-ui | Native generation, scoped readback, merge and explicit Test Module publication |
| .claude/skills/o11-browser-review and o11-ui-repair | Published UI inspection, repeatable assertions and targeted corrections |
| .mcp.json | Project registrations for Figma, Service Studio and Microsoft Playwright |
| config/ | Validated example config and canonical component registry |
| harness/config.ts, design.ts, mapping.ts | Run inputs, versioned design cache, normalized frame and mapping candidates |
| harness/module.ts | Resolve the configured module name to one open key without guessing or changing an existing pinned identity |
| harness/gates.ts, guard.ts, claude-hook.mjs | Phase decisions, module identity and direct outgoing O11 write checks |
| harness/browser.ts, visual.ts, published.* | Freshness, assertions, screenshot capture, pixel comparison and component reports |
| harness/run.ts, io.ts, cli.ts, readiness.ts | Attempt history, reporting, command dispatch, non-mutating MCP discovery |
| tests/ | Unit cases, protocol checks and disposable browser fixture |
| reports/, .harness-cache/ | Ignored local run evidence, session bindings and design/mapping cache |
| verification/, setup-docs/ | Dated local readiness and operating instructions |

## Evidence across a run

A fresh run binds configuration and the chosen client's session in a separate client namespace. Each generation gate checks the selected open row (or an explicit operator choice on early contract 1 with no selection metadata), stable module key, unique address, operator-confirmed origin, scoped inventory and mapping. Claude's skill-scoped hook and Codex's project hook for bound sessions share the actual tool-argument guard. Neither changes the request or grants Studio permission. The merge gate requires a saved path, error-free validation and a semantic change in the named element. The publish gate requires successful merge, session closure, accepted readback and explicit publication authorization. Approved calls still go through Studio's own permission checks. Local hook fixtures verify adapter behavior, not native hook coverage in every Codex surface.

The browser reads the version-specific marker at the exact Test URL in a new context with DPR 1. Capture waits for font loading and image readiness, uses reduced motion, disables animations for screenshots and checks browser health. The operator supplies stable data and confirms source assets/fonts. Assertions measure frame-relative geometry, computed styles, image decoding, horizontal overflow and specified interactions. Full-frame PNGs capture spacing, icons and other differences beyond the sampled DOM properties. Each configured viewport needs its own source frame to establish visual fidelity at that size.

The local comparison box-filters integer-scaled Figma exports to logical dimensions. Dimension mismatch or missing reference yields REVIEW_REQUIRED. Justified dynamic masks are excluded from the pixel denominator. Pixelmatch counts differing pixels using the configured tolerance and includes antialiasing. Pixel fraction and bounding-box tolerances are independent. Component checks use actual CSS values or pixel distances. Reports retain actual/reference/difference/overlay PNGs, per-area statuses and thresholds in the run's pinned configuration. Missing or inaccessible deployment evidence blocks or qualifies the outcome.

Repairs retain the original design, locate a mapped node, recheck affected elements, and repeat the full configured regression. Each completed validation produces an immutable outcome. A comparable reduction in failed check count or differing pixels permits another attempt up to the configured ceiling. A new baseline, incomparable result, lost authorization or unrecoverable missing prerequisite stops the run.

## Cost and performance

Frame bundles are indexed by file key, selected node ID, schema version, trusted revision and export scale. Unknown revisions require reacquisition. Content digests verify cached evidence. Mapping cache keys include the manifest's mapping inputs, registry and current module-specific inventory. Use compact reads and keep raw Figma trees, large screenshots and browser logs on disk. Acquire one frame image per revision/scale, one deterministic screenshot per active viewport per attempt, and only the referenced Model API documentation. Recheck live module identity at write boundaries. A module-wide baseline audit is unnecessary.

The runner measures validation wall time and pixel counts. Claude can record observed service calls, generation/publish duration and token use. Unknown counters are null. Fixture measurements exercise the local control path and image operations; live performance depends on the selected design, Studio, browser environment and deployment.
