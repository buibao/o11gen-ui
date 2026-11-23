# Liquid Glass execution exception — 2026-11-23

This folder preserves the one-run exception explicitly approved for Demo_TH_Fabric / DesignReview when the current client did not intercept native MCP calls through its lifecycle hook. It is outside the harness source, standard tests, setup guides and skill routing.

- [Historical guard procedure](explicit-call-guard.md)
- [Inactive checker source](explicit-call.ts.snapshot)
- [Inactive unit test](unit.test.ts.snapshot) and [integration test](integration.spec.ts.snapshot)
- [Execution evidence and outcome](run-notes.md)

The `.snapshot` files preserve the implementation as it existed during that run. They are reference material, not runnable or supported entry points. The main harness uses its normal native-hook workflow and rejects the removed mode setting. The completed O11 changes and original run artifacts are retained.
