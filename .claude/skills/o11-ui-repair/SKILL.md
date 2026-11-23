---
name: o11-ui-repair
description: Repair a measured component mismatch from a failed published O11 validation attempt.
---

Require a completed attempt with decision.action=repair. Inspect its metrics and difference image. Trace the failed viewport and check ID to a mapped Figma node and concrete O11 element. Record viewport, failedId, nodeId, o11Element, cause and correction in the next attempt's repair.json. For a pixel-only failure, use the viewport check ID and identify the component from the difference image. Keep the reference and requirements fixed. For unsupported behavior or uncertain design intent, record BLOCKED or REVIEW_REQUIRED and stop.

Change the smallest responsible property, container layout, token/class, reference or resource. Use o11-test-ui again with fresh module selection, new scoped before/readback evidence, fresh permissions and a new deployment marker. Use o11-browser-review for affected elements first and the full configured regression. The controller permits at most the configured number of repairs (default three) and stops on no measurable improvement. Report the measured change, remaining failures and per-attempt artifacts.
