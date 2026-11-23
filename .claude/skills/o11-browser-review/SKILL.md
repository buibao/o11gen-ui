---
name: o11-browser-review
description: Inspect the freshly published O11 screen with Playwright MCP and run deterministic visual and functional checks.
---

Inputs are an accepted merge, confirmed publication, deployment marker, selected frame PNGs and run plans. Load the [validation plan contract](../../../setup-docs/harness-evidence.md). Build design assertions independently of the rendered page. Attach stable node IDs and selectors, viewport-relative boxes in CSS pixels, expected computed typography/colors and critical assets. Record reasons for dynamic masks and genuinely inapplicable areas. Derive interaction steps and their expected outcomes solely from requirements.

After browser gate PASS, use the advertised Microsoft Playwright MCP tools to navigate the exact Test URL, check the new marker, inspect the accessibility tree, resize to relevant breakpoints and exercise specified controls on stable data. Collect compact observations keyed by node ID, including navigation, focus, stacking, wrapping, missing icons, unexpected resources and console errors. Reset test state for deterministic capture. A finding from MCP needs a repeatable assertion where possible. Resolve browser-only discrepancies or leave REVIEW_REQUIRED. An unavailable page, stale deployment or login redirect blocks validation.

Run `validate <config> <run>` using the harness CLI. It launches Playwright Test and saves each viewport's PNGs, per-area metrics and HTML. Read the summarized failures, then open only affected artifacts. Use `decision <config> <run>` even if the test exits nonzero. Stop for PASS, disabled validation, approval, unavailable evidence or a terminal repair decision. Retain every attempt and the run-level report.
