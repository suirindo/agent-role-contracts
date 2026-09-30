# Release process and authority boundaries

A public release is accepted only on exact public-candidate bytes after provenance/rights clearance, selected-file privacy review, deterministic/package/platform checks, and independent review. Publication remains a separate explicit human authority.

A validation PASS means only that the supplied declarations are internally consistent under the supported package profile. It does not authenticate runtime identity, grant execution authority, enforce a filesystem lock, verify source evidence, scan secrets, or implement full JSON Schema.

Release evidence is bound to the exact public HEAD and package artifact. Runtime adapters, actual agent execution, credentials, host permissions, provider calls and GUI control remain outside v0.1.0.
