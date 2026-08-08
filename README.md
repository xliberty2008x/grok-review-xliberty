# Grok Review Xliberty

Private standalone runtime for the review service.

The root npm scripts are the only supported developer entry points. Workspace
packages are private implementation units and must not be published to npm.

See [component boundaries](docs/architecture/component-boundaries.md) for the
dependency and deployment ownership rules.

## Hosted review service

This private repository owns the `grok-review-xliberty` Worker, immutable
Actions runner, App operations, release assets, and Grok auth watcher. Target
repositories install the GitHub App; they do not copy this workflow or store
its provider credential.
