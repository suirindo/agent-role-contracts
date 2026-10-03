# Filesystem-write mapping example

G0, G1 and G2 are merged and implemented in repository main. G2 PR #17 merged as `2b20851bdd9b7fd6823f5bd606f3d2f6345459ff`, this branch’s merge base. G2 filesystem-write remains an optional explicit `/adapters/filesystem-write` subpath and is not re-exported from root or `/core`. G3 builds on merged G2 and is the current unreleased candidate pending independent review and hosted acceptance; G2 sequencing is no longer a blocker. Source merge does not imply npm publication, production adoption, runtime permission or deployment; G3 is not merged or published.

G2 filesystem-write is merged and implemented in repository main; no npm publication or production adoption is claimed. G3 lifecycle builds on merged G2 and remains an unreleased candidate pending independent review and hosted acceptance.

Run from the repository root with Node.js 22.5 or newer:

```sh
npm run demo:filesystem-adapter
```

The executable demo reads only the existing generic JSON fixtures and reuses `makeScenario` from the cross-domain examples. It never opens or writes the declared target files.

| Scenario | Declared target | Mapping mutation | Required diagnostic |
| --- | --- | --- | --- |
| Software change | `src/example.mjs` | Path becomes `private/not-assigned.txt` | `G2_PATH_MISMATCH` and `G2_TASK_SCOPE` |
| Data cleaning | `reports/cleaned.csv` | Content digest changes | `G2_CONTENT_MISMATCH` |
| Support drafting | `drafts/reply.md` | Path becomes `private/not-assigned.txt` | `G2_PATH_MISMATCH` and `G2_TASK_SCOPE` |

Each scenario creates a task and a G1 action with kind `filesystem-write`, schema version `0.3`, and exactly `{path, content_sha256}` parameters. `describeTaskAction` supplies the complete G1 subject digest. A mapping with schema version `0.1` declares that subject, operation `write_file`, and the same path and content digest. The demo requires a matching PASS before corrupting only the mapping and requiring the diagnostics above. Six expected outcomes exit 0; an unexpected result exits 2. The path mutations may also produce a no-eligible-writer diagnostic.

The optional integration API is:

```js
import { validateFilesystemWriteMapping } from '@netsujo/agent-role-contracts/adapters/filesystem-write';
const result = await validateFilesystemWriteMapping(bundleJson, taskJson, actionJson, mappingJson);
```

The demo uses the source import `../../src/filesystem-write-adapter.mjs`. Profile `filesystem-write/0.1` supports exactly one operation, `write_file`, and refuses unknown parameters or semantics. The published npm release is not claimed to contain this optional subpath. Existing portable scope semantics make filesystem-write a concrete first adapter across software, data and support without industry schemas; this does not establish arbitrary SaaS, database, API or other resource semantics.

`content_sha256` is a caller-supplied declared integrity identity. The example uses fictional SHA-256 strings, not hashes computed from output bytes. No filesystem write occurs, bytes are not verified, and filesystem state and path existence are not checked. Executor identity is not authenticated and permissions are not enforced. Mapping PASS means declaration consistency, not permission, execution or review approval. G1 review/approval binding is separate; this demo supplies no binding and the adapter invents no approval. Finance and Safe remain optional profiles.
