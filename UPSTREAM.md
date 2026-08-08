# Upstream provenance

This standalone reviewer was extracted from the Grok Companion source at
`aee1171c2f346948feb2864784e13abe020dcb34`. Its Apache-2.0 `LICENSE` was copied
mechanically. `NOTICE` preserves and adapts the applicable OpenAI/codex-plugin-cc
attribution for this independent standalone project.

Two external donors constrain future provider and lifecycle work:

- `openai/codex-plugin-cc@db52e28f4d9ded852ab3942cea316258ae4ef346`:
  use its thin-integration and runtime-owned durable-lifecycle invariant. Adapt
  it to an App-only target boundary and durable hosted recovery. Reject its
  best-effort local cleanup-before-certain-termination pattern.
- `xai-org/grok-build`: contract audit
  `47348d13ec4508dcfe440e34c6d511bb02998fb2`; current source inspected at
  `afbc0fb710320c7add294c2106d447ecc3e3af2e`. Reuse executable attestation,
  isolated auth-home, owner-scoped cancellation, bounded termination, and reap
  contracts. Reject embedded ACP as a remote-service template and reject the
  absent service-IaC pattern.

The exact inspected files, adaptations, rejected patterns, and licensing
decisions are recorded in `docs/provenance/donors.md`. Those revisions are
design evidence, not runtime dependencies or local qualification.
