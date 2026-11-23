# Codex Figma-to-O11 integration

Verified locally on Windows on 2026-11-23 with Codex CLI `0.171.0-alpha.13`. Repository integration and local fixtures PASS. A published O11 screen generated through the Codex workflow is NOT_RUN.

## Changes

- Added the discoverable `.agents/skills/figma-to-o11` entry, reusing the existing four phase skills and canonical mapping/evidence formats.
- Added project-local MCP registrations and SessionStart/PreToolUse hooks. Codex and Claude bind runs in separate client namespaces and share the same target, phase, ownership and exact merge-path checks. Unbound Codex sessions are unaffected; the workflow requires binding before its writes.
- Added `resolve-module <config> <discovery.json>` so the agent fills the placeholder key from exactly one open, non-reference row for the configured name. Duplicate, missing and changed pinned identities are rejected.
- Added an explicit operator-choice field for early `listApps` catalogs without selection metadata; no synthetic selection flags are needed.
- Corrected the shared guard to preserve the actual C# code and path arguments rather than trimming them before validation.
- Updated only the ignored local run config with the supplied Figma page link and the freshly discovered target key. Merge/publication settings remain false; no authorization was inferred.

## Evidence

| Check | Outcome |
| --- | --- |
| `npm.cmd test` | PASS: TypeScript, 29 unit tests and 8 integration tests; 8 integration tests completed in 52.3 seconds |
| Codex hook fixture | PASS: separate binding, wrong target, ownership, malformed lambda, stale merge path, premature publication, unsupported operation and malformed binding; valid requests retain native permissions |
| Configured hook command | PASS: invoked with redirected stdin from a repository subdirectory through Windows cmd and PowerShell |
| Skill creator validator and local Markdown links | PASS |
| `codex mcp list --json` | PASS: figma, playwright and servicestudio enabled in project configuration; this is configuration discovery, not authenticated connection proof |
| Real Codex app-server `skills/list` | PASS: `figma-to-o11` discovered and enabled from `.agents/skills/figma-to-o11/SKILL.md`, zero skill errors |
| Real Codex app-server `hooks/list` | Both project hooks discovered and enabled, zero hook errors; actual trust status `untrusted` |
| Live Service Studio target discovery | PASS: `Demo_TH_Fabric` uniquely matched as an open Reactive module; key resolved into ignored `harness.local.json` |
| Local config structural validation | PASS; the Figma URL still identifies page `0:1`, so the actual frame must be discovered after authentication |
| Figma connector in this conversation | NEEDS_APPROVAL: OAuth connection still unavailable on the latest check; no design bundle was acquired |
| Native Codex hook interception of real O11 writes | NOT_RUN: hooks need operator trust and a session where SessionStart runs |
| O11 UI mutation, merge, publication and live browser fidelity for this workflow | NOT_RUN |

The control-protocol check initialized Codex and listed skills/hooks without creating a model turn, obtaining another Studio token, trusting hooks or writing to an O11 module. Its compact output is in ignored `.harness-cache/codex-discovery.json`. Existing user changes and the upstream `servicestudio-mcp-oml/` content were preserved.

## First run

Follow [Codex setup](../setup-docs/figma-to-o11.md#codex-setup). Review and trust the two project hooks in `/hooks`, authenticate Figma for the selected Codex connection, then start or resume a session so SessionStart supplies the real session ID. Invoke `$figma-to-o11 harness.local.json`. The workflow must verify the actual frame, Test origin, screen/URL and requested interactions before generation. Publication still requires explicit operator authorization.

The native hook adapter follows the current [Codex hook contract](https://learn.chatgpt.com/docs/hooks). Fixture PASS does not prove native tool coverage in every client surface; the entry skill requires that verification before live workflow writes.

