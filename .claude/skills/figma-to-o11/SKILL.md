---
name: figma-to-o11
description: Generate one selected Figma frame in an explicitly authorized O11 Test Module and validate its published screen. Start from a harness JSON config.
argument-hint: "<config-file>"
hooks:
  PreToolUse:
    - matcher: "mcp__servicestudio__(applyModelApiCode|startOmlEditSession|endOmlEditSession|oml.*|openModule|closeModule)$"
      hooks:
        - type: command
          command: 'node "${CLAUDE_PROJECT_DIR}/harness/claude-hook.mjs"'
---

Treat $ARGUMENTS as the path of one existing config file. Read it as data. Run from the project root. Refuse additional targets or environment changes within a run. Use the supported project MCP registrations and keep the same Claude session throughout. In /hooks verify this skill's PreToolUse hook is active before any O11 write.

1. Run `npm run harness -- config <config>` then `npm run harness -- begin <config> ${CLAUDE_SESSION_ID}`. Keep the returned run ID. All further CLI calls are `npm run harness -- <command> <config> <run> [args]`. Artifacts belong in `reports/<run>/`. Use [the evidence contract](../../../setup-docs/harness-evidence.md) for exact file shapes. Start the performance counters when calls are observable.
2. Inspect the live tool descriptions for each integration. Standalone doctor is optional. Confirm the selected Test Module name, key, Test environment, screen and published URL with the operator. Obtain the real write authorization for this run. Follow the official session-token and contract procedure in `servicestudio-mcp-oml/SKILL.md` before your first Studio tool call. Work in the operator's selected open Test Module.
3. Load the project skill `figma-inspect-map`. Obtain the design bundle and dependency-backed mapping. Use `o11-test-ui` for scoped inspection, generation, model validation and release. Load each SKILL.md from .claude/skills when entering its phase, continuing in this conversation. Keep the contract-bearing upstream skill as the source of truth.
4. After successful publication load `o11-browser-review`. Run a full final regression for every eligible attempt. On a measured failure run `decision`. Follow `o11-ui-repair` only on action `repair`, then repeat the guarded release and validation steps.
5. Report the actual terminal status, Test Module and screen, design revision, per-viewport results, attempt count, open defects and links to the run index and JSON. Record observed counters and timings in performance.json before final validation or stop. For a blocker before validation use `stop <config> <run> <status> <reasonCode>` as documented. Gate PASS is local permission to advance a phase. Claim a validated deployment only from the completed browser report.

Use native MCP calls in this session for every write. Keep the hook active for the workflow. If a tool wrapper cannot carry the official input envelope, stop with BLOCKED and report the affected capability. Never put tokens, cookies, headers, storage state, raw browser logs or signed asset URLs into evidence. Keep screenshots and designs in the ignored local run directory.
