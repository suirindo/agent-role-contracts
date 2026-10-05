# Next public preview: 0.5.0-alpha.1

This is the release candidate guide. Registry publication and production runtime adoption remain separate acceptance steps. Check npm dist-tags before using a registry installation command; this document alone is not publication evidence.

## Architecture at a glance

| Layer | Implemented source capability | Boundary |
| --- | --- | --- |
| G0 — general core | Role, authority, task scope, independent-role review and handoff declaration checks; `/core` entrypoint | Declaration consistency; runtime identity and permissions belong to the consumer |
| G1 — task/action binding | SHA-256 subject binding over the complete bundle, task and declared action | Changed declarations invalidate the binding; no reviewer authentication or permission grant |
| G2 — explicit filesystem adapter | `/adapters/filesystem-write` maps `write_file`, relative path and declared `content_sha256` to the current subject | No filesystem writes, byte measurement or filesystem enforcement |
| G3 — lifecycle declarations | Run, review/approval, execution and artifact subject consistency | No event authentication, state machine, replay prevention or runtime acceptance |
| Optional profiles | Onchain finance and supported Safe CALL envelope declaration checks | Explicit finance import; no signing or broadcasting |
| Consumer runtime bridge | HOL Guard design and local prototype tracked in [issue #7](https://github.com/suirindo/agent-role-contracts/issues/7) | Production wiring awaits the integration ownership/boundary decision; ARC can only narrow runtime authority |

The progression is declaration checks → complete subject binding → explicit action mapping → lifecycle declarations → a consumer-owned enforcement boundary. See [ARCHITECTURE.md](ARCHITECTURE.md) for exact API/schema versions and limits.

## Run the implemented source

From a checkout of the reviewed candidate, using Node >=22.5:

```sh
npm run demo:general
npm run demo:binding
npm run demo:filesystem-adapter
npm run demo:lifecycle
```

These are offline synthetic examples. They perform declaration checks without executing the represented business actions. Existing v0.1 synchronous APIs and schemas remain compatible; the filesystem adapter is an explicit subpath, separate from the root facade and core. See [COMPATIBILITY.md](COMPATIBILITY.md).

## Publish and verify the preview

1. Accept PR #28's release-gate changes and this preview follow-up after the required independent reviews. Bind the final candidate commit, protected `v0.5.0-alpha.1` tag and tarball SHA-256 packed with npm 11.20.0. A changed candidate requires current evidence.
2. Verify npm Trusted Publisher configuration for this repository/workflow and `npm-publish` environment. Keep the required human reviewer and disabled admin bypass. Use the existing OIDC staging workflow; do not substitute a publishing token.
3. Dispatch the existing workflow against the protected tag with the exact commit/version/tarball hash. Review the verified artifact and derived `next` dist-tag before environment approval.
4. Read back the single staged artifact through an authenticated maintainer session, compare bytes with the receipt, and separately approve the exact stage ID with the required authentication. Reconcile an uncertain stage result before any retry.
5. Run the existing publication verifier with the exact version, commit and tarball SHA-256. It must verify registry bytes, npm/Sigstore provenance and workflow/commit identity, `next` pointing to the candidate, and `latest` not pointing to that preview.

After this readback succeeds, users can install the exact preview:

```sh
npm install @netsujo/agent-role-contracts@0.5.0-alpha.1
```

The stable package stays on its existing `latest` channel. The preview channel is `next`; stable releases use `latest`. Supported preview versions are `alpha.N`, `beta.N` or `rc.N` with a canonical nonnegative integer. Arbitrary channels, build metadata and malformed versions are rejected. This follow-up does not itself stage, approve, publish or wire HOL Guard into production.
