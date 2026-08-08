# Grok Review Xliberty contributor guidance

## Donor-first rule

Before designing or changing provider, ACP, lifecycle, process, worktree, or
control-plane behavior, inspect both donors recorded in `UPSTREAM.md` and
`docs/provenance/donors.md`:

- `openai/codex-plugin-cc` at the exact recorded revision;
- `xai-org/grok-build` at the contract-audit revision, then current source.

For each change, record the exact revision, inspected files, useful invariant,
local adaptation, and rejected or missing pattern. Reuse compatible contracts
and invariants, not incompatible machinery. Preserve Apache-2.0 attribution
and all applicable package notices. Donor evidence is design input and never
substitutes for deterministic tests or a real installed lifecycle.

The evidence record is mandatory: a provider/lifecycle design or implementation
without both donor inspections and those five recorded fields fails review.

## Parity and qualification

Preserve the frozen runtime and 105-test identity manifest during the parity
migration. Any non-mechanical test change requires an explicit approved
contract-delta reason. Stable tracked files contain no deployment coordinates,
protected identifiers, credentials, or secret values.

Report implementation completeness separately from live qualification. Mocks,
fixtures, local capture, provider construction, or a clean diff do not qualify
the App lifecycle. Qualification requires the agreed real GitHub App to Worker
to D1 to immutable runner to Grok to App-authored output path and its durable
receipts.
