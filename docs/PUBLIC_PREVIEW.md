# Public preview: 0.5.0-alpha.1

Public preview `0.5.0-alpha.1` is published on npm under the `next` dist-tag. Stable `latest` remains `0.1.0`. Registry publication and production runtime adoption remain separate states; publication does not grant runtime authority or imply production use.

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

## Published preview

Publication completed on 2026-10-05 through npm staged publishing.

Verified state:

- package: `@netsujo/agent-role-contracts`
- version: `0.5.0-alpha.1`
- dist-tag: `next`
- stable `latest`: `0.1.0`
- release commit: `395ac5d9dfc607590fa2933a0903ecd03445d678`
- staged package shasum: `0ce7d38a73e9eaaffbca87bd67e5f1fbdab3eae3`
- GitHub Actions staging run: `37284758073`
- clean external install of `@netsujo/agent-role-contracts@next`: PASS

Install the preview:

```sh
npm install @netsujo/agent-role-contracts@next
```

For immutable selection:

```sh
npm install @netsujo/agent-role-contracts@0.5.0-alpha.1
```

The preview channel is `next`; stable releases use `latest`. Runtime enforcement, production adoption and HOL Guard integration remain separate work.
