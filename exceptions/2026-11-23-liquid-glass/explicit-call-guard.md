# Archived exception: explicit per-call guard

Historical record of the operator-approved Liquid Glass run on 2026-11-23. This is not part of the supported harness workflow. The checker and tests are preserved as inactive `.snapshot` files in this folder; the main CLI, config schema and skills do not expose this mode. The commands below describe the historical implementation and are not current commands.

## Historical procedure

This alternative is available only when the operator explicitly approves it after native MCP interception cannot be established. It is not an automatic lifecycle hook. Native-hook mode remains the default. Do not activate this alternative from a general request to continue, and never record a local guard check as proof of native hook interception.

Before requesting approval, provide the exact target and pending screen plan, explain that this mode checks the calls explicitly rather than intercepting them automatically, and retain existing merge/publication settings. For the Liquid Glass work, the prepared target is Demo_TH_Fabric / DesignReview and the source frame is 1:2. This mode does not authorize publication.

After explicit approval, set execution.guardMode to explicit-call in a new run's config. Use the actual matching CODEX_THREAD_ID and CODEX_SESSION_ID from the running client to bind that run with begin ... codex. No SessionStart event is fabricated. Record the approval source in run notes and set explicitCallGuardAuthorized=true in the attempt evidence only after the actual approval. All other generation, mapping, ownership, validation, merge and publication gates still apply.

For each mutating native MCP call:

1. Construct one immutable request object containing tool_name and tool_input.input. Save it under the ignored run directory without sessionToken. The official input envelope, exact module address, code/imports and merge path must be present as appropriate.
2. Immediately run `npm run harness -- check-call <config> <run> <request.json>`. A nonzero exit, missing PASS receipt, mismatched run/session/tool or changed payload prevents the native call. Retain the request hash and receipt.
3. In the same orchestration operation, pass that exact immutable input object to the named native Service Studio MCP tool, adding the in-memory sessionToken at top level. Do not reconstruct, trim or change the checked input. Do not run any evidence/config mutations between the check and the native call. A changed input requires another check.
4. Capture the real result, update ownership/path/readback evidence and proceed under the normal phase gates. Stop on a denied check or unresolved native result. Calls that pass this local check still require Service Studio permissions.

The checker neither invokes MCP nor authorizes operations on its own. It uses the same guard as the native hooks and refuses missing operator approval, a different current session/run, wrong module, malformed lambda, unverified merge path or unmet release gates. An assistant that omits the explicit check is not mechanically intercepted in this mode; the operator must understand and approve that distinction.
