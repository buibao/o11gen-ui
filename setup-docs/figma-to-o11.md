# Run one Figma frame in an O11 Test Module

## Codex setup

This checkout includes the discoverable Codex entry skill at `.agents/skills/figma-to-o11/SKILL.md`, project MCP registrations in `.codex/config.toml` and project hooks in `.codex/hooks.json`. The entry reuses the four phase skills under `.claude/skills/`; their shared evidence, mapping and validation behavior has one source. No global Codex config or existing Claude setup needs to be overwritten.

Run `npm.cmd ci` if dependencies are absent and start Codex from this trusted repository root. In the CLI run `/hooks`, review and trust the SessionStart and PreToolUse project hooks. The portable Node command resolves the Git root without shell-specific substitution, so the hook script also works when the session later changes into a subdirectory. The actual SessionStart event supplies the workflow session ID. Use that ID when the skill begins the run:

```text
$figma-to-o11 harness.local.json
```

After first trusting the hooks, start or resume a session so SessionStart actually runs. The agent runs `npm run harness -- begin harness.local.json <workflow-session-id> codex`. Writes in that bound session go through the same phase and argument checks as Claude. Unbound sessions are unaffected, matching Claude's skill-scoped behavior; the Codex skill must bind before any workflow write. A missing, disabled or untrusted hook is a blocker for live workflow writes. Verify actual native MCP coverage in the target Codex surface; fixture tests alone do not establish it, especially for nested Code Mode tool calls. Do not use an HTTP or shell route to bypass a missing hook.

Authenticate the configured Figma MCP with `codex mcp login figma` if needed. A Figma connection in another client does not establish this connection. The current running session may need to reload its project integrations; after a fresh start verify `/hooks`, the skill and all three MCP catalogs before live work. This setup does not authorize a module merge or publication. [Codex hooks](https://learn.chatgpt.com/docs/hooks) describes trust and native tool coverage.

## What is moduleKey?

`testModule` is the readable module name. `moduleKey` is the module's stable unique identifier, returned as `key` by Service Studio discovery. It is not a password. The workflow requires it to check that the intended module is still the target before writing. The MCP call itself uses the open tab's `tabId`, or a uniquely resolved name on early contract 1; the key is the independent identity check.

You do not need to find or type the key yourself. Tell the agent the exact module name and let it save the fresh parsed `modules`/`apps` discovery result without the authorization envelope. Before beginning a run, it runs:

```powershell
npm.cmd run harness -- resolve-module harness.local.json .harness-cache/open-modules.json
```

This command fills the placeholder key only when exactly one open, non-reference row matches `testModule` and has a known style. It refuses absent or duplicate matches and a key that differs from an already pinned key. It does not choose a Test environment, infer publication authorization or contact Studio. Verify the environment separately. Run it before `begin`, because changing config invalidates an existing run.

Early contract 1 may return no selected-tab metadata. Record the operator's explicit target in `identity.operatorSelectedAddress` while preserving the actual discovery rows. Do not set `isSelected=true` on a row that did not report it. Newer catalogs still require one selected target and prefer its `tabId`.

## Windows setup

For the Claude Code path, use a Windows machine with Git, Node.js 22.16 or newer, Claude Code CLI, Microsoft Edge and O11 Service Studio. Launch Claude from this project root so it finds .mcp.json, the scoped hook and all five project skills. The upstream skill is read directly from this checkout. Its separate user-wide installer is optional.

```powershell
Set-Location D:\o11gen-ui\outsystems11-mcp
npm.cmd ci
npx.cmd playwright install chromium
Copy-Item config/harness.example.json harness.local.json
notepad harness.local.json
```

Edit the local config with the selected Figma frame URL, export scale, exact Test Module name and key, screen and canonical published Test URL. Replace all example values. Set viewports to the expected frame sizes. Add frameUrl to a viewport when Figma provides a corresponding variant. Set validation.enabled, .repair and the responsive/functional switches for this run. Default matching allows 1% different pixels at pixelmatch tolerance 0.08 and 2 CSS pixels of geometry deviation. Review these values against your design requirements before starting. Set allowTestModuleMerge and allowTestModulePublish to true only for an intended Test Module release. Keep requireManualApproval true for manual gates.

If the module key is unknown, open the Test Module in Studio, use the upstream contract in a Claude session to list open modules read-only, and copy the selected module's key into the config. Reuse that session's token if continuing in it. Confirm the Test environment and module in Studio. If the endpoint differs from the default, set both the environment variable O11_MCP_ENDPOINT and outsystems.mcpEndpoint to the same URL before launching Claude. For Firefox or WebKit deterministic tests, also install the selected browser with Playwright. The MCP registration uses installed Edge independently.

```powershell
npm.cmd run harness -- config harness.local.json
npm.cmd test
npm.cmd run harness -- doctor harness.local.json
claude
```

Trust the checkout and approve the project MCP registrations when prompted. In Claude, open `/mcp`. Authenticate the remote Figma server using its offered OAuth flow and check access to the chosen frame. Enable the Service Studio MCP server and approve the session dialog when Claude requests it. Check the Microsoft Playwright MCP connection. Verify the project skills appear in `/skills`. Claude's OAuth session and the standalone doctor's unauthenticated HTTP process are independent. The doctor writes reports/readiness.json and may still report NEEDS_APPROVAL for Figma after Claude signs in.

Use a local Figma REST token only if MCP cannot deliver the selected-node data or PNG and accessMode permits fallback. Supply FIGMA_ACCESS_TOKEN through a secure environment mechanism before starting Claude. For an existing Test login, provide O11_BROWSER_STATE as an absolute path to a private, external Playwright storage-state file if needed. Browser sessions for interactive MCP and deterministic tests are separate. Keep usernames, tokens, cookies, signed URLs and passwords out of configs and reports.

## First live execution

1. Choose one frame and its actual reference export. Open only the intended Test Module as the selected target. Confirm the environment, module key, screen and URL. Specify the expected functional interactions, applicable design breakpoints, stable test data and fonts.
2. In the Claude Code session enter the following project skill command.

   ```text
   /figma-to-o11 harness.local.json
   ```

3. Claude registers the run, reads the selected design, records available dependencies, and maps native widgets, referenced patterns, blocks and styles. Resolve any BLOCKED component in the local mapping report. Review the scoped screen plan, including how its publication can be identified independently in the browser.
4. Authorize the specific Test Module edit. Approve Studio's session dialog. Claude uses the matching read verbs, starts its own edit session, applies the scoped Model API changes and verifies the modified model. Review the pending changes and grant the requested merge permission. The merge must return success. Claude ends its session and checks the accepted screen.
5. Explicitly authorize publication of that Test Module. Grant Studio's write permission if appropriate. Claude verifies the publish result, URL and new deployment marker. A withheld permission is NEEDS_APPROVAL. If the browser cannot verify this deployment, resolve freshness before interpreting visual results.
6. Claude uses Playwright MCP to inspect the real page, then runs Playwright Test for screenshots, metrics and requirements. For each measured failure it can take up to three scoped repairs by default. Each repair needs fresh model, merge, publish and marker evidence. Open `reports/<run>/index.html` for results and `reports/<run>/report.json` for status, attempt history and timings.

The [evidence guide](harness-evidence.md) covers commands, inputs and output fields. The [architecture](harness-architecture.md) explains validation and caching. See [troubleshooting](harness-troubleshooting.md) for blocked and inconclusive results.

## Integration references

The project registers the official Figma remote HTTP endpoint and Microsoft's pinned stdio package. Consult the vendors for authentication and supported tool catalogs. [Figma remote MCP](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/) · [Figma file and image endpoints](https://developers.figma.com/docs/rest-api/file-endpoints/) · [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp)

Project skill discovery, argument substitution, hook behavior and MCP environment expansion use Claude's documented formats. [Claude Code skills](https://code.claude.com/docs/en/skills) · [Claude MCP configuration](https://code.claude.com/docs/en/mcp) · [Claude hooks](https://code.claude.com/docs/en/hooks)
