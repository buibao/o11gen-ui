# Troubleshooting

| Observation | Action |
| --- | --- |
| Project skill missing in Claude | Start Claude from the checkout, trust the project and inspect /skills. Confirm .claude/skills/figma-to-o11/SKILL.md exists. |
| Figma reports NEEDS_APPROVAL | Use /mcp in the intended Claude session and authenticate the official remote endpoint. Check access to the selected node. The standalone doctor has no access to Claude's OAuth store. |
| Figma gives code or an inline image without exportable bytes | Use actual supported design context and screenshot capabilities. If enabled, the scoped REST fallback downloads the versioned PNG. Set REVIEW_REQUIRED or BLOCKED if the real reference cannot be acquired. |
| Studio handshake fails or endpoint mismatch | Check Studio is open and its MCP server is enabled. Compare O11_MCP_ENDPOINT to outsystems.mcpEndpoint and restart Claude after changing the environment. Follow the upstream contract compatibility guide. |
| Wrong module, ambiguous tab or environment | Stop writes. Select the intended Test Module and verify its key and environment independently. Renew scoped identity evidence. |
| Hook denies or is unavailable | Verify /hooks, workspace trust, npm ci and that begin used this Claude session's ID. Compare the requested address/path to attempt evidence. Use the scoped native integration. |
| Apply error, empty mutation path or unexpected widget name | Inspect the official skill's compilation, crash and readback guidance. Preserve the working-copy state. Record BLOCKED when validation or intended semantics cannot be established. |
| Merge rejected or publish permission denied | Inspect Studio's dialog and actual result. Keep denied publication as NEEDS_APPROVAL. Resume only with actual permission and matching run evidence. |
| Login redirect or stale deployment marker | Supply the correct Test login and canonical URL. Verify the expected marker belongs to the successful release. Review old/new evidence before capturing. |
| Browser launch fails | Install the configured Playwright Test browser. The checked-in MCP configuration uses installed Microsoft Edge. Verify the executable and npm ci installation. |
| Reference/viewport mismatch, missing fonts or assets | Match export scale, logical frame dimensions and breakpoint. Install the design fonts and resolve required resources. Incomplete evidence yields REVIEW_REQUIRED. |
| Browser mismatch persists | Inspect the per-element metric and difference image; identify the source node. Verify source expectations and runtime data. Record the unresolved evidence when the controller stops. |
| Invalid local JSON or missing evidence | The CLI returns BLOCKED with validation field paths when available. Compare the current attempt and config with the evidence contract. Keep secrets out of diagnostics. |

The upstream [OML contract](../servicestudio-mcp-oml/SKILL.md) and [contract compatibility guide](../servicestudio-mcp-oml/reference/contracts.md) cover server-specific recovery. The [evidence contract](harness-evidence.md) describes resumable approvals, terminal statuses and required fields.
