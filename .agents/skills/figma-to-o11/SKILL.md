---
name: figma-to-o11
description: Implement a selected Figma frame in an authorized OutSystems 11 Test Module using Codex, then validate the published screen and repair measured mismatches with the repository harness.
---

# Figma to O11 with Codex

Use this entry point for Codex. Read the config and [execution guide](../../../setup-docs/figma-to-o11.md), then [evidence contract](../../../setup-docs/harness-evidence.md) for the phase you enter. The upstream [OML skill](../../../servicestudio-mcp-oml/SKILL.md) remains the live API authority. Repository integration work alone does not authorize live writes or publication.

## Bind this session

Use the trusted repository's `.codex/config.toml` MCP registrations and `.codex/hooks.json`. In `/hooks`, verify both project hooks are enabled and trusted. Use the workflow session ID supplied by the actual SessionStart hook; never invent one or borrow a Claude binding. If this session cannot load the hooks or expose their MCP tool coverage, continue design/preparation only and report the missing capability before O11 writes. A script fixture test is not proof of an active hook in this session.

Read the config's exact Test Module and obtain fresh `listOpenModules` or legacy `listApps` evidence using the single approved Service Studio token. Save only the parsed modules/apps payload, without the token, to an ignored local file. Run `npm run harness -- resolve-module <config> <discovery.json>` to fill the module key automatically. This needs one open, non-reference match by the user-confirmed name; ask on ambiguity. Never edit a pinned key to bypass a mismatch. Resolve before beginning a run; configuration is pinned afterwards.

Confirm the Test origin, screen and URL separately with the operator. A page link such as node `0:1` still needs discovery of the actual selected frame before generation. Run `npm run harness -- config <config>` and `npm run harness -- begin <config> <workflow-session-id> codex`. Keep the returned run ID. This binds only this Codex session to the shared guard. Do not change targets within a run. For early contract 1 without selection metadata, retain the observed rows and record the operator's actual choice in `identity.operatorSelectedAddress`; never fabricate `isSelected`.

## Execute the shared workflow

Load each existing phase skill when needed; their instructions and evidence formats are shared with Claude:

- [figma-inspect-map](../../../.claude/skills/figma-inspect-map/SKILL.md): selected frame, actual PNG, dependency inventory, canonical native mapping and screen plan. Load the connected Figma design-to-code guidance before `get_design_context`. Resolve blocked mappings before generation.
- [o11-test-ui](../../../.claude/skills/o11-test-ui/SKILL.md): scoped reads, explicit authorization, generate gate, owned edit session, mutation/readback, approved merge, closure and accepted-live readback. Use native MCP tools so the actual calls pass through the trusted project hook. Keep the request envelope and exact verified merge path. Never call writes through shell HTTP or disable the hook to bypass a denial. Publish only after explicit authorization for the named Test Module and the publish gate.
- [o11-browser-review](../../../.claude/skills/o11-browser-review/SKILL.md): after confirmed publication, inspect the fresh page with Playwright MCP and run the deterministic harness.
- [o11-ui-repair](../../../.claude/skills/o11-ui-repair/SKILL.md): only on a measured failure with decision.action=repair; retain the design baseline and refresh release evidence.

All run commands use `npm run harness -- <command> <config> <run> [args]`. Keep tokens and signed URLs outside config/evidence. Never obtain a second Studio token on resume or reconnect. Config flags alone do not grant merge or publication permission. Preserve existing user authorization and manual approval settings.

Record actual evidence, timings and available counters under `reports/<run>/`. On a blocker, use the documented `stop` command. Report the module/screen, design revision, actual model/merge/publish/browser statuses and run artifact links. Distinguish local fixture PASS, installed integrations, active hook verification and real published runtime fidelity.
