# Component boundaries

## Dependency direction

Dependencies flow in one direction only:

```text
apps/control-plane ─┐
                    ├──> packages/contracts
apps/review-runner ─┼──> packages/reviewer ────> packages/contracts
                    └──> packages/grok-executor -> packages/contracts

policy/ (committed review-policy artifacts) --> packages/grok-executor as data
```

`apps/control-plane` and `apps/review-runner` are deployable entry points.
`packages/contracts` is the innermost shared contract layer.
`packages/reviewer` owns exact-head collection and GitHub publication.
`packages/grok-executor` loads and validates the committed artifacts in
`policy/` for model execution, then adapts Grok execution to contracts. Imports
may only follow the arrows above: applications may import packages, `reviewer`
and `grok-executor` may import `contracts`, and `contracts` imports neither
application nor service package. Reverse imports, peer-layer imports, and
app-to-app imports are prohibited. `policy/` contains data artifacts only; it
does not import code.

Platform adapters stay at the outer edge. Cloudflare and Grok details must not
cross into `packages/contracts` or the committed policy artifacts.

## Deployment ownership

Terraform owns only D1 lifecycle. It must not manage account-level resources,
settings, or any Worker surface.

Wrangler owns Worker versions, Worker configuration, bindings, cron schedules,
secrets, and checked-in migrations. Terraform must not package, configure, or
deploy Worker code. Wrangler must not create, replace, or manage the D1
lifecycle. The shared boundary is an explicit D1 binding identifier consumed by
the Worker configuration; neither tool owns the other tool's state.
