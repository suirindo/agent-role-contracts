# Release process and authority boundaries

A public release is accepted only on exact public-candidate bytes after provenance/rights clearance, selected-file privacy review, deterministic/package/platform checks, and independent review. Publication remains a separate explicit human authority.

A validation PASS means only that the supplied declarations are internally consistent under the supported package profile. It does not authenticate runtime identity, grant execution authority, enforce a filesystem lock, verify source evidence, scan secrets, or implement full JSON Schema.

Release evidence is bound to the exact public HEAD and package artifact. Runtime execution, credentials, host permissions, provider calls, GUI control and enforcement remain outside v0.5.0. The explicit filesystem-write adapter maps declarations only; it does not perform writes or grant permission.

## Packed README consistency before publication

Run `npm run check` and `npm run pack:smoke` on the frozen candidate before any publication decision. The existing pack smoke installs the generated tarball into a clean offline consumer and checks both `README.md` and `README.ja.md` from that installed payload, not from the checkout.

For a candidate whose declared `publishConfig.tag` is `latest` (including the npm default), explicit current-version assertions must agree with the packed `package.json` version. The regression guard recognizes the documented English/Japanese stable-line and present-tense latest assertions, including the former stale Install sentence. It retains historical version references, past-tense release notes, immutable example pins and fenced examples. It is a bounded textual guard, not proof that all prose is semantically correct. A non-latest preview may describe a different stable release; its registry channel still requires separate review.

Missing or empty packed READMEs, a wrong package identity, and a prerelease presented as the latest stable candidate fail this check. Tests pack a stale README, repair only its source, confirm that the old tarball still fails, and verify that repacking the corrected source passes.

This gate neither queries nor changes npm dist-tags, releases a version, or repairs an already-published package. Keep the existing publication authority and independent review. After an authorized release, read back the registry dist-tags, distributed README, npm package page and Netsujo product pages before claiming public consistency.
